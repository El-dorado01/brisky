import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { FfmpegPipelineService } from './ffmpeg-pipeline.service';
import { assertPathWithinRoot, resolveFromRepo } from '../../common/repo-paths';
import { computeFrameTimestamps } from './scene-sampling';
import { assertSearchActive } from '../../common/search-deadline';
import { SeekableMediaSource } from './seekable-media-source';

export function evidenceMode(query: string, detail: boolean): 'frames' | 'detail' | 'sequence' {
  if (/\b(before|after|then|until|while|sequence|danc(?:e[sd]?|ing)|sways?|swaying|twirls?|twirling|hugs?|hugging|embraces?|embracing|kisses?|kissing|handshakes?|shakes? hands|hits?|hitting|strikes?|striking|taps?|tapping|kicks?|kicking|stretches?|stretching|puts?|putting|takes?|taking|into|out of|picks? up|picking up|without|except|not)\b/i.test(query)) return 'sequence';
  return detail ? 'detail' : 'frames';
}

export interface SearchEvidence {
  frames: { timestamp: number; path: string }[];
  clipPath?: string;
  kind: 'original' | 'preview';
  cleanup(): void;
}

/** Creates bounded, disposable evidence. Never downloads remote masters. */
@Injectable()
export class SearchEvidenceService {
  private extractionTail: Promise<void> = Promise.resolve();
  constructor(private readonly config: ConfigService, private readonly ffmpeg: FfmpegPipelineService) {}

  async prepare(sourcePath: string, kind: 'original' | 'preview', start: number, end: number,
    mode: 'detail' | 'sequence'): Promise<SearchEvidence | null> {
    const previous = this.extractionTail;
    let release!: () => void;
    this.extractionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { assertSearchActive(); return await this.build(sourcePath, kind, start, end, mode); }
    finally { release(); }
  }

  async prepareRemote(source: SeekableMediaSource, start: number, end: number,
    mode: 'detail' | 'sequence'): Promise<SearchEvidence | null> {
    if (!/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{48}$/.test(source.url)) throw new Error('Invalid decoder source endpoint');
    const previous = this.extractionTail;
    let release!: () => void;
    this.extractionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    let evidence: SearchEvidence | null = null;
    try {
      assertSearchActive();
      evidence = await this.build(source.url, 'original', start, end, mode, true);
      if (evidence) await source.validate();
      return evidence;
    } catch (error) { evidence?.cleanup(); throw error; }
    finally { release(); }
  }

  private async build(sourcePath: string, kind: 'original' | 'preview', start: number, end: number,
    mode: 'detail' | 'sequence', remote = false): Promise<SearchEvidence | null> {
    const maxSeconds = Number(this.config.get('SEARCH_INSPECTION_MAX_SECONDS', 20));
    const maxBytes = Number(this.config.get('SEARCH_INSPECTION_MAX_MB', 25)) * 1024 * 1024;
    if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 60 ||
      !Number.isFinite(maxBytes) || maxBytes <= 0 || maxBytes > 100 * 1024 * 1024) {
      throw new Error('Invalid search inspection limits');
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start > maxSeconds) return null;
    const storage = resolveFromRepo(this.config.get<string>('STORAGE_ROOT', './storage'));
    // Resolve symlinks too: metadata must not escape the media storage root.
    const source = remote ? sourcePath : assertPathWithinRoot(fs.realpathSync(sourcePath), fs.realpathSync(storage));
    const scratchRoot = resolveFromRepo(this.config.get<string>('SCRATCH_DIR', './storage/scratch'));
    const parent = path.join(scratchRoot, 'search-inspection');
    fs.mkdirSync(parent, { recursive: true });
    const scratch = fs.mkdtempSync(path.join(parent, 'evidence-'));
    const cleanup = () => fs.rmSync(scratch, { recursive: true, force: true });
    try {
      if (mode === 'sequence') {
        const clipPath = path.join(scratch, 'sequence.mp4');
        await this.ffmpeg.extractClip(source, clipPath, start, end);
        if (!fs.existsSync(clipPath) || fs.statSync(clipPath).size === 0 || fs.statSync(clipPath).size > maxBytes) {
          cleanup(); return null;
        }
        return { frames: [], clipPath, kind, cleanup };
      }
      // Native-resolution samples preserve available detail; no upscaling of previews.
      const timestamps = computeFrameTimestamps(start, end, Math.min(12, Math.max(3, Math.ceil((end - start) * 2))));
      const frames: SearchEvidence['frames'] = [];
      let bytes = 0;
      for (const timestamp of timestamps) {
        assertSearchActive();
        const file = path.join(scratch, `frame-${frames.length}.jpg`);
        await this.ffmpeg.extractInspectionFrame(source, file, timestamp);
        const size = fs.statSync(file).size;
        bytes += size;
        if (size === 0 || bytes > maxBytes) { cleanup(); return null; }
        frames.push({ timestamp, path: file });
      }
      return { frames, kind, cleanup };
    } catch (err) { cleanup(); throw err; }
  }
}
