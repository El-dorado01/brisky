import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import * as ffmpeg from 'fluent-ffmpeg';
import * as ffprobeInstaller from '@ffprobe-installer/ffprobe';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { assertSearchActive, searchSignal, SearchDeadlineError } from '../../common/search-deadline';
import { SceneBoundary, VideoMetadata } from './pipeline.types';
import { computeAdaptiveProxyTarget } from './proxy-scaling';
import { framesPerWindow, computeFrameTimestamps,plannedSceneFrames } from './scene-sampling';

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
    assertSearchActive();
    return new Promise((resolve, reject) => {
      let timedOut = false;
      let settled = false;
      let cancelled = false;
      const signal = searchSignal();
      const abort = () => { cancelled = true; try { cmd.kill('SIGKILL'); } catch { /* process may already have exited */ } };
      signal?.addEventListener('abort', abort, { once: true });

      const timer = setTimeout(() => {
        timedOut = true;
        this.logger.error(
          `FFmpeg timed out after ${timeoutMs}ms: ${description}`,
        );
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
          signal?.removeEventListener('abort', abort);
          if (cancelled) return reject(new SearchDeadlineError());
          if (timedOut) {
            return reject(
              new Error(
                `FFmpeg timed out after ${timeoutMs}ms: ${description}`,
              ),
            );
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
          signal?.removeEventListener('abort', abort);
          if (cancelled) return reject(new SearchDeadlineError());
          if (timedOut) {
            return reject(
              new Error(
                `FFmpeg timed out after ${timeoutMs}ms: ${description}`,
              ),
            );
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

  async probeMetadata(
    videoPath: string,
    timeoutMs = 15000,
  ): Promise<VideoMetadata> {
    const probePath =
      this.ffmpegService.getFfprobePath() || ffprobeInstaller.path;
    if (probePath) {
      ffmpeg.setFfprobePath(probePath);
    }
    return new Promise((resolve, reject) => {
      let isSettled = false;
      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          this.logger.error(
            `ffprobe timed out after ${timeoutMs}ms on ${videoPath}`,
          );
          reject(
            new Error(
              `ffprobe metadata probe timed out after ${timeoutMs}ms on ${videoPath}`,
            ),
          );
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

        const videoStream = metadata.streams.find(
          (s) => s.codec_type === 'video',
        );
        const audioStream = metadata.streams.find(
          (s) => s.codec_type === 'audio',
        );

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
        this.logger.warn(
          `Audio extraction failed or file has no audio: ${err.message}`,
        );
        return false;
      },
    );
  }

  async extractAudioWindow(videoPath: string, output: string, start: number, end: number): Promise<void> {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start > 320) {
      throw new Error('Invalid audio extraction interval');
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const command = ffmpeg(videoPath).setStartTime(start).setDuration(end - start).noVideo()
      .audioCodec('pcm_s16le').audioChannels(1).audioFrequency(16000).output(output);
    await this.executeFfmpegWithTimeout(command, 120000, 'extract audio window', () => {
      if (!fs.existsSync(output) || fs.statSync(output).size <= 44 || fs.statSync(output).size > 11 * 1024 * 1024) {
        throw new Error('Audio window is empty or exceeds output allowance');
      }
    });
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
    let targetHeight = 720;
    try {
      const probe = await this.probeMetadata(videoPath, 15000);
      sourceCodec = (probe.codec || '').toLowerCase();
      if (probe.duration > 0) duration = probe.duration;
      targetHeight = computeAdaptiveProxyTarget(probe.height);
    } catch {
      // probe fallback
    }

    // Dynamic duration-scaled timeout: min 2 minutes, max 15 minutes, ~2.5s per video second
    const timeoutMs = Math.max(
      120_000,
      Math.min(900_000, Math.ceil(duration * 2500)),
    );

    const cmd = ffmpeg(videoPath)
      .videoCodec('libx264')
      .size(`?x${targetHeight}`)
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
      `generateProxy -> ${outputProxyPath} (${duration.toFixed(0)}s video, ${targetHeight}p)`,
      () => {
        // Section 3 of 03-media-storage-brief.md: If proxy is larger than original and original is web-playable H.264 MP4, use original
        try {
          const proxyStat = fs.statSync(outputProxyPath);
          const origStat = fs.statSync(videoPath);
          const isWebCodec = sourceCodec === 'h264' || sourceCodec === 'avc1';
          const ext = path.extname(videoPath).toLowerCase();
          if (isWebCodec && (ext === '.mp4' || ext === '.m4v') && proxyStat.size >= origStat.size) {
            fs.copyFileSync(videoPath, outputProxyPath);
            this.logger.log(`Original was smaller than generated proxy; retained original bytes (${origStat.size} < ${proxyStat.size})`);
          }
        } catch {
          // ignore stat/copy check if files were moved
        }
        this.logger.log(`Adaptive proxy (${targetHeight}p) generated: ${outputProxyPath}`);
        return outputProxyPath;
      },
      (err, timedOut) => {
        if (timedOut) {
          throw new Error(
            `Web proxy generation timed out after ${timeoutMs}ms for ${videoPath}`,
          );
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

  async extractClip(
    videoPath: string,
    outputClipPath: string,
    startS: number,
    endS: number,
  ): Promise<string> {
    const dir = path.dirname(outputClipPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const duration = Math.max(0.1, endS - startS);
    const timeoutMs = Math.max(60_000, Math.ceil(duration * 5000));

    const cmd = ffmpeg(videoPath)
      .setStartTime(startS)
      .setDuration(duration)
      .videoCodec('libx264')
      .outputOptions(['-preset fast', '-crf 23', '-movflags +faststart', '-pix_fmt yuv420p'])
      .audioCodec('aac')
      .output(outputClipPath);

    return this.executeFfmpegWithTimeout<string>(
      cmd,
      timeoutMs,
      `extractClip -> ${outputClipPath} (${startS}s to ${endS}s)`,
      () => {
        this.logger.log(`Extracted subclip (${duration.toFixed(1)}s): ${outputClipPath}`);
        return outputClipPath;
      },
      (err, timedOut) => {
        if (timedOut) {
          throw new Error(`Clip extraction timed out after ${timeoutMs}ms for ${videoPath}`);
        }
        this.logger.error(`Clip extraction failed: ${err.message}`);
        throw err;
      },
    );
  }

  /** Prepare a complete temporal window, retaining audio and native dimensions.
   * No -fs truncation: callers validate size/duration before sending any window. */
  async prepareAnalysisWindow(source:string,output:string,start:number,end:number,maxBytes:number):Promise<string> {
    const duration=end-start;
    if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<=0||duration>300||!Number.isSafeInteger(maxBytes)||maxBytes<1024)
      throw new Error('Invalid analysis window');
    fs.mkdirSync(path.dirname(output),{recursive:true});
    const audioRate=64000;
    // Leave room for encoder rate variation, audio and container overhead.
    const videoRate=Math.floor(Math.min(6000000,maxBytes*8*.6/duration-audioRate));
    if(videoRate<64000)throw new Error('Media byte allowance too small for this video window');
    const command=ffmpeg(source).setStartTime(start).setDuration(duration).videoCodec('libx264')
      .outputOptions(['-preset fast',`-b:v ${videoRate}`,`-maxrate ${videoRate}`,`-bufsize ${videoRate*2}`,
        '-pix_fmt yuv420p','-movflags +faststart']).audioCodec('aac').audioBitrate('64k').output(output);
    return this.executeFfmpegWithTimeout(command,Math.max(60000,Math.ceil(duration*5000)),
      'prepare bounded video analysis window',()=>{
        const size=fs.statSync(output).size;
        if(size<=0||size>maxBytes)throw new Error('Encoded video window exceeds inline allowance; reduce AI_VIDEO_CHUNK_SECONDS');
        return output;
      });
  }

  async generateThumbnail(
    videoPath: string,
    outputThumbnailPath: string,
    timestamp: number = 1.0,
  ): Promise<string> {
    await this.extractFrame(
      videoPath,
      outputThumbnailPath,
      timestamp,
      '640x?',
      20000,
    );
    return outputThumbnailPath;
  }

  async detectScenesAndExtractFrames(
    videoPath: string,
    duration: number,
    framesOutputDir: string,
    onProgress?: (current: number, total: number) => void|Promise<void>,
    sourceStart?: number,
  ): Promise<SceneBoundary[]> {
    if (sourceStart !== undefined && (!Number.isFinite(sourceStart) || sourceStart < 0 || !Number.isFinite(duration) || duration <= 0 || duration > 320)) {
      throw new Error('Invalid bounded scene interval');
    }
    if (!fs.existsSync(framesOutputDir)) {
      fs.mkdirSync(framesOutputDir, { recursive: true });
    }

    const threshold = Number(this.configService.get('SCENE_THRESHOLD', 0.3));
    const minSceneSec = Number(
      this.configService.get('SCENE_MIN_SECONDS', 0.5),
    );
    const maxScenes = this.calculateMaxScenes(duration);

    const cuts = await this.detectSceneCuts(videoPath, duration, threshold, sourceStart);
    const windows = this.buildSceneWindows(
      cuts,
      duration,
      maxScenes,
      minSceneSec,
    );

    const maxFramesPerScene = Number(
      this.configService.get('MAX_FRAMES_PER_SCENE', 3),
    );

    const scenes: SceneBoundary[] = [];
    const totalFrames=windows.reduce((sum,window)=>sum+plannedSceneFrames(window.startTime+(sourceStart||0),window.endTime+(sourceStart||0),maxFramesPerScene).all.length,0);
    let completedFrames=0;
    if(onProgress)await onProgress(0,totalFrames);
    for (let i = 0; i < windows.length; i++) {
      const startTime = windows[i].startTime + (sourceStart || 0);
      const endTime = windows[i].endTime + (sourceStart || 0);
      const representativeTimestamp = Number(
        ((startTime + endTime) / 2).toFixed(2),
      );

      const {primary:frameTimestamps,all:allTimestamps}=plannedSceneFrames(startTime,endTime,maxFramesPerScene);

      const keyframes: { timestamp: number; path: string }[] = [];
      for (let f = 0; f < allTimestamps.length; f++) {
        const ts = allTimestamps[f];
        const isMicroFrame = !frameTimestamps.includes(ts);
        const keyframeFile = `scene_${String(i + 1).padStart(3, '0')}_f${String(f + 1).padStart(2, '0')}${
          isMicroFrame ? '_micro' : ''
        }.jpg`;
        const keyframePath = path.join(framesOutputDir, keyframeFile);
        const streamed = videoPath.startsWith('http://127.0.0.1:');
        const attempts = streamed ? 2 : 1;
        let extracted = false;
        let extractedTimestamp = ts;
        let missingFrame = false;
        // Container/audio tails can outlast the last video frame. Recover only a
        // successful empty decode near the scene end, never a timeout/network error.
        const candidates = [ts, ...(endTime-ts<=0.25
          ? [ts-0.05,ts-0.15].map(t=>Number(t.toFixed(3))).filter(t=>t>=startTime)
          : [])];
        for (const candidate of candidates) {
          if(candidate!==ts && !missingFrame)break;
          for (let attempt = 0; attempt < attempts; attempt++) {
            assertSearchActive();
            missingFrame = false;
            try {
              await this.extractFrame(videoPath, keyframePath, candidate, '640x?', streamed ? 60000 : 15000);
              if (!fs.existsSync(keyframePath) || fs.statSync(keyframePath).size === 0) {
                missingFrame = true;
                throw new Error('Decoder produced no frame');
              }
              extracted = true;
              extractedTimestamp = candidate;
              break;
            } catch {
              assertSearchActive();
              if (fs.existsSync(keyframePath)) fs.unlinkSync(keyframePath);
            }
          }
          if(extracted)break;
        }
        if (!extracted) throw new Error(`Required keyframe missing for scene ${i + 1} at ${ts}s`);
        if(extractedTimestamp!==ts)this.logger.warn(`Recovered scene ${i+1} tail frame at ${extractedTimestamp}s (requested ${ts}s)`);
        keyframes.push({ timestamp: extractedTimestamp, path: keyframePath });
        completedFrames++;
        if(onProgress)await onProgress(completedFrames,totalFrames);
      }

      scenes.push({
        sceneId: i + 1,
        startTime,
        endTime,
        representativeTimestamp,
        keyframePath: keyframes[0]?.path || '',
        keyframes,
      });
    }

    this.logger.log(
      `Scene detection produced ${scenes.length} windows (threshold=${threshold}) for ${videoPath}`,
    );
    return scenes;
  }

  async extractSceneContext(videoPath: string, start: number, end: number, output: string, sceneId: number): Promise<SceneBoundary> {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start > 20) {
      throw new Error('Invalid scene boundary context');
    }
    fs.mkdirSync(output, { recursive: true });
    const keyframes: { timestamp: number; path: string }[] = [];
    for (const timestamp of computeFrameTimestamps(start, end, 5)) {
      assertSearchActive();
      const file = path.join(output, `context-${keyframes.length}.jpg`);
      await this.extractFrame(videoPath, file, timestamp, '640x?');
      if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error('Scene boundary frame is missing');
      keyframes.push({ timestamp, path: file });
    }
    return { sceneId, startTime: start, endTime: end, representativeTimestamp: (start + end) / 2,
      keyframePath: keyframes[0].path, keyframes };
  }

  calculateMaxScenes(duration: number): number {
    const targetSeconds = Number(
      this.configService.get('SCENE_TARGET_SECONDS', 7),
    ); // Reduced from 14s to 7s for finer granularity
    const minScenes = Number(this.configService.get('SCENE_MIN_COUNT', 4));
    const maxCap = Number(this.configService.get('SCENE_MAX_COUNT', 250));

    // Explicit override if set in environment (and not the old static default 12)
    const configuredMax = this.configService.get<string>('SCENE_MAX_FRAMES');
    if (configuredMax && Number(configuredMax) > 0 && configuredMax !== '12') {
      return Math.max(minScenes, Number(configuredMax));
    }

    return Math.max(
      minScenes,
      Math.min(maxCap, Math.ceil(duration / targetSeconds)),
    );
  }

  private async detectSceneCuts(
    videoPath: string,
    duration: number,
    threshold: number,
    sourceStart?: number,
  ): Promise<number[]> {
    const ffmpegBin = this.ffmpegService.getFfmpegPath();
    if (!ffmpegBin) {
      this.logger.warn(
        'FFmpeg binary missing; falling back to duration windows',
      );
      return this.fallbackCuts(duration);
    }

    const nullOut = process.platform === 'win32' ? 'NUL' : '/dev/null';
    const cmd = [
      this.quote(ffmpegBin),
      '-hide_banner',
      '-loglevel info',
      ...(sourceStart === undefined ? [] : ['-ss', String(sourceStart), '-t', String(duration)]),
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
      const execErr = err as {
        stderr?: string;
        stdout?: string;
        message?: string;
      };
      stderr = `${execErr.stdout || ''}\n${execErr.stderr || ''}\n${execErr.message || ''}`;
      if (sourceStart !== undefined || videoPath.startsWith('http://127.0.0.1:')) {
        throw new Error('Streamed scene detection did not complete successfully');
      }
      this.logger.warn(
        `Scene-detect ffmpeg exited non-zero; parsing stderr anyway`,
      );
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
      this.logger.log(
        'No scene cuts detected; using duration-based fallback windows',
      );
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
    windows =
      merged.length > 0
        ? merged
        : [{ startTime: 0, endTime: Number(duration.toFixed(2)) }];

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
            : windows[shortestIdx - 1].endTime -
                  windows[shortestIdx - 1].startTime <=
                windows[shortestIdx + 1].endTime -
                  windows[shortestIdx + 1].startTime
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

  extractInspectionFrame(videoPath: string, outputPath: string, timestamp: number): Promise<string> {
    return this.extractFrame(videoPath, outputPath, timestamp);
  }

  private extractFrame(
    videoPath: string,
    outputPath: string,
    timestamp: number,
    size?: string,
    timeoutMs = 15000,
  ): Promise<string> {
    const folder = path.dirname(outputPath);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    const cmd = ffmpeg(videoPath)
      .seekInput(Math.max(0, timestamp))
      .frames(1);
    if (size) cmd.size(size);
    cmd.output(outputPath);

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
    if (!ffmpegBin)
      throw new Error(
        'FFmpeg binary missing; cannot chunk audio for transcription',
      );

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

    this.logger.log(
      `Split ${audioPath} into ${files.length} ~${chunkSeconds}s chunks`,
    );
    return files.map((file, i) => ({
      path: path.join(outputDir, file),
      offset: i * chunkSeconds,
    }));
  }

  private quote(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
}
