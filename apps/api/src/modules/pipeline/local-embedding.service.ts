import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { ModelUsage } from './pipeline.types';
import { resolveFromRepo } from '../../common/repo-paths';
import { assertSearchActive, searchSignal, SearchDeadlineError } from '../../common/search-deadline';
import {metaEmbeddings,META_EMBEDDING_MODEL} from '../../common/meta-only-profile';

export interface EmbeddingResult {
  values: number[];
  usage: ModelUsage;
}

export interface BatchEmbeddingResult {
  vectors: number[][];
  usage: ModelUsage;
}

interface WorkerResult {
  model: string;
  dimensions: number;
  duration_ms: number;
  vectors: number[] | number[][];
}

@Injectable()
export class LocalEmbeddingService implements OnModuleDestroy {
  private readonly logger = new Logger(LocalEmbeddingService.name);
  private worker?: ChildProcessWithoutNullStreams;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  private pending = new Map<string, {
    resolve: (value: WorkerResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    count: number;
    single: boolean;
    detachAbort: () => void;
  }>();

  constructor(private readonly configService: ConfigService) {}

  getPythonBinary(): string | null {
    if(metaEmbeddings(this.configService)){const binary=resolveFromRepo(this.configService.get('META_EMBEDDING_PYTHON_PATH',process.platform==='win32'?'.venv-mms/Scripts/python.exe':'.venv-mms/bin/python'));return fs.existsSync(binary)?binary:null;}
    const explicitPath = this.configService.get<string>('WHISPER_PYTHON_PATH');
    if (explicitPath && fs.existsSync(explicitPath)) {
      return explicitPath;
    }

    const venvWindows = resolveFromRepo(
      'services/whisper-transcriber/.venv/Scripts/python.exe',
    );
    const venvLinux = resolveFromRepo(
      'services/whisper-transcriber/.venv/bin/python',
    );

    if (fs.existsSync(venvWindows)) return venvWindows;
    if (fs.existsSync(venvLinux)) return venvLinux;

    return process.platform === 'win32' ? 'python' : 'python3';
  }

  getScriptPath(): string {
    if(metaEmbeddings(this.configService))return resolveFromRepo('services/meta-embeddings/serve.py');
    return resolveFromRepo('services/whisper-transcriber/embed.py');
  }

  isAvailable(): boolean {
    const scriptPath = this.getScriptPath();
    if (!fs.existsSync(scriptPath)) {
      return false;
    }
    const pythonBin = this.getPythonBinary();
    return Boolean(pythonBin);
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.stopWorker(new Error('Local embedding service stopped'));
  }

  private stopWorker(error: Error): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const worker = this.worker;
    this.worker = undefined;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.detachAbort();
      request.reject(error);
    }
    this.pending.clear();
    worker?.kill();
  }

  private armIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.pending.size) return;
    const configured = Number(this.configService.get('LOCAL_EMBEDDING_IDLE_MS', metaEmbeddings(this.configService)?300000:60000));
    const timeout = Number.isFinite(configured) && configured > 0 ? configured : 60000;
    this.idleTimer = setTimeout(() => this.stopWorker(new Error('Embedding worker idle')), timeout);
    this.idleTimer.unref();
  }

  private ensureWorker(): ChildProcessWithoutNullStreams {
    if (this.destroyed) throw new Error('Local embedding service stopped');
    if (this.worker) return this.worker;
    const pythonBin = this.getPythonBinary();
    const scriptPath = this.getScriptPath();
    if (!pythonBin || !fs.existsSync(scriptPath)) {
      throw new Error(`Local embedding engine not available at: ${scriptPath}`);
    }
    if (!metaEmbeddings(this.configService)&&this.configService.get('LOCAL_EMBEDDING_MODEL', 'all-MiniLM-L6-v2') !== 'all-MiniLM-L6-v2') {
      throw new Error('Unsupported local embedding model; keep query and corpus embedding spaces compatible');
    }
    const child = spawn(pythonBin, [scriptPath, '--serve'], { windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env,
        PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1',
        META_EMBEDDING_MODEL_DIR:resolveFromRepo(this.configService.get('META_EMBEDDING_MODEL_DIR','storage/meta-embeddings')),
        META_EMBEDDING_THREADS:String(this.configService.get('META_EMBEDDING_THREADS',4)),
        LOCAL_EMBEDDING_ALLOW_DOWNLOAD: String(this.configService.get('LOCAL_EMBEDDING_ALLOW_DOWNLOAD', 'false')) } });
    this.worker = child;
    let buffer = '';
    const fail = () => {
      if (this.worker === child) this.stopWorker(new Error('Local embedding worker failed'));
    };
    child.on('error', fail);
    child.on('close', fail);
    child.stdin.on('error', fail);
    child.stderr.on('data', () => undefined); // Drain diagnostics without retaining private content.
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (this.worker !== child) return;
      buffer += chunk;
      if (buffer.length > 8 * 1024 * 1024) { fail(); return; }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          const response = JSON.parse(line);
          const request = this.pending.get(response.id);
          if (!request) throw new Error('Unexpected embedding response ID');
          this.pending.delete(response.id);
          clearTimeout(request.timer);
          request.detachAbort();
          if (response.error) request.reject(new Error('Local embedding request failed'));
          else {
            const vectors = response.vectors;
            const expectedModel=metaEmbeddings(this.configService)?META_EMBEDDING_MODEL:'all-MiniLM-L6-v2',expectedDimensions=metaEmbeddings(this.configService)?1024:384;
            if (response.model !== expectedModel || response.dimensions !== expectedDimensions ||
              !Array.isArray(vectors) || vectors.length !== request.count ||
              !vectors.every((v: unknown) => Array.isArray(v) && v.length === expectedDimensions &&
                v.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)))) {
              request.reject(new Error('Invalid local embedding vectors'));
            } else request.resolve({ ...response, vectors: request.single ? vectors[0] : vectors });
          }
        } catch { fail(); return; }
      }
      this.armIdleTimer();
    });
    return child;
  }

  private async runPythonEmbed(inputJson: string): Promise<WorkerResult> {
    assertSearchActive();
    const parsed = JSON.parse(inputJson);
    const single = !Array.isArray(parsed);
    const texts = single ? [parsed] : parsed;
    if (!texts.length || texts.length > 64 || !texts.every((text: unknown) => typeof text === 'string') ||
      Buffer.byteLength(inputJson) > 1024 * 1024) throw new Error('Local embedding input limit exceeded');
    if (this.pending.size >= 32) throw new Error('Local embedding worker queue full');
    const child = this.ensureWorker();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const timeout = Number(this.configService.get('LOCAL_EMBEDDING_TIMEOUT_MS', 60000));
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300000) {
      this.armIdleTimer();
      throw new Error('Invalid LOCAL_EMBEDDING_TIMEOUT_MS');
    }
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        // Stop the busy worker too; do not leave timed-out inference running behind a retry.
        if (this.worker === child) this.stopWorker(new Error('Local embedding deadline exceeded'));
      }, timeout);
      const signal = searchSignal();
      const abort = () => {
        if (this.pending.has(id)) this.stopWorker(new SearchDeadlineError());
      };
      this.pending.set(id, { resolve, reject, timer, single, count: texts.length,
        detachAbort: () => signal?.removeEventListener('abort', abort) });
      signal?.addEventListener('abort', abort, { once: true });
      child.stdin.write(JSON.stringify({ id, texts }) + '\n', (error) => {
        if (error && this.worker === child) {
          this.stopWorker(new Error('Local embedding worker input failed'));
        }
      });
    });
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const t0 = Date.now();
    try {
      const res = await this.runPythonEmbed(JSON.stringify(text));
      const vector = Array.isArray(res.vectors) && typeof res.vectors[0] === 'number'
        ? (res.vectors as number[])
        : (res.vectors[0] as number[]);

      const durationMs = Date.now() - t0;
      return {
        values: vector || [],
        usage: {
          stage: 'embedding',
          provider: metaEmbeddings(this.configService)?'meta-local':'local-onnx',
          model: res.model || (metaEmbeddings(this.configService)?META_EMBEDDING_MODEL:'all-MiniLM-L6-v2'),
          inputTokens: Math.ceil(text.length / 4),
          outputTokens: 0,
          estimatedUsd: 0.0,
          durationMs,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Local embedding failed: ${msg}`);
      throw err;
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return {
        vectors: [],
        usage: {
          stage: 'embedding',
          provider: metaEmbeddings(this.configService)?'meta-local':'local-onnx',
          model: metaEmbeddings(this.configService)?META_EMBEDDING_MODEL:'all-MiniLM-L6-v2',
          inputTokens: 0,
          outputTokens: 0,
          estimatedUsd: 0.0,
          durationMs: 0,
        },
      };
    }

    const t0 = Date.now();
    try {
      const res = await this.runPythonEmbed(JSON.stringify(texts));
      const vectors = res.vectors as number[][];
      const durationMs = Date.now() - t0;
      const totalChars = texts.reduce((acc, t) => acc + (t || '').length, 0);

      return {
        vectors,
        usage: {
          stage: 'embedding',
          provider: metaEmbeddings(this.configService)?'meta-local':'local-onnx',
          model: res.model || (metaEmbeddings(this.configService)?META_EMBEDDING_MODEL:'all-MiniLM-L6-v2'),
          inputTokens: Math.ceil(totalChars / 4),
          outputTokens: 0,
          estimatedUsd: 0.0,
          durationMs,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Local batch embedding failed: ${msg}`);
      throw err;
    }
  }
}
