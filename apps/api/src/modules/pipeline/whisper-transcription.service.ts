import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
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

@Injectable()
export class WhisperTranscriptionService {
  private readonly logger = new Logger(WhisperTranscriptionService.name);

  constructor(private readonly configService: ConfigService) {}

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
