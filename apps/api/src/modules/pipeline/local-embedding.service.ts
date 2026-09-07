import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ModelUsage } from './pipeline.types';
import { resolveFromRepo } from '../../common/repo-paths';

export interface EmbeddingResult {
  values: number[];
  usage: ModelUsage;
}

export interface BatchEmbeddingResult {
  vectors: number[][];
  usage: ModelUsage;
}

@Injectable()
export class LocalEmbeddingService {
  private readonly logger = new Logger(LocalEmbeddingService.name);

  constructor(private readonly configService: ConfigService) {}

  getPythonBinary(): string | null {
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

  /**
   * Run embed.py via stdin to bypass OS command line length limits.
   */
  private async runPythonEmbed(inputJson: string): Promise<{
    model: string;
    dimensions: number;
    duration_ms: number;
    vectors: number[] | number[][];
  }> {
    const pythonBin = this.getPythonBinary();
    const scriptPath = this.getScriptPath();

    if (!pythonBin || !fs.existsSync(scriptPath)) {
      throw new Error(`Local embedding engine not available at: ${scriptPath}`);
    }

    return new Promise((resolve, reject) => {
      const child = spawn(pythonBin, [scriptPath], {
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn embed.py: ${err.message}`));
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`embed.py exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const trimmed = stdout.trim();
          const start = trimmed.indexOf('{');
          const end = trimmed.lastIndexOf('}');
          if (start >= 0 && end > start) {
            const parsed = JSON.parse(trimmed.slice(start, end + 1));
            resolve(parsed);
          } else {
            reject(new Error(`Invalid JSON from embed.py: ${stdout.slice(0, 200)}`));
          }
        } catch (parseErr) {
          reject(new Error(`JSON parse error from embed.py: ${stdout.slice(0, 200)}`));
        }
      });

      // Write payload to stdin and close
      child.stdin.write(inputJson);
      child.stdin.end();
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
          provider: 'local-onnx',
          model: res.model || 'all-MiniLM-L6-v2',
          inputTokens: Math.ceil(text.length / 4),
          outputTokens: 0,
          estimatedUsd: 0.0,
          durationMs: res.duration_ms || durationMs,
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
          provider: 'local-onnx',
          model: 'all-MiniLM-L6-v2',
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
          provider: 'local-onnx',
          model: res.model || 'all-MiniLM-L6-v2',
          inputTokens: Math.ceil(totalChars / 4),
          outputTokens: 0,
          estimatedUsd: 0.0,
          durationMs: res.duration_ms || durationMs,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Local batch embedding failed: ${msg}`);
      throw err;
    }
  }
}
