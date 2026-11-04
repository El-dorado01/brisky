import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { ModelUsage, TranscriptCue } from './pipeline.types';
import { resolveFromRepo } from '../../common/repo-paths';

const execFileAsync = promisify(execFile);

export interface WhisperTranscriptionResult {
  transcript: TranscriptCue[];
  usage: ModelUsage;
  language?: string;
  languageProbability?: number;
}
export interface WhisperSession {
  transcribeAudio(audio: string, signal?: AbortSignal): Promise<WhisperTranscriptionResult>;
  close(): Promise<void>;
}

@Injectable()
export class WhisperTranscriptionService implements OnModuleDestroy {
  private readonly logger = new Logger(WhisperTranscriptionService.name);
  private readonly sessions = new Set<() => Promise<void>>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleDestroy() { await Promise.allSettled([...this.sessions].map((close) => close())); }

  /** One job owns one model process; requests are deliberately serialized. */
  createSession(): WhisperSession {
    const binary = this.getPythonBinary();
    if (!binary) throw new Error('Local Whisper runtime is unavailable');
    const model = this.configService.get<string>('WHISPER_MODEL', 'base');
    const args = [this.getScriptPath(), '--serve', '--model', model, '--device', this.configService.get('WHISPER_DEVICE', 'cpu'),
      '--compute_type', this.configService.get('WHISPER_COMPUTE_TYPE', 'int8'), '--task', this.configService.get('WHISPER_TASK', 'transcribe')];
    const language = this.configService.get<string>('WHISPER_LANGUAGE', '').trim();
    if (language) args.push('--language', language);
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let closed = false, buffer = '', sequence = 0;
    let pending: { id: number; resolve(value: WhisperTranscriptionResult): void; reject(error: Error): void } | undefined;
    let finish!: () => void;
    const exited = new Promise<void>((resolve) => { finish = resolve; });
    const fail = (error: Error) => { closed = true; pending?.reject(error); pending = undefined; child.kill('SIGKILL'); };
    child.once('error', (error) => fail(error));
    child.once('close', () => { fail(new Error('Whisper session stopped')); finish(); });
    child.stdin.on('error', (error) => fail(error));
    child.stderr.on('data', () => {}); // Drain diagnostics; do not let verbose runtime output block inference.
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 4 * 1024 * 1024) { fail(new Error('Whisper response exceeded protocol limit')); return; }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        try {
          const response = JSON.parse(line);
          if (!pending || response.id !== pending.id) {
            throw new Error('Whisper window request failed or returned an invalid response');
          }
          if (response.ok !== true) throw new Error(`Whisper window failed: ${String(response.error || 'unknown local error').slice(0, 500)}`);
          if (!Array.isArray(response.result?.cues)) throw new Error('Whisper returned an invalid response');
          const result = response.result;
          if (result.cues.some((cue: any) => typeof cue.text !== 'string' || !Number.isFinite(cue.start_time) ||
            !Number.isFinite(cue.end_time) || cue.start_time < 0 || cue.end_time <= cue.start_time)) {
            throw new Error('Whisper returned invalid cue timestamps');
          }
          const request = pending; pending = undefined;
          request.resolve({ transcript: result.cues, language: result.language, languageProbability: result.language_probability,
            usage: { stage: 'transcription', provider: 'faster-whisper', model: `whisper-${result.model || model}`,
              inputTokens: 0, outputTokens: result.cues.length, estimatedUsd: 0, durationMs: result.inference_duration_ms || 0 } });
        } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
      }
    });
    const close = async () => {
      this.sessions.delete(close);
      if (!closed) fail(new Error('Whisper session closed'));
      await exited;
    };
    this.sessions.add(close);
    return { close, transcribeAudio: async (audio: string, signal?: AbortSignal) => {
      if (closed || pending) throw new Error('Whisper session is closed or busy');
      signal?.throwIfAborted();
      if (!fs.existsSync(audio)) throw new Error('Whisper window file is missing');
      const started = Date.now();
      const abort = () => fail(new Error('Whisper window cancelled'));
      const timer = setTimeout(() => fail(new Error('Whisper window deadline exceeded')), 900000);
      signal?.addEventListener('abort', abort, { once: true });
      try {
        const result = await new Promise<WhisperTranscriptionResult>((resolve, reject) => {
          pending = { id: ++sequence, resolve, reject };
          child.stdin.write(JSON.stringify({ id: sequence, audio }) + '\n');
        });
        result.usage.durationMs = Date.now() - started;
        return result;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    } };
  }

  /**
   * Find the Python executable with faster-whisper installed.
   * Prefers the project local virtual environment, then system Python.
   */
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
    return resolveFromRepo('services/whisper-transcriber/transcribe.py');
  }

  isAvailable(): boolean {
    const scriptPath = this.getScriptPath();
    if (!fs.existsSync(scriptPath)) {
      return false;
    }
    const pythonBin = this.getPythonBinary();
    return Boolean(pythonBin);
  }

  async transcribeAudio(audioPath: string): Promise<WhisperTranscriptionResult> {
    const pythonBin = this.getPythonBinary();
    const scriptPath = this.getScriptPath();

    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file missing; cannot transcribe: ${audioPath}`);
    }
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Whisper transcription script missing at: ${scriptPath}`);
    }
    if (!pythonBin) {
      throw new Error('Python binary not found for faster-whisper execution.');
    }

    const model = this.configService.get<string>('WHISPER_MODEL', 'base');
    const device = this.configService.get<string>('WHISPER_DEVICE', 'cpu');
    const computeType = this.configService.get<string>('WHISPER_COMPUTE_TYPE', 'int8');
    const task = this.configService.get<string>('WHISPER_TASK', 'transcribe');
    const language = this.configService.get<string>('WHISPER_LANGUAGE', '').trim();

    const args: string[] = [
      scriptPath,
      '--audio',
      audioPath,
      '--model',
      model,
      '--device',
      device,
      '--compute_type',
      computeType,
      '--task',
      task,
    ];

    if (language) {
      args.push('--language', language);
    }

    this.logger.log(
      `Starting faster-whisper transcription for ${path.basename(audioPath)} (model: ${model}, device: ${device}, compute: ${computeType}, task: ${task})`,
    );

    const t0 = Date.now();
    let stdout = '';
    let stderr = '';

    try {
      const result = await execFileAsync(pythonBin, args, {
        maxBuffer: 64 * 1024 * 1024,
        timeout: 900000, // 15 min max timeout
        windowsHide: true,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err) {
      const execErr = err as { stdout?: string; stderr?: string; message?: string };
      stdout = execErr.stdout || '';
      stderr = execErr.stderr || execErr.message || '';
      this.logger.error(`faster-whisper process failed: ${stderr}`);
      throw new Error(`faster-whisper execution error: ${stderr || execErr.message}`);
    }

    if (stderr && stderr.trim().length > 0) {
      this.logger.debug(`faster-whisper stderr: ${stderr.slice(0, 500)}`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      // Find outermost JSON object
      const start = stdout.indexOf('{');
      const end = stdout.lastIndexOf('}');
      if (start >= 0 && end > start) {
        parsed = JSON.parse(stdout.slice(start, end + 1));
      } else {
        throw new Error(`Invalid JSON output from faster-whisper: ${stdout.slice(0, 300)}`);
      }
    }

    const durationMs = Date.now() - t0;
    const rawCues: any[] = Array.isArray(parsed.cues) ? parsed.cues : [];

    const transcript: TranscriptCue[] = rawCues.map((c) => ({
      start_time: Number(c.start_time || 0),
      end_time: Number(c.end_time || 0),
      text: String(c.text || '').trim(),
    })).filter((c) => c.text.length > 0);

    const usage: ModelUsage = {
      stage: 'transcription',
      provider: 'faster-whisper',
      model: `whisper-${parsed.model || model}`,
      inputTokens: 0,
      outputTokens: transcript.length,
      estimatedUsd: 0.0, // 100% Free Local Execution
      durationMs: parsed.inference_duration_ms || durationMs,
    };

    this.logger.log(
      `faster-whisper complete for ${path.basename(audioPath)}: ${transcript.length} cues produced in ${(durationMs / 1000).toFixed(1)}s (language: ${parsed.language}, confidence: ${parsed.language_probability})`,
    );

    return {
      transcript,
      usage,
      language: parsed.language,
      languageProbability: parsed.language_probability,
    };
  }
}
