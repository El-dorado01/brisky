import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import * as ffmpeg from 'fluent-ffmpeg';
import * as ffprobeInstaller from '@ffprobe-installer/ffprobe';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SceneBoundary, VideoMetadata } from './pipeline.types';

const execAsync = promisify(exec);

@Injectable()
export class FfmpegPipelineService {
  private readonly logger = new Logger(FfmpegPipelineService.name);

  constructor(
    private readonly ffmpegService: FfmpegService,
    private readonly configService: ConfigService,
  ) {}

  private executeFfmpegWithTimeout<T>(
    cmd: ffmpeg.FfmpegCommand,
    timeoutMs: number,
    description: string,
    onSuccess: () => T | Promise<T>,
    onError?: (err: Error, timedOut: boolean) => T | Promise<T> | void,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let timedOut = false;
      let settled = false;

      const timer = setTimeout(() => {
        timedOut = true;
        this.logger.error(`FFmpeg timed out after ${timeoutMs}ms: ${description}`);
        try {
          cmd.kill('SIGKILL');
        } catch {
          // ignore error if process already terminated
        }
      }, timeoutMs);

      cmd
        .on('end', async () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (timedOut) {
            return reject(new Error(`FFmpeg timed out after ${timeoutMs}ms: ${description}`));
          }
          try {
            resolve(await onSuccess());
          } catch (e) {
            reject(e);
          }
        })
        .on('error', async (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (timedOut) {
            return reject(new Error(`FFmpeg timed out after ${timeoutMs}ms: ${description}`));
          }
          if (onError) {
            try {
              const fallback = await onError(err, timedOut);
              if (fallback !== undefined) {
                return resolve(fallback);
              }
            } catch (handleErr) {
              return reject(handleErr);
            }
          }
          reject(err);
        })
        .run();
    });
  }

  async probeMetadata(videoPath: string, timeoutMs = 15000): Promise<VideoMetadata> {
    const probePath = this.ffmpegService.getFfprobePath() || ffprobeInstaller.path;
    if (probePath) {
      ffmpeg.setFfprobePath(probePath);
    }
    return new Promise((resolve, reject) => {
      let isSettled = false;
      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          this.logger.error(`ffprobe timed out after ${timeoutMs}ms on ${videoPath}`);
          reject(new Error(`ffprobe metadata probe timed out after ${timeoutMs}ms on ${videoPath}`));
        }
      }, timeoutMs);

      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);

        if (err) {
          this.logger.error(`ffprobe error on ${videoPath}: ${err.message}`);
          return reject(err);
        }

        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

        let fps = 30;
        if (videoStream?.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
          if (den) fps = Math.round(num / den);
        }

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          codec: videoStream?.codec_name || 'unknown',
          fps,
          bitrate: metadata.format.bit_rate
            ? Math.round(Number(metadata.format.bit_rate) / 1000)
            : 0,
          hasAudio: Boolean(audioStream),
        });
      });
    });
  }

  async extractAudio(
    videoPath: string,
    outputAudioPath: string,
    timeoutMs = 120000,
  ): Promise<boolean> {
    const dir = path.dirname(outputAudioPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const cmd = ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioChannels(1)
      .audioFrequency(16000)
      .output(outputAudioPath);

    return this.executeFfmpegWithTimeout<boolean>(
      cmd,
      timeoutMs,
      `extractAudio -> ${outputAudioPath}`,
      () => {
        this.logger.log(`Audio extracted to ${outputAudioPath}`);
        return true;
      },
      (err, timedOut) => {
        if (timedOut) {
          throw new Error(`Audio extraction timed out after ${timeoutMs}ms`);
        }
        this.logger.warn(`Audio extraction failed or file has no audio: ${err.message}`);
        return false;
      },
    );
  }

  async generateProxy(
    videoPath: string,
    outputProxyPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<string> {
    const dir = path.dirname(outputProxyPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let sourceCodec = '';
    let duration = 60;
    try {
      const probe = await this.probeMetadata(videoPath, 15000);
      sourceCodec = (probe.codec || '').toLowerCase();
      if (probe.duration > 0) duration = probe.duration;
    } catch {
      // probe fallback
    }

    // Dynamic duration-scaled timeout: min 2 minutes, max 15 minutes, ~2.5s per video second
    const timeoutMs = Math.max(120_000, Math.min(900_000, Math.ceil(duration * 2500)));

    const cmd = ffmpeg(videoPath)
      .videoCodec('libx264')
      .size('?x720')
      .outputOptions(['-preset veryfast', '-crf 26', '-movflags +faststart'])
      .audioCodec('aac')
      .output(outputProxyPath);

    if (onProgress) {
      cmd.on('progress', (progress) => {
        if (typeof progress.percent === 'number' && !isNaN(progress.percent)) {
          onProgress(Math.min(99, Math.max(0, Math.round(progress.percent))));
        }
      });
    }

    return this.executeFfmpegWithTimeout<string>(
      cmd,
      timeoutMs,
      `generateProxy -> ${outputProxyPath} (${duration.toFixed(0)}s video)`,
      () => {
        this.logger.log(`Proxy generated: ${outputProxyPath}`);
        return outputProxyPath;
      },
      (err, timedOut) => {
        if (timedOut) {
          throw new Error(`Web proxy generation timed out after ${timeoutMs}ms for ${videoPath}`);
        }
        this.logger.error(`Proxy generation failed: ${err.message}`);
        // Safe fallback check: only copy if the original video codec is web-compatible H.264/AVC in an MP4/M4V container
        const isWebCodec = sourceCodec === 'h264' || sourceCodec === 'avc1';
        const ext = path.extname(videoPath).toLowerCase();
        const isMp4Container = ext === '.mp4' || ext === '.m4v';

        if (isWebCodec && isMp4Container) {
          try {
            this.logger.warn(
              `Transcode failed, but source codec '${sourceCodec}' in '${ext}' is web-safe; falling back to copying original.`,
            );
            fs.copyFileSync(videoPath, outputProxyPath);
            return outputProxyPath;
          } catch (copyErr) {
            throw copyErr;
          }
        }

        throw new Error(
          `Web proxy transcoding failed for video codec '${sourceCodec || 'unknown'}'. Transcoding is required for browser playback: ${err.message}`,
        );
      },
    );
  }

  async generateThumbnail(
    videoPath: string,
    outputThumbnailPath: string,
    timestamp: number = 1.0,
  ): Promise<string> {
    await this.extractFrame(videoPath, outputThumbnailPath, timestamp, '640x?', 20000);
    return outputThumbnailPath;
  }

  async detectScenesAndExtractFrames(
    videoPath: string,
    duration: number,
    framesOutputDir: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<SceneBoundary[]> {
    if (!fs.existsSync(framesOutputDir)) {
      fs.mkdirSync(framesOutputDir, { recursive: true });
    }

    const threshold = Number(this.configService.get('SCENE_THRESHOLD', 0.3));
    const minSceneSec = Number(this.configService.get('SCENE_MIN_SECONDS', 0.5));
    const maxScenes = this.calculateMaxScenes(duration);

    const cuts = await this.detectSceneCuts(videoPath, duration, threshold);
    const windows = this.buildSceneWindows(cuts, duration, maxScenes, minSceneSec);

    const scenes: SceneBoundary[] = [];
    for (let i = 0; i < windows.length; i++) {
      if (onProgress) {
        onProgress(i + 1, windows.length);
      }
      const { startTime, endTime } = windows[i];
      const representativeTimestamp = Number(((startTime + endTime) / 2).toFixed(2));
      const keyframeFile = `scene_${String(i + 1).padStart(3, '0')}.jpg`;
      const keyframePath = path.join(framesOutputDir, keyframeFile);

      try {
        await this.extractFrame(videoPath, keyframePath, representativeTimestamp, '640x?');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed extracting keyframe for scene ${i + 1}: ${message}`);
      }

      scenes.push({
        sceneId: i + 1,
        startTime,
        endTime,
        representativeTimestamp,
        keyframePath,
      });
    }

    this.logger.log(
      `Scene detection produced ${scenes.length} windows (threshold=${threshold}) for ${videoPath}`,
    );
    return scenes;
  }

  calculateMaxScenes(duration: number): number {
    const targetSeconds = Number(this.configService.get('SCENE_TARGET_SECONDS', 14));
    const minScenes = Number(this.configService.get('SCENE_MIN_COUNT', 4));
    const maxCap = Number(this.configService.get('SCENE_MAX_COUNT', 250));
    
    // Explicit override if set in environment (and not the old static default 12)
    const configuredMax = this.configService.get<string>('SCENE_MAX_FRAMES');
    if (configuredMax && Number(configuredMax) > 0 && configuredMax !== '12') {
      return Math.max(minScenes, Number(configuredMax));
    }
    
    return Math.max(minScenes, Math.min(maxCap, Math.ceil(duration / targetSeconds)));
  }

  private async detectSceneCuts(
    videoPath: string,
    duration: number,
    threshold: number,
  ): Promise<number[]> {
    const ffmpegBin = this.ffmpegService.getFfmpegPath();
    if (!ffmpegBin) {
      this.logger.warn('FFmpeg binary missing; falling back to duration windows');
      return this.fallbackCuts(duration);
    }

    const nullOut = process.platform === 'win32' ? 'NUL' : '/dev/null';
    const cmd = [
      this.quote(ffmpegBin),
      '-hide_banner',
      '-loglevel info',
      '-i',
      this.quote(videoPath),
      '-an',
      '-vf',
      `"select='gt(scene,${threshold})',showinfo"`,
      '-f',
      'null',
      nullOut,
    ].join(' ');

    let stderr = '';
    try {
      const result = await execAsync(cmd, {
        maxBuffer: 32 * 1024 * 1024,
        timeout: 180000,
        killSignal: 'SIGKILL',
        windowsHide: true,
      });
      stderr = `${result.stdout || ''}\n${result.stderr || ''}`;
    } catch (err) {
      const execErr = err as { stderr?: string; stdout?: string; message?: string };
      stderr = `${execErr.stdout || ''}\n${execErr.stderr || ''}\n${execErr.message || ''}`;
      this.logger.warn(`Scene-detect ffmpeg exited non-zero; parsing stderr anyway`);
    }

    const times: number[] = [0];
    const re = /pts_time:\s*([0-9.]+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(stderr))) {
      const t = Number(match[1]);
      if (Number.isFinite(t) && t > 0.04 && t < duration - 0.04) {
        times.push(Number(t.toFixed(3)));
      }
    }
    times.push(Number(duration.toFixed(3)));

    const unique = [...new Set(times)].sort((a, b) => a - b);
    if (unique.length <= 2) {
      this.logger.log('No scene cuts detected; using duration-based fallback windows');
      return this.fallbackCuts(duration);
    }
    return unique;
  }

  private fallbackCuts(duration: number): number[] {
    const window = Math.min(8, Math.max(3, duration / 6));
    const cuts: number[] = [0];
    for (let t = window; t < duration - 0.25; t += window) {
      cuts.push(Number(t.toFixed(2)));
    }
    cuts.push(Number(duration.toFixed(3)));
    return cuts;
  }

  private buildSceneWindows(
    cuts: number[],
    duration: number,
    maxScenes: number,
    minSceneSec: number,
  ): Array<{ startTime: number; endTime: number }> {
    const bounds = [...cuts];
    if (bounds[0] !== 0) bounds.unshift(0);
    if (bounds[bounds.length - 1] < duration - 0.01) bounds.push(duration);

    let windows: Array<{ startTime: number; endTime: number }> = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const startTime = Number(bounds[i].toFixed(2));
      const endTime = Number(bounds[i + 1].toFixed(2));
      if (endTime - startTime < 0.05) continue;
      windows.push({ startTime, endTime });
    }

    const merged: Array<{ startTime: number; endTime: number }> = [];
    for (const window of windows) {
      const prev = merged[merged.length - 1];
      if (prev && window.endTime - window.startTime < minSceneSec) {
        prev.endTime = window.endTime;
      } else {
        merged.push({ ...window });
      }
    }
    windows = merged.length > 0 ? merged : [{ startTime: 0, endTime: Number(duration.toFixed(2)) }];

    while (windows.length > maxScenes) {
      let shortestIdx = 0;
      let shortestLen = Infinity;
      for (let i = 0; i < windows.length; i++) {
        const len = windows[i].endTime - windows[i].startTime;
        if (len < shortestLen) {
          shortestLen = len;
          shortestIdx = i;
        }
      }
      const neighbor =
        shortestIdx === 0
          ? 1
          : shortestIdx === windows.length - 1
            ? shortestIdx - 1
            : windows[shortestIdx - 1].endTime - windows[shortestIdx - 1].startTime <=
                windows[shortestIdx + 1].endTime - windows[shortestIdx + 1].startTime
              ? shortestIdx - 1
              : shortestIdx + 1;
      const keep = Math.min(shortestIdx, neighbor);
      const drop = Math.max(shortestIdx, neighbor);
      windows[keep] = {
        startTime: windows[keep].startTime,
        endTime: windows[drop].endTime,
      };
      windows.splice(drop, 1);
    }

    return windows;
  }

  private extractFrame(
    videoPath: string,
    outputPath: string,
    timestamp: number,
    size: string,
    timeoutMs = 15000,
  ): Promise<string> {
    const filename = path.basename(outputPath);
    const folder = path.dirname(outputPath);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    const cmd = ffmpeg(videoPath).screenshots({
      timestamps: [Math.max(0, timestamp)],
      filename,
      folder,
      size,
    });

    return this.executeFfmpegWithTimeout<string>(
      cmd,
      timeoutMs,
      `extractFrame at ${timestamp}s -> ${outputPath}`,
      () => outputPath,
    );
  }

  async splitAudioIntoChunks(
    audioPath: string,
    outputDir: string,
    chunkSeconds = 45,
  ): Promise<Array<{ path: string; offset: number }>> {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const ffmpegBin = this.ffmpegService.getFfmpegPath();
    if (!ffmpegBin) throw new Error('FFmpeg binary missing; cannot chunk audio for transcription');

    const pattern = path.join(outputDir, 'chunk_%03d.mp3');
    const cmd = [
      this.quote(ffmpegBin),
      '-y',
      '-i',
      this.quote(audioPath),
      '-f',
      'segment',
      '-segment_time',
      String(chunkSeconds),
      '-reset_timestamps',
      '1',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '64k',
      this.quote(pattern),
    ].join(' ');

    try {
      await execAsync(cmd, {
        timeout: 300000,
        killSignal: 'SIGKILL',
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Audio chunking failed: ${message}`);
    }

    const files = fs
      .readdirSync(outputDir)
      .filter((f) => /^chunk_\d+\.mp3$/i.test(f))
      .sort();

    if (files.length === 0) {
      return [{ path: audioPath, offset: 0 }];
    }

    this.logger.log(`Split ${audioPath} into ${files.length} ~${chunkSeconds}s chunks`);
    return files.map((file, i) => ({
      path: path.join(outputDir, file),
      offset: i * chunkSeconds,
    }));
  }

  private quote(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
}
