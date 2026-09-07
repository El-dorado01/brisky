import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ffmpeg from 'fluent-ffmpeg';
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import * as ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Immediately register bundled binaries synchronously as defaults to prevent any race condition
if (ffmpegInstaller.path) {
  try {
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  } catch {
    /* ignore */
  }
}
if (ffprobeInstaller.path) {
  try {
    ffmpeg.setFfprobePath(ffprobeInstaller.path);
  } catch {
    /* ignore */
  }
}

@Injectable()
export class FfmpegService implements OnModuleInit {
  private readonly logger = new Logger(FfmpegService.name);
  private ffmpegPath: string | null = ffmpegInstaller.path || null;
  private ffprobePath: string | null = ffprobeInstaller.path || null;
  private versionInfo = 'Bundled installer';
  private initialized = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initializePaths();
  }

  private async tryBinary(bin: string): Promise<string | null> {
    try {
      const quoted = bin.includes(' ') ? `"${bin}"` : bin;
      const { stdout } = await execAsync(`${quoted} -version`);
      const line = stdout.split('\n')[0]?.trim();
      return line || null;
    } catch {
      return null;
    }
  }

  private async initializePaths() {
    const ffmpegCandidates = [
      this.configService.get<string>('FFMPEG_PATH'),
      'ffmpeg',
      ffmpegInstaller.path,
    ].filter((value): value is string => Boolean(value));

    for (const candidate of ffmpegCandidates) {
      const version = await this.tryBinary(candidate);
      if (version) {
        this.ffmpegPath = candidate;
        this.versionInfo = version;
        this.logger.log(`Using FFmpeg: ${version} (${candidate})`);
        break;
      }
    }

    const ffprobeCandidates = [
      this.configService.get<string>('FFPROBE_PATH'),
      'ffprobe',
      ffprobeInstaller.path,
    ].filter((value): value is string => Boolean(value));

    for (const candidate of ffprobeCandidates) {
      const version = await this.tryBinary(candidate);
      if (version) {
        this.ffprobePath = candidate;
        this.logger.log(`Using FFprobe at ${candidate}`);
        break;
      }
    }

    if (this.ffmpegPath) {
      ffmpeg.setFfmpegPath(this.ffmpegPath);
    }
    if (this.ffprobePath) {
      ffmpeg.setFfprobePath(this.ffprobePath);
    }

    if (!this.ffmpegPath) {
      this.logger.warn(
        'No working FFmpeg binary found. Set FFMPEG_PATH, install ffmpeg on PATH, or keep @ffmpeg-installer/ffmpeg installed.',
      );
    }

    this.initialized = true;
  }

  getFfmpegPath(): string | null {
    return this.ffmpegPath;
  }

  getFfprobePath(): string | null {
    return this.ffprobePath;
  }

  async getVersion(): Promise<{
    available: boolean;
    version: string;
    path: string;
  }> {
    if (!this.initialized) {
      await this.initializePaths();
    }
    return {
      available: Boolean(this.ffmpegPath),
      version: this.versionInfo,
      path: this.ffmpegPath ?? 'none',
    };
  }
}
