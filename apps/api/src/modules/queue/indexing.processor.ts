import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import { FfmpegPipelineService } from '../pipeline/ffmpeg-pipeline.service';
import { GeminiIntelligenceService } from '../pipeline/gemini-intelligence.service';
import { IntelligenceMergerService } from '../pipeline/intelligence-merger.service';
import { WhisperTranscriptionService } from '../pipeline/whisper-transcription.service';
import { IndexingJobData } from './indexing.types';
import {
  ANALYSIS_VERSION,
  GeminiVideoAnalysis,
  ModelUsage,
  StageTiming,
  TranscriptCue,
} from '../pipeline/pipeline.types';
import { resolveFromRepo } from '../../common/repo-paths';
import { ConnectorRegistry } from '../connector/connector.registry';
import { ConnectorsService } from '../connector/connectors.service';

@Processor('indexing-queue', { concurrency: 1 })
export class IndexingProcessor extends WorkerHost {
  private readonly logger = new Logger(IndexingProcessor.name);
  private readonly activeAssets = new Set<string>();
  private storageRoot: string;
  private proxyDir: string;
  private thumbnailDir: string;
  private scratchDir: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly ffmpegPipeline: FfmpegPipelineService,
    private readonly geminiService: GeminiIntelligenceService,
    private readonly whisperService: WhisperTranscriptionService,
    private readonly mergerService: IntelligenceMergerService,
    private readonly configService: ConfigService,
    private readonly connectorRegistry: ConnectorRegistry,
    private readonly connectorsService: ConnectorsService,
  ) {
    super();
    this.storageRoot = resolveFromRepo(
      this.configService.get<string>('STORAGE_ROOT', './storage'),
    );
    this.proxyDir = path.join(this.storageRoot, 'proxies');
    this.thumbnailDir = path.join(this.storageRoot, 'thumbnails');
    this.scratchDir = path.join(this.storageRoot, 'scratch');

    [this.storageRoot, this.proxyDir, this.thumbnailDir, this.scratchDir].forEach((dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  async process(job: Job<IndexingJobData>): Promise<void> {
    const { assetId, userId, sourcePath, originalFilename, checksum } = job.data;

    // Concurrency guard: Guarantee only one worker processes this asset at a time
    if (this.activeAssets.has(assetId)) {
      this.logger.warn(
        `Asset ${assetId} (${originalFilename}) is already actively being processed by another worker instance. Skipping duplicate job ${job.id}.`,
      );
      return;
    }
    this.activeAssets.add(assetId);

    try {
      await this.executeProcessing(job);
    } finally {
      this.activeAssets.delete(assetId);
    }
  }

  private async executeProcessing(job: Job<IndexingJobData>): Promise<void> {
    const { assetId, userId, sourcePath, originalFilename, checksum } = job.data;
    const indexStartedAt = Date.now();
    const timings: StageTiming[] = [];

    const currentAttempt = (job.attemptsMade || 0) + 1;
    const maxAttempts = job.opts?.attempts || 2;
    await this.db.query(
      `UPDATE indexing_jobs
       SET status = 'active', started_at = COALESCE(started_at, NOW()), attempts = $1
       WHERE bull_job_id = $2`,
      [currentAttempt, job.id],
    );

    this.logger.log(
      `Starting BullMQ processing for asset ${assetId} (${originalFilename}) - attempt ${currentAttempt}/${maxAttempts}`,
    );

    // Helper to update stage, progress, and db in one call with throttling for high-frequency events
    let lastProgressUpdate = 0;
    let lastProgressValue = -1;
    let lastStage = '';

    const setStage = async (stage: string, progress: number, force = false) => {
      const now = Date.now();
      const roundedProgress = Math.min(100, Math.max(0, Math.round(progress)));

      if (!force && stage === lastStage && roundedProgress === lastProgressValue) return;
      if (!force && stage === lastStage && now - lastProgressUpdate < 750 && Math.abs(roundedProgress - lastProgressValue) < 3) return;

      lastProgressUpdate = now;
      lastProgressValue = roundedProgress;
      lastStage = stage;

      await job.updateProgress(roundedProgress).catch(() => undefined);
      await this.db.query(
        `UPDATE media_assets
         SET status = 'processing', stage = $1, progress = $2, updated_at = NOW()
         WHERE id = $3`,
        [stage, roundedProgress, assetId],
      );
      await this.db.query(
        `UPDATE indexing_jobs
         SET status = 'active', stage = $1, progress = $2
         WHERE bull_job_id = $3`,
        [stage, roundedProgress, job.id],
      );
    };

    const mark = async <T>(stage: string, progress: number, fn: () => Promise<T>): Promise<T> => {
      const t0 = Date.now();
      await setStage(stage, progress, true);
      const result = await fn();
      timings.push({ stage, durationMs: Date.now() - t0 });
      return result;
    };

    try {
      // 1. Deduplication check: Has this checksum already been indexed or currently indexing?
      // Skip when forceReindex is set so we can rebuild a broken speech index.
      let donorId: string | null = null;
      if (job.data.forceReindex) {
        this.logger.log(`Force reindex for ${assetId}; skipping checksum clone`);
      } else {
        const existing = await this.db.query<{ id: string }>(
          `SELECT id FROM media_assets
           WHERE checksum = $1 AND user_id = $2 AND status = 'indexed' AND id != $3
           LIMIT 1`,
          [checksum, userId, assetId],
        );

        if (existing.rows.length > 0) {
          donorId = existing.rows[0].id;
        } else {
          const inFlight = await this.db.query<{ id: string }>(
            `SELECT id FROM media_assets
             WHERE checksum = $1 AND user_id = $2 AND status IN ('queued', 'processing') AND id != $3
             ORDER BY created_at ASC
             LIMIT 1`,
            [checksum, userId, assetId],
          );
          if (inFlight.rows.length > 0) {
            const siblingId = inFlight.rows[0].id;
            this.logger.log(`Asset ${assetId} has in-flight identical sibling ${siblingId}; awaiting completion (up to 120s)...`);
            for (let waitSec = 0; waitSec < 120; waitSec++) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              const check = await this.db.query<{ status: string }>(
                `SELECT status FROM media_assets WHERE id = $1`,
                [siblingId],
              );
              if (check.rows[0]?.status === 'indexed') {
                donorId = siblingId;
                this.logger.log(`In-flight sibling ${siblingId} finished indexing; cloning intelligence to ${assetId}`);
                break;
              }
              if (check.rows[0]?.status === 'failed') {
                this.logger.warn(`In-flight sibling ${siblingId} failed; indexing ${assetId} independently`);
                break;
              }
            }
          }
        }
      }

      if (donorId) {
        this.logger.log(`Asset ${assetId} is duplicate of ${donorId}; cloning intelligence`);
        await this.cloneExistingAsset(donorId, assetId, userId);
        await setStage('completed', 100, true);
        await this.db.query(
          `UPDATE media_assets SET status = 'indexed', updated_at = NOW() WHERE id = $1`,
          [assetId],
        );
        await this.db.query(
          `UPDATE indexing_jobs SET status = 'completed', stage = 'completed', progress = 100, finished_at = NOW() WHERE bull_job_id = $1`,
          [job.id],
        );
        return;
      }

      const scratch = path.join(this.scratchDir, assetId);
      fs.mkdirSync(scratch, { recursive: true });

      const provider = job.data.provider || (job.data.sourceType === 'drive' ? 'google_drive' : 'upload');
      const remoteId = job.data.remoteId || job.data.externalFileId;
      const isRemoteMaster = provider !== 'upload' && Boolean(remoteId);

      let effectiveSourcePath = sourcePath;

      if (isRemoteMaster) {
        const sourceExt = path.extname(job.data.originalFilename || '') || '.mp4';
        effectiveSourcePath = path.join(scratch, `source${sourceExt}`);
        await setStage('downloading_from_connector', 2, true);

        if (!job.data.connectorAccountId) {
          throw new Error(`Missing connectorAccountId for asset ${assetId} (provider: ${provider})`);
        }

        const alreadyDownloaded =
          fs.existsSync(effectiveSourcePath) &&
          job.data.fileSize > 0 &&
          fs.statSync(effectiveSourcePath).size === job.data.fileSize;

        if (alreadyDownloaded) {
          this.logger.log(
            `Source for ${assetId} already exists in scratch with valid size (${(job.data.fileSize / (1024 * 1024)).toFixed(2)} MB); skipping re-download`,
          );
          await setStage('downloading_from_connector', 7, true);
        } else {
          const connector = this.connectorRegistry.get(provider);
          const auth = await this.connectorsService.getAuthContext(
            job.data.connectorAccountId,
            userId,
          );

          await mark('download_from_connector', 5, async () => {
            await connector.downloadAsset(
              auth,
              remoteId!,
              effectiveSourcePath,
              (pct: number) => {
                setStage('downloading_from_connector', 2 + Math.round((pct / 100) * 5)).catch(() => undefined);
              },
            );
          });
        }
      } else {
        if (!fs.existsSync(sourcePath)) {
          throw new Error(`Source video file not found on disk: ${sourcePath}`);
        }
      }

      // Stage 1: Probe Metadata
      const metadata = await mark('probe_metadata', 8, () =>
        this.ffmpegPipeline.probeMetadata(effectiveSourcePath),
      );

      await this.db.query(
        `UPDATE media_assets
         SET duration = $1, width = $2, height = $3, fps = $4, codec = $5, has_audio = $6
         WHERE id = $7`,
        [
          metadata.duration,
          metadata.width,
          metadata.height,
          metadata.fps,
          metadata.codec,
          metadata.hasAudio,
          assetId,
        ],
      );

      // Stage 2: Scene Detection & Keyframe Extraction
      const framesDir = path.join(scratch, 'frames');
      const scenes = await mark('scene_detection', 14, () =>
        this.ffmpegPipeline.detectScenesAndExtractFrames(
          effectiveSourcePath,
          metadata.duration,
          framesDir,
          (current, total) => {
            const pct = 14 + Math.round((current / Math.max(1, total)) * 14);
            setStage('extracting_keyframes', pct).catch(() => undefined);
          },
        ),
      );

      // Stage 3: Proxy, Audio, Thumbnail
      const audioPath = path.join(scratch, 'audio.mp3');
      const proxyPath = path.join(this.proxyDir, `${assetId}.mp4`);
      const thumbnailPath = path.join(this.thumbnailDir, `${assetId}.jpg`);

      // Stage 3: Proxy, Audio, Thumbnail (serialized within worker to prevent FFmpeg CPU & I/O thrashing)
      const [, audioOk] = await mark('ffmpeg_outputs', 28, async () => {
        // 1. Fast thumbnail extraction first (~0.2s)
        await this.ffmpegPipeline.generateThumbnail(
          effectiveSourcePath,
          thumbnailPath,
          scenes[0]?.representativeTimestamp || 1,
        );
        await setStage('thumbnail_ready', 30, true);

        // 2. Fast audio stream extraction (~1-2s)
        const audioExtracted = metadata.hasAudio
          ? await this.ffmpegPipeline.extractAudio(effectiveSourcePath, audioPath)
          : false;
        await setStage('audio_extracted', 33, true);

        // 3. Web-safe 720p H.264 proxy encoding (hook into ffmpeg progress)
        const isSelfProxy = path.resolve(effectiveSourcePath) === path.resolve(proxyPath);
        if (isSelfProxy && fs.existsSync(proxyPath)) {
          this.logger.log(`Source is already the web proxy; skipping re-encoding of ${proxyPath}`);
          await setStage('proxy_ready', 60, true);
          await this.db.query(`UPDATE media_assets SET proxy_status = 'ready' WHERE id = $1`, [assetId]);
        } else {
          await this.ffmpegPipeline.generateProxy(
            effectiveSourcePath,
            proxyPath,
            (percent) => {
              const scaled = 33 + Math.round((percent / 100) * 27);
              setStage('proxy_encoding', scaled).catch(() => undefined);
            },
          );
          await setStage('proxy_ready', 60, true);
          await this.db.query(`UPDATE media_assets SET proxy_status = 'ready' WHERE id = $1`, [assetId]);
        }

        return [proxyPath, audioExtracted];
      });

      // Section 5 (03-media-storage-brief.md): Upload proxy & preview to user connector under Brisky/
      if (isRemoteMaster && provider === 'google_drive' && job.data.connectorAccountId) {
        try {
          const driveConnector = this.connectorRegistry.get('google_drive') as any;
          const auth = await this.connectorsService.getAuthContext(
            job.data.connectorAccountId,
            userId,
          );
          if (driveConnector?.ensureBriskyStructure) {
            const folders = await driveConnector.ensureBriskyStructure(auth);
            const [proxyUpload, thumbUpload] = await Promise.all([
              driveConnector.uploadAsset(auth, folders.proxiesId, proxyPath, `${assetId}_proxy.mp4`),
              driveConnector.uploadAsset(auth, folders.previewsId, thumbnailPath, `${assetId}_thumb.jpg`),
            ]);
            await this.db.query(
              `UPDATE media_assets SET proxy_remote_id = $1, thumbnail_remote_id = $2 WHERE id = $3`,
              [proxyUpload.remoteId, thumbUpload.remoteId, assetId],
            );
            this.logger.log(
              `[03-media-storage-brief.md] Uploaded proxy & preview to user Google Drive under Brisky/ for asset ${assetId}`,
            );
          }
        } catch (connectorUploadErr) {
          this.logger.warn(
            `Failed to upload proxy/preview to user connector (intelligence and local proxy remain safe): ${connectorUploadErr}`,
          );
        }
      }

      // Stage 4: AI Analysis (concurrency-managed by GeminiIntelligenceService semaphore)
      await setStage('ai_analysis', 62, true);
      const emptyGemini: GeminiVideoAnalysis = { video_summary: '', key_themes: [], segments: [] };

      // 1. Audio transcription first — required for spoken-term search
      await setStage('transcribing_audio', 65, true);
      let transcriptResult: { transcript: TranscriptCue[]; usage: ModelUsage | null } = {
        transcript: [],
        usage: null,
      };

      if (audioOk) {
        const preferredProvider = this.configService.get<string>(
          'TRANSCRIPTION_PROVIDER',
          'whisper',
        );

        if (preferredProvider === 'whisper' && this.whisperService.isAvailable()) {
          try {
            transcriptResult = await this.whisperService.transcribeAudio(audioPath);
          } catch (whisperErr) {
            const msg = whisperErr instanceof Error ? whisperErr.message : String(whisperErr);
            this.logger.warn(
              `faster-whisper failed (${msg}); falling back to Gemini cloud transcription`,
            );
            transcriptResult = await this.geminiService.transcribeAudio(audioPath);
          }
        } else {
          transcriptResult = await this.geminiService.transcribeAudio(audioPath);
        }
      }

      if (metadata.hasAudio) {
        const cues = transcriptResult.transcript;
        const chars = cues.reduce((n, cue) => n + (cue.text || '').trim().length, 0);
        const minChars = Math.max(40, Math.round(metadata.duration * 2.5));
        if (chars < minChars) {
          this.logger.warn(
            `Sparse or thin transcription (${chars} chars across ${cues.length} cues for ${metadata.duration.toFixed(0)}s audio; expected ~${minChars} for continuous speech). Continuing with visual/OCR indexing.`,
          );
        }
      }
      await setStage('audio_transcribed', 70, true);

      // 2. Visual analysis & native video understanding (concurrency-gated)
      await setStage('analyzing_visuals', 72, true);
      const [visualResult, geminiResult] = await Promise.all([
        this.geminiService.analyzeFrames(scenes).catch((err) => {
          this.logger.warn(`Frame analysis failed: ${err instanceof Error ? err.message : err}`);
          return { observations: [], usage: null };
        }),
        this.geminiService.analyzeVideo(effectiveSourcePath).catch((err) => {
          this.logger.warn(`Gemini video failed: ${err instanceof Error ? err.message : err}`);
          return { analysis: emptyGemini, usage: null };
        }),
      ]);
      await setStage('visuals_analyzed', 82, true);

      const usages: ModelUsage[] = [
        visualResult.usage,
        transcriptResult.usage,
        geminiResult.usage,
      ].filter((u): u is ModelUsage => Boolean(u));

      // Stage 5: Intelligence Merge & Embeddings
      await setStage('intelligence_merge', 85, true);
      const artifacts = await this.mergerService.mergeAndPersist({
        assetId,
        originalFilename,
        checksum,
        originalPath: isRemoteMaster ? '' : effectiveSourcePath,
        proxyPath,
        thumbnailPath,
        scratchDir: scratch,
        metadata,
        scenes,
        visual: visualResult.observations,
        transcript: transcriptResult.transcript,
        gemini: 'analysis' in geminiResult ? geminiResult.analysis : emptyGemini,
        usages,
        timings,
        indexStartedAt,
      });
      await setStage('embeddings_generated', 93, true);

      // Stage 6: Persist Segments & Raw Observations into PostgreSQL
      await setStage('database_persistence', 95, true);
      await this.persistToDatabase({
        assetId,
        userId,
        artifacts,
        proxyPath,
        thumbnailPath,
        sourcePath: isRemoteMaster ? '' : effectiveSourcePath,
        isRemoteMaster,
      });
      await setStage('database_persisted', 98, true);

      // Enforce the Phase 4 Core Thesis: "We keep the intelligence, not the tape."
      // Ephemeral scratch (downloaded master bytes, extracted frames, temp audio) is purged.
      if (fs.existsSync(scratch)) {
        try {
          fs.rmSync(scratch, { recursive: true, force: true });
          this.logger.log(`[MediaConnector: ${provider}] Purged ephemeral scratch directory: ${scratch}`);
        } catch (purgeErr) {
          this.logger.warn(`Could not unlink ephemeral scratch directory: ${purgeErr}`);
        }
      }

      // Mark Complete
      await setStage('completed', 100, true);
      await this.db.query(
        `UPDATE media_assets
         SET status = 'indexed', stage = 'completed', progress = 100,
             cost_usd = $1, cost_per_source_minute_usd = $2,
             frames_analyzed = $3, scene_count = $4,
             index_duration_ms = $5, proxy_status = 'ready', availability = 'online',
             indexed_at = NOW(), updated_at = NOW()
         WHERE id = $6`,
        [
          artifacts.cost.estimatedUsd,
          artifacts.cost.costPerSourceMinuteUsd,
          artifacts.cost.framesAnalyzed,
          artifacts.cost.sceneCount,
          artifacts.cost.indexDurationMs,
          assetId,
        ],
      );

      await this.db.query(
        `UPDATE indexing_jobs
         SET status = 'completed', stage = 'completed', progress = 100,
             timings = $1, cost = $2, provider = 'google', model = $3, finished_at = NOW()
         WHERE bull_job_id = $4`,
        [
          JSON.stringify(timings),
          JSON.stringify(artifacts.cost),
          this.geminiService.getPrimaryModel(),
          job.id,
        ],
      );

      this.logger.log(`Finished indexing ${assetId} in ${artifacts.cost.indexDurationMs}ms`);
    } catch (err: unknown) {
      let message = err instanceof Error ? err.message : String(err);
      if (
        message.includes('Cannot determine format of input stream') ||
        message.includes('partial file') ||
        message.includes('after EOF')
      ) {
        message = 'Incomplete or corrupted video file (stream ended abruptly after EOF). The source video appears truncated or partially downloaded.';
      }
      
      const currentAttempt = (job.attemptsMade || 0) + 1;
      const maxAttempts = job.opts?.attempts || 2;
      const hasRetriesRemaining = currentAttempt < maxAttempts;

      if (hasRetriesRemaining) {
        this.logger.warn(
          `Indexing attempt ${currentAttempt}/${maxAttempts} failed for asset ${assetId}: ${message}. BullMQ will retry with backoff.`,
        );
        await this.db.query(
          `UPDATE media_assets
           SET status = 'processing', stage = 'retrying', error = $1, updated_at = NOW()
           WHERE id = $2`,
          [`Attempt ${currentAttempt}/${maxAttempts} failed: ${message}`, assetId],
        );
        await this.db.query(
          `UPDATE indexing_jobs
           SET status = 'active', stage = 'retrying', error = $1, attempts = $2
           WHERE bull_job_id = $3`,
          [`Attempt ${currentAttempt}/${maxAttempts} failed: ${message}`, currentAttempt, job.id],
        );
      } else {
        this.logger.error(
          `Indexing permanently failed for asset ${assetId} after ${currentAttempt} attempts: ${message}`,
          err instanceof Error ? err.stack : undefined,
        );
        await this.db.query(
          `UPDATE media_assets
           SET status = 'failed', stage = 'failed', error = $1,
               proxy_status = CASE WHEN proxy_status = 'ready' THEN 'ready' ELSE 'failed' END,
               updated_at = NOW()
           WHERE id = $2`,
          [message, assetId],
        );
        await this.db.query(
          `UPDATE indexing_jobs
           SET status = 'failed', stage = 'failed', error = $1, attempts = $2, finished_at = NOW()
           WHERE bull_job_id = $3`,
          [message, currentAttempt, job.id],
        );
      }

      // Cleanup ephemeral scratch master if downloaded
      const scratchMaster = path.join(this.scratchDir, assetId, 'source.mp4');
      if (fs.existsSync(scratchMaster)) {
        try {
          fs.unlinkSync(scratchMaster);
        } catch { /* ignore */ }
      }

      // CRITICAL: Rethrow error so BullMQ registers the failure, triggers backoff retries,
      // and properly transitions the job to failed / dead-letter status.
      throw err;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<IndexingJobData>) {
    this.logger.log(`BullMQ job ${job.id} (asset: ${job.data?.assetId}) completed successfully.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<IndexingJobData>, err: Error) {
    this.logger.error(
      `BullMQ job ${job.id} (asset: ${job.data?.assetId}) failed after ${job.attemptsMade} attempts: ${err.message}`,
    );
  }

  private async persistToDatabase(params: {
    assetId: string;
    userId: string;
    artifacts: any;
    proxyPath: string;
    thumbnailPath: string;
    sourcePath: string;
    isRemoteMaster?: boolean;
  }) {
    const { assetId, userId, artifacts, proxyPath, thumbnailPath, sourcePath, isRemoteMaster } = params;

    // Update asset paths
    await this.db.query(
      `UPDATE media_assets
       SET proxy_path = $1, thumbnail_path = $2, original_path = $3, original_deleted = $4
       WHERE id = $5`,
      [proxyPath, thumbnailPath, sourcePath, Boolean(isRemoteMaster), assetId],
    );

    // Delete any old segments for this asset
    await this.db.query('DELETE FROM media_segments WHERE asset_id = $1', [assetId]);

    // Insert Segments with pgvector (supporting both 3072-dim and 384-dim multi-model embeddings)
    for (const seg of artifacts.segments || []) {
      const embeddingValues = seg.embedding || [];
      const dim = seg.embeddingDim || embeddingValues.length;
      const embeddingStr =
        embeddingValues.length > 0 ? `[${embeddingValues.join(',')}]` : null;
      const is384 = dim === 384;
      const is3072 = dim === 3072;

      await this.db.query(
        `INSERT INTO media_segments (
           id, asset_id, user_id, start_time, end_time, title, description,
           visual_objects, actions, transcript_text, on_screen_text,
           keyframe_path, sources, provider, model, embedding, embedding_384, embedding_dim, analysis_version,
           keyframe_paths
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11,
           $12, $13, $14, $15,
           $16::vector, $17::vector, $18, $19,
           $20::jsonb
         )`,
        [
          seg.id,
          assetId,
          userId,
          seg.startTime,
          seg.endTime,
          seg.title || '',
          seg.description || '',
          seg.visualObjects || [],
          seg.actions || [],
          seg.transcriptText || '',
          seg.onScreenText || [],
          seg.keyframePath || '',
          seg.sources || [],
          seg.provider || 'google',
          seg.model || 'gemini-2.5-flash',
          is3072 ? embeddingStr : null,
          is384 ? embeddingStr : null,
          dim || 3072,
          seg.analysisVersion || 2,
          JSON.stringify(seg.keyframePaths || []),
        ],
      );
    }

    // Persist Raw Observations
    await this.db.query('DELETE FROM media_observations WHERE asset_id = $1', [assetId]);

    for (const obs of artifacts.visual || []) {
      await this.db.query(
        `INSERT INTO media_observations (asset_id, user_id, observation_type, timestamp_start, timestamp_end, raw_data)
         VALUES ($1, $2, 'frame', $3, $4, $5)`,
        [assetId, userId, obs.timestamp, obs.timestamp, JSON.stringify(obs)],
      );
    }

    for (const cue of artifacts.transcript || []) {
      if (!cue.text?.trim()) continue;
      await this.db.query(
        `INSERT INTO media_observations (asset_id, user_id, observation_type, timestamp_start, timestamp_end, raw_data)
         VALUES ($1, $2, 'transcript', $3, $4, $5)`,
        [assetId, userId, cue.start_time, cue.end_time, JSON.stringify(cue)],
      );
    }

    if (artifacts.gemini?.segments) {
      for (const gSeg of artifacts.gemini.segments) {
        await this.db.query(
          `INSERT INTO media_observations (asset_id, user_id, observation_type, timestamp_start, timestamp_end, raw_data)
           VALUES ($1, $2, 'gemini_segment', $3, $4, $5)`,
          [assetId, userId, gSeg.start_time, gSeg.end_time, JSON.stringify(gSeg)],
        );
      }
    }
  }

  private async cloneExistingAsset(donorId: string, recipientId: string, userId: string) {
    // Copy metadata and paths from donor
    const donorRes = await this.db.query(
      `SELECT duration, width, height, fps, codec, has_audio,
              proxy_path, thumbnail_path, cost_usd, cost_per_source_minute_usd,
              frames_analyzed, scene_count, index_duration_ms
       FROM media_assets
       WHERE id = $1`,
      [donorId],
    );

    if (donorRes.rows.length > 0) {
      const d = donorRes.rows[0];
      await this.db.query(
        `UPDATE media_assets
         SET duration = $1, width = $2, height = $3, fps = $4, codec = $5, has_audio = $6,
             proxy_path = $7, thumbnail_path = $8, cost_usd = 0, cost_per_source_minute_usd = 0,
             frames_analyzed = $9, scene_count = $10, index_duration_ms = 0, indexed_at = NOW(),
             parent_asset_id = $11, relationship_type = 'duplicate',
             proxy_status = 'ready', availability = 'online'
         WHERE id = $12`,
        [
          d.duration,
          d.width,
          d.height,
          d.fps,
          d.codec,
          d.has_audio,
          d.proxy_path,
          d.thumbnail_path,
          d.frames_analyzed,
          d.scene_count,
          donorId,
          recipientId,
        ],
      );

      // Record Media Registry edge
      await this.db.query(
        `INSERT INTO asset_relationships (source_asset_id, target_asset_id, relationship_type, confidence)
         VALUES ($1, $2, 'duplicate_of', 1.0)
         ON CONFLICT (source_asset_id, target_asset_id, relationship_type) DO NOTHING`,
        [donorId, recipientId],
      );
    }

    // Clone segments with multi-model embeddings
    const segs = await this.db.query(
      `SELECT start_time, end_time, title, description, visual_objects, actions,
              transcript_text, on_screen_text, keyframe_path, keyframe_paths, sources, provider, model,
              embedding::text AS embedding, embedding_384::text AS embedding_384, embedding_dim
       FROM media_segments
       WHERE asset_id = $1`,
      [donorId],
    );

    for (let i = 0; i < segs.rows.length; i++) {
      const s = segs.rows[i];
      const newSegId = `${recipientId}_seg_${String(i + 1).padStart(3, '0')}`;
      await this.db.query(
        `INSERT INTO media_segments (
           id, asset_id, user_id, start_time, end_time, title, description,
           visual_objects, actions, transcript_text, on_screen_text,
           keyframe_path, keyframe_paths, sources, provider, model, embedding, embedding_384, embedding_dim, analysis_version
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11,
           $12, $13::jsonb, $14, $15, $16,
           $17::vector, $18::vector, $19, $20
         )`,
        [
          newSegId,
          recipientId,
          userId,
          s.start_time,
          s.end_time,
          s.title,
          s.description,
          s.visual_objects,
          s.actions,
          s.transcript_text,
          s.on_screen_text,
          s.keyframe_path,
          s.keyframe_paths,
          s.sources,
          s.provider,
          s.model,
          s.embedding,
          s.embedding_384,
          s.embedding_dim || 3072,
          ANALYSIS_VERSION,
        ],
      );
    }

    // Clone raw media observations for auditability and artifact inspection
    const obs = await this.db.query(
      `SELECT observation_type, timestamp_start, timestamp_end, raw_data
       FROM media_observations
       WHERE asset_id = $1`,
      [donorId],
    );

    for (const o of obs.rows) {
      await this.db.query(
        `INSERT INTO media_observations (
           asset_id, user_id, observation_type, timestamp_start, timestamp_end, raw_data
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          recipientId,
          userId,
          o.observation_type,
          o.timestamp_start,
          o.timestamp_end,
          JSON.stringify(o.raw_data),
        ],
      );
    }
  }
}
