import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, DelayedError } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import { FfmpegPipelineService } from '../pipeline/ffmpeg-pipeline.service';
import { GeminiIntelligenceService } from '../pipeline/gemini-intelligence.service';
import { IntelligenceMergerService } from '../pipeline/intelligence-merger.service';
import { WhisperTranscriptionService } from '../pipeline/whisper-transcription.service';
import {
  FactoryJobEnvelope,
  IndexingJobData,
  isIndexUnitJob,
  normalizeJobEnvelope,
  unitTypeToJobType,
} from './indexing.types';
import { IndexingService } from './indexing.service';
import {
  ANALYSIS_VERSION,
  FrameObservation,
  GeminiVideoAnalysis,
  ModelUsage,
  SceneBoundary,
  StageTiming,
  TranscriptCue,
} from '../pipeline/pipeline.types';
import { resolveFromRepo } from '../../common/repo-paths';
import { resolveStorageLocator, toStorageLocator } from '../../common/storage-paths';
import { materializeKeyframeFiles } from '../pipeline/scene-sampling';
import { ConnectorRegistry } from '../connector/connector.registry';
import { ConnectorsService } from '../connector/connectors.service';
import { persistDurableKeyframes } from '../pipeline/durable-keyframes';
import { ProcessingUnitsService } from '../pipeline/processing-units.service';
import { ProxyCacheService } from '../pipeline/proxy-cache.service';
import { FactorySchedulerService } from './factory-scheduler.service';

const workerConcurrency = Number(process.env.GLOBAL_MAX_ACTIVE_JOBS || 2);

@Processor('indexing-queue', { concurrency: workerConcurrency })
export class IndexingProcessor extends WorkerHost {
  private readonly logger = new Logger(IndexingProcessor.name);
  private storageRoot: string;
  private proxyDir: string;
  private thumbnailDir: string;
  private scratchDir: string;
  private keyframesDir: string;
  private clipsDir: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly ffmpegPipeline: FfmpegPipelineService,
    private readonly geminiService: GeminiIntelligenceService,
    private readonly whisperService: WhisperTranscriptionService,
    private readonly mergerService: IntelligenceMergerService,
    private readonly configService: ConfigService,
    private readonly connectorRegistry: ConnectorRegistry,
    private readonly connectorsService: ConnectorsService,
    private readonly unitsService: ProcessingUnitsService,
    private readonly proxyCacheService?: ProxyCacheService,
    private readonly scheduler?: FactorySchedulerService,
    private readonly indexingService?: IndexingService,
  ) {
    super();
    this.storageRoot = resolveFromRepo(
      this.configService.get<string>('STORAGE_ROOT', './storage'),
    );
    this.proxyDir = path.join(this.storageRoot, 'proxies');
    this.thumbnailDir = path.join(this.storageRoot, 'thumbnails');
    this.scratchDir = path.join(this.storageRoot, 'scratch');
    this.keyframesDir = path.join(this.storageRoot, 'keyframes');
    this.clipsDir = path.join(this.storageRoot, 'clips');
    this.scratchMaxBytes =
      Number(this.configService.get('WORKER_SCRATCH_MAX_MB', 512)) * 1024 * 1024;
    // Full-file downloads are not a "working buffer". Until range ingest is the
    // default index path, allow much larger masters than the 512 MB slice cap.
    this.fullDownloadMaxBytes =
      Number(this.configService.get('WORKER_FULL_DOWNLOAD_MAX_MB', 16384)) * 1024 * 1024;

    [this.storageRoot, this.proxyDir, this.thumbnailDir, this.scratchDir, this.keyframesDir, this.clipsDir].forEach((dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
    this.sweepStaleScratch();
  }

  private locator(absPath: string): string {
    return toStorageLocator(absPath, this.storageRoot);
  }

  private cleanupJobScratch(scratch: string): void {
    if (scratch && fs.existsSync(scratch)) {
      try {
        fs.rmSync(scratch, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private sweepStaleScratch(): void {
    if (!fs.existsSync(this.scratchDir)) return;
    const maxAgeMs = 60 * 60 * 1000;
    const now = Date.now();
    try {
      for (const name of fs.readdirSync(this.scratchDir)) {
        const full = path.join(this.scratchDir, name);
        try {
          const st = fs.statSync(full);
          if (now - st.mtimeMs > maxAgeMs) {
            fs.rmSync(full, { recursive: true, force: true });
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  private readonly scratchMaxBytes: number;
  private readonly fullDownloadMaxBytes: number;

  /**
   * Distributed per-asset processing lock (see asset_processing_locks in
   * schema.sql). Unlike the FactorySchedulerService's advisory-lock-based
   * slot claim, this must stay held across an entire job's duration — which
   * can run well over an hour — so it's a row in a dedicated table rather
   * than a Postgres advisory lock, which would otherwise require pinning one
   * pooled DB connection per in-flight job for that whole time.
   */
  private async claimAssetLock(assetId: string, bullJobId: string): Promise<boolean> {
    const res = await this.db.query<{ asset_id: string }>(
      `INSERT INTO asset_processing_locks (asset_id, bull_job_id, locked_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (asset_id) DO UPDATE
         SET bull_job_id = EXCLUDED.bull_job_id, locked_at = NOW()
         WHERE asset_processing_locks.locked_at < NOW() - INTERVAL '3 hours'
       RETURNING asset_id`,
      [assetId, bullJobId],
    );
    return res.rows.length > 0;
  }

  private async releaseAssetLock(assetId: string, bullJobId: string): Promise<void> {
    await this.db
      .query(
        `DELETE FROM asset_processing_locks WHERE asset_id = $1 AND bull_job_id = $2`,
        [assetId, bullJobId],
      )
      .catch((err) =>
        this.logger.warn(`Failed to release asset processing lock for ${assetId}: ${err}`),
      );
  }

  private getDirectorySize(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0;
    let total = 0;
    try {
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        try {
          if (file.isDirectory()) {
            total += this.getDirectorySize(fullPath);
          } else if (file.isFile()) {
            total += fs.statSync(fullPath).size;
          }
        } catch {
          // ignore transient files
        }
      }
    } catch {
      // ignore
    }
    return total;
  }

  private checkScratchCapacity(
    scratchDir: string,
    incomingBytes = 0,
    kind: 'working' | 'full_download' = 'working',
  ): void {
    const currentBytes = this.getDirectorySize(scratchDir);
    const total = currentBytes + incomingBytes;
    const limit = kind === 'full_download' ? this.fullDownloadMaxBytes : this.scratchMaxBytes;
    const limitName =
      kind === 'full_download' ? 'WORKER_FULL_DOWNLOAD_MAX_MB' : 'WORKER_SCRATCH_MAX_MB';
    if (total > limit) {
      const totalMb = (total / (1024 * 1024)).toFixed(1);
      const maxMb = (limit / (1024 * 1024)).toFixed(0);
      throw new Error(
        `scratch_exhausted: scratch directory would require ${totalMb} MB, exceeding ${limitName} limit (${maxMb} MB)`,
      );
    }
  }

  async process(job: Job<IndexingJobData | FactoryJobEnvelope>): Promise<void> {
    const envelope = normalizeJobEnvelope(job.data);
    const assetId = envelope.asset_id;
    const originalFilename = envelope.source.originalFilename || 'unnamed';

    // Phase F5: atomically claim a slot (advisory lock + mark active) so two
    // worker containers cannot both pass GLOBAL_MAX_ACTIVE_JOBS.
    if (this.scheduler?.claimSlot) {
      const slotCheck = await this.scheduler.claimSlot(
        String(job.id || ''),
        assetId,
        envelope.user_id,
        envelope.priority,
      );
      if (!slotCheck.canRun) {
        this.logger.log(
          `[FactoryScheduler] Job ${job.id} for asset ${assetId} waiting for ${slotCheck.waitingReason}. Yielding worker slot.`,
        );
        await this.scheduler.recordWaitingReason(
          job.id || '',
          assetId,
          slotCheck.waitingReason!,
        );
        const delayMs = 4000;
        if (typeof job.moveToDelayed === 'function') {
          await job.moveToDelayed(Date.now() + delayMs, job.token);
        }
        throw new DelayedError();
      }
    }

    // Concurrency guard: Guarantee only one worker processes this asset at a
    // time, across ALL worker processes (not just this one) — a DB row lock,
    // not an in-memory Set, since multiple worker containers share nothing else.
    const bullJobId = String(job.id || '');
    const gotAssetLock = await this.claimAssetLock(assetId, bullJobId);
    if (!gotAssetLock) {
      if (isIndexUnitJob(envelope.job_type) || envelope.job_type === 'plan_asset') {
        this.logger.log(
          `[F2] Asset ${assetId} already has an active unit; delaying job ${job.id} (${envelope.job_type})`,
        );
        if (this.scheduler?.releaseSlot) {
          await this.scheduler.releaseSlot(bullJobId).catch(() => undefined);
        }
        if (typeof job.moveToDelayed === 'function') {
          await job.moveToDelayed(Date.now() + 4000, job.token);
        }
        throw new DelayedError();
      }
      this.logger.warn(
        `Asset ${assetId} (${originalFilename}) is already actively being processed by another worker instance. Skipping duplicate job ${job.id}.`,
      );
      if (this.scheduler?.releaseSlot) {
        await this.scheduler.releaseSlot(bullJobId).catch(() => undefined);
      }
      return;
    }

    const heartbeat = this.scheduler?.heartbeat
      ? setInterval(() => {
          this.scheduler!.heartbeat(String(job.id || '')).catch(() => undefined);
        }, 30_000)
      : null;

    if (!this.scheduler?.claimSlot) {
      await this.db.query(
        `UPDATE indexing_jobs
         SET status = 'active', stage = 'active', last_heartbeat_at = NOW(), updated_at = NOW()
         WHERE bull_job_id = $1 AND status = 'waiting'`,
        [job.id],
      ).catch(() => undefined);
    }

    try {
      if (envelope.job_type === 'generate_proxy') {
        await this.executeGenerateProxy(job, envelope);
      } else if (envelope.job_type === 'extract_clip') {
        await this.executeExtractClip(job, envelope);
      } else if (envelope.job_type === 'transcribe' || envelope.job_type === 'extract_audio') {
        await this.executeTranscribeOnly(job, envelope);
      } else if (envelope.job_type === 'analyze_frames') {
        await this.executeAnalyzeFrames(job, envelope);
      } else if (envelope.job_type === 'gemini_video') {
        await this.executeGeminiVideo(job, envelope);
      } else if (envelope.job_type === 'embed') {
        await this.executeEmbed(job, envelope);
      } else if (envelope.job_type === 'finalize_asset') {
        await this.executeFinalize(job, envelope);
      } else {
        await this.executeProcessing(job, envelope);
      }
    } catch (err: any) {
      this.logger.error(`Unhandled error during worker job execution for ${assetId}: ${err?.message || err}`);
      if (this.scheduler?.releaseSlot) {
        await this.scheduler.releaseSlot(bullJobId, true, err?.message || String(err)).catch(() => undefined);
      }
      throw err;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      await this.releaseAssetLock(assetId, bullJobId);
    }
  }

  private async executeGenerateProxy(
    job: Job<IndexingJobData | FactoryJobEnvelope>,
    envelope: FactoryJobEnvelope,
  ): Promise<void> {
    const assetId = envelope.asset_id;
    const userId = envelope.user_id;
    const provider = envelope.source.provider || 'upload';
    const remoteId = envelope.source.remoteId;
    const connectorAccountId = envelope.source.connectorAccountId;
    const sourcePath = envelope.source.sourcePath || '';
    const originalFilename = envelope.source.originalFilename || '';
    const jobId = envelope.job_id || job.id || assetId;
    const scratch = path.join(this.scratchDir, String(jobId));
    const proxyPath = path.join(this.proxyDir, `${assetId}.mp4`);

    this.logger.log(`Starting on-demand proxy generation for asset ${assetId} (job: ${jobId})`);

    if (fs.existsSync(proxyPath) && fs.statSync(proxyPath).size > 0) {
      await this.db.query(
        `UPDATE media_assets SET proxy_status = 'ready', proxy_path = $1, updated_at = NOW() WHERE id = $2`,
        [this.locator(proxyPath), assetId],
      );
      await this.db.query(
        `UPDATE indexing_jobs SET status = 'completed', stage = 'completed', progress = 100, finished_at = NOW() WHERE bull_job_id = $1`,
        [job.id],
      );
      return;
    }

    fs.mkdirSync(scratch, { recursive: true });
    fs.mkdirSync(this.proxyDir, { recursive: true });

    try {
      await this.db.query(
        `UPDATE media_assets SET proxy_status = 'processing', updated_at = NOW() WHERE id = $1`,
        [assetId],
      );

      let effectiveSourcePath = sourcePath;
      const isRemoteMaster = provider !== 'upload' && Boolean(remoteId);
      const incomingSize = envelope.source.fileSize || 0;
      let accessMode = 'local';
      let bytesRead = 0;

      if (isRemoteMaster) {
        this.checkScratchCapacity(scratch, incomingSize, 'full_download');
        const sourceExt = path.extname(originalFilename) || '.mp4';
        effectiveSourcePath = path.join(scratch, `source${sourceExt}`);
        const normalizedProvider = provider === 'drive' ? 'google_drive' : provider;
        const connector = this.connectorRegistry.get(normalizedProvider);
        const auth = await this.connectorsService.getAuthContext(connectorAccountId!, userId);
        await connector.downloadAsset(auth, remoteId!, effectiveSourcePath);
        bytesRead = fs.existsSync(effectiveSourcePath)
          ? fs.statSync(effectiveSourcePath).size
          : incomingSize;
        accessMode = 'full_download';
      } else if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source file not found on disk: ${sourcePath}`);
      } else {
        bytesRead = fs.statSync(sourcePath).size;
      }

      await this.ffmpegPipeline.generateProxy(effectiveSourcePath, proxyPath);

      // Phase F4: Purge master video immediately from scratch after proxy is generated
      if (isRemoteMaster && fs.existsSync(effectiveSourcePath)) {
        try {
          fs.unlinkSync(effectiveSourcePath);
          this.logger.log(
            `[Phase F4] Purged master video from scratch immediately after proxy generation: ${effectiveSourcePath}`,
          );
        } catch {
          /* ignore */
        }
      }

      if (this.proxyCacheService) {
        await this.proxyCacheService.enforceLimit();
      }

      if (isRemoteMaster && connectorAccountId) {
        try {
          const normalizedProvider = provider === 'drive' ? 'google_drive' : provider;
          const driveConnector = this.connectorRegistry.get(normalizedProvider) as any;
          const auth = await this.connectorsService.getAuthContext(connectorAccountId, userId);
          if (driveConnector?.ensureBriskyStructure && driveConnector.uploadAsset) {
            const folders = await driveConnector.ensureBriskyStructure(auth);
            if (folders.proxiesId) {
              const uploaded = await driveConnector.uploadAsset(
                auth,
                folders.proxiesId,
                proxyPath,
                `${assetId}_proxy.mp4`,
              );
              await this.db.query(
                `UPDATE media_assets SET proxy_remote_id = $1 WHERE id = $2`,
                [uploaded.remoteId, assetId],
              );
            }
          }
        } catch (uploadErr) {
          this.logger.warn(
            `Could not write proxy ${assetId} back to connector: ${uploadErr}`,
          );
          throw uploadErr;
        }
      }

      await this.db.query(
        `UPDATE media_assets SET proxy_status = 'ready', proxy_path = $1, updated_at = NOW() WHERE id = $2`,
        [this.locator(proxyPath), assetId],
      );
      await this.db.query(
        `UPDATE indexing_jobs SET status = 'completed', stage = 'completed', progress = 100, access_mode = $1, bytes_read = $2, finished_at = NOW() WHERE bull_job_id = $3`,
        [accessMode, bytesRead, job.id],
      );
      this.logger.log(`Finished on-demand proxy generation for asset ${assetId}`);
    } catch (err) {
      this.logger.error(`Failed to generate proxy on-demand for asset ${assetId}: ${err}`);
      await this.db.query(
        `UPDATE media_assets SET proxy_status = 'failed', error = $1, updated_at = NOW() WHERE id = $2`,
        [String(err), assetId],
      );
      await this.db.query(
        `UPDATE indexing_jobs SET status = 'failed', stage = 'failed', error = $1, finished_at = NOW() WHERE bull_job_id = $2`,
        [String(err), job.id],
      );
      throw err;
    } finally {
      this.cleanupJobScratch(scratch);
    }
  }

  private async executeTranscribeOnly(
    job: Job<IndexingJobData | FactoryJobEnvelope>,
    envelope: FactoryJobEnvelope,
  ): Promise<void> {
    const assetId = envelope.asset_id;
    const userId = envelope.user_id;
    const provider = envelope.source.provider || 'upload';
    const remoteId = envelope.source.remoteId;
    const connectorAccountId = envelope.source.connectorAccountId;
    const sourcePath = envelope.source.sourcePath || '';
    const originalFilename = envelope.source.originalFilename || 'source.mp4';
    const fileSize = envelope.source.fileSize || 0;
    const jobId = envelope.job_id || job.id || assetId;
    const scratch = path.join(this.scratchDir, String(jobId));

    fs.mkdirSync(scratch, { recursive: true });

    const existingUnit = await this.unitsService.getUnit?.(assetId, 'audio_transcribe');
    if (existingUnit?.status === 'completed') {
      await this.db.query(
        `UPDATE indexing_jobs SET status = 'completed', stage = 'completed', progress = 100, finished_at = NOW() WHERE bull_job_id = $1`,
        [job.id],
      );
      return;
    }

    let effectiveSourcePath = sourcePath;
    const isRemoteMaster = provider !== 'upload' && Boolean(remoteId);
    let bytesRead = 0;
    let accessMode = 'local';

    try {
      if (isRemoteMaster) {
        this.checkScratchCapacity(scratch, fileSize, 'full_download');
        const sourceExt = path.extname(originalFilename) || '.mp4';
        effectiveSourcePath = path.join(scratch, `source${sourceExt}`);
        const normalizedProvider = provider === 'drive' ? 'google_drive' : provider;
        const connector = this.connectorRegistry.get(normalizedProvider);
        const auth = await this.connectorsService.getAuthContext(connectorAccountId!, userId);
        await connector.downloadAsset(auth, remoteId!, effectiveSourcePath);
        bytesRead = fs.existsSync(effectiveSourcePath)
          ? fs.statSync(effectiveSourcePath).size
          : fileSize;
        accessMode = 'full_download';
      } else if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source video file not found on disk: ${sourcePath}`);
      } else {
        bytesRead = fs.statSync(sourcePath).size;
      }

      const audioPath = path.join(scratch, 'audio.wav');
      await this.ffmpegPipeline.extractAudio(effectiveSourcePath, audioPath);

      // Phase F4: Purge master video immediately from scratch after audio extraction!
      if (isRemoteMaster && fs.existsSync(effectiveSourcePath)) {
        try {
          fs.unlinkSync(effectiveSourcePath);
          this.logger.log(
            `[Phase F4] Purged master video from scratch immediately after audio extraction: ${effectiveSourcePath}`,
          );
        } catch {
          /* ignore */
        }
      }

      let transcriptCues: TranscriptCue[] = [];
      if (this.whisperService.isAvailable()) {
        try {
          const result = await this.whisperService.transcribeAudio(audioPath);
          transcriptCues = result.transcript || [];
        } catch {
          const result = await this.geminiService.transcribeAudio(audioPath);
          transcriptCues = result.transcript || [];
        }
      } else {
        const result = await this.geminiService.transcribeAudio(audioPath);
        transcriptCues = result.transcript || [];
      }

      await this.persistTranscriptObservations(assetId, userId, transcriptCues);
      await this.unitsService.markUnitCompleted?.(assetId, 'audio_transcribe', {
        transcript: transcriptCues,
      });

      if (fs.existsSync(audioPath)) {
        try {
          fs.unlinkSync(audioPath);
        } catch {
          /* ignore */
        }
      }

      await this.db.query(
        `UPDATE indexing_jobs SET status = 'completed', stage = 'completed', progress = 100, access_mode = $1, bytes_read = $2, finished_at = NOW() WHERE bull_job_id = $3`,
        [accessMode, bytesRead, job.id],
      );
      this.logger.log(
        `[Phase F4] Finished transcribe-only job for asset ${assetId} without retaining master tape`,
      );
    } catch (err) {
      this.logger.error(`Failed transcribe-only job for asset ${assetId}: ${err}`);
      await this.db.query(
        `UPDATE indexing_jobs SET status = 'failed', stage = 'failed', error = $1, finished_at = NOW() WHERE bull_job_id = $2`,
        [String(err), job.id],
      );
      throw err;
    } finally {
      this.cleanupJobScratch(scratch);
    }
  }

  private async executeExtractClip(
    job: Job<IndexingJobData | FactoryJobEnvelope>,
    envelope: FactoryJobEnvelope,
  ): Promise<void> {
    const parentAssetId = envelope.asset_id;
    const userId = envelope.user_id;
    const provider = envelope.source.provider || 'upload';
    const remoteId = envelope.source.remoteId;
    const connectorAccountId = envelope.source.connectorAccountId;
    const sourcePath = envelope.source.sourcePath || '';
    const originalFilename = envelope.source.originalFilename || 'source.mp4';
    const jobId = envelope.job_id || job.id || parentAssetId;
    const scratch = path.join(this.scratchDir, String(jobId));

    const startS = envelope.segment?.start_s || 0;
    const endS = envelope.segment?.end_s || (startS + 10);
    const duration = Math.max(0.1, endS - startS);
    const clipAssetId = `clip_${randomBytes(8).toString('hex')}`;
    const clipFilename = `clip_${path.parse(originalFilename).name}_${Math.round(startS)}s_${Math.round(endS)}s.mp4`;
    const clipPath = path.join(this.clipsDir, `${clipAssetId}.mp4`);

    this.logger.log(
      `Starting clip extraction for asset ${parentAssetId} [${startS}s - ${endS}s] -> derived asset ${clipAssetId}`,
    );

    fs.mkdirSync(scratch, { recursive: true });
    fs.mkdirSync(this.clipsDir, { recursive: true });

    try {
      let effectiveSourcePath = sourcePath;
      const isRemoteMaster = provider !== 'upload' && Boolean(remoteId);
      const localProxyPath = path.join(this.proxyDir, `${parentAssetId}.mp4`);
      let accessMode = 'local';
      let bytesRead = 0;

      if (fs.existsSync(localProxyPath) && fs.statSync(localProxyPath).size > 0) {
        effectiveSourcePath = localProxyPath;
        accessMode = 'local';
        bytesRead = fs.statSync(localProxyPath).size;
        await this.ffmpegPipeline.extractClip(effectiveSourcePath, clipPath, startS, endS);
      } else if (isRemoteMaster) {
        const assetRes = await this.db.query(
          `SELECT duration, file_size FROM media_assets WHERE id = $1`,
          [parentAssetId],
        );
        const parentDuration = Number(assetRes.rows[0]?.duration || 0);
        const parentFileSize = Number(
          assetRes.rows[0]?.file_size || envelope.source.fileSize || 0,
        );
        const normalizedProvider = provider === 'drive' ? 'google_drive' : provider;
        const connector = this.connectorRegistry.get(normalizedProvider);
        const auth = await this.connectorsService.getAuthContext(connectorAccountId!, userId);
        const sourceExt = path.extname(originalFilename) || '.mp4';
        effectiveSourcePath = path.join(scratch, `source${sourceExt}`);

        let usedRanged = false;
        if (
          connector.capabilities?.can_range_read &&
          typeof connector.getByteRange === 'function' &&
          parentDuration > 0 &&
          parentFileSize > 0
        ) {
          const byteRate = parentFileSize / parentDuration;
          const padBefore = Math.max(0, startS - 5);
          const padAfter = Math.min(parentDuration, endS + 5);
          const startByte = Math.max(0, Math.floor(padBefore * byteRate));
          const endByte = Math.min(parentFileSize, Math.ceil(padAfter * byteRate));
          const length = Math.max(1, endByte - startByte);
          this.checkScratchCapacity(scratch, length, 'working');

          const rangedSlicePath = path.join(scratch, `ranged_slice${sourceExt}`);
          try {
            this.logger.log(
              `[Phase F4] Attempting ranged clip extraction for asset ${parentAssetId} (bytes ${startByte}-${endByte}, ${(length / 1024).toFixed(1)} KB vs total ${(parentFileSize / (1024 * 1024)).toFixed(1)} MB)`,
            );
            const stream = await connector.getByteRange(auth, remoteId!, startByte, length);
            await new Promise<void>((resolve, reject) => {
              const out = fs.createWriteStream(rangedSlicePath);
              stream.pipe(out);
              stream.on('error', reject);
              out.on('finish', resolve);
              out.on('error', reject);
            });

            const actualRangedBytes = fs.existsSync(rangedSlicePath)
              ? fs.statSync(rangedSlicePath).size
              : length;
            const sliceStartOffset = Math.max(0, startS - padBefore);
            const sliceEndOffset = sliceStartOffset + duration;
            await this.ffmpegPipeline.extractClip(
              rangedSlicePath,
              clipPath,
              sliceStartOffset,
              sliceEndOffset,
            );

            if (fs.existsSync(clipPath) && fs.statSync(clipPath).size === 0) {
              throw new Error('Ranged extraction produced 0-byte clip');
            }

            usedRanged = true;
            accessMode = 'range_read';
            bytesRead = actualRangedBytes;
            this.logger.log(
              `[Phase F4] Ranged clip extraction succeeded for ${parentAssetId}: read ${(actualRangedBytes / (1024 * 1024)).toFixed(2)} MB`,
            );
          } catch (rangeErr: any) {
            this.logger.warn(
              `[Phase F4] Ranged clip extraction failed for ${parentAssetId} (${rangeErr?.message || rangeErr}); falling back to full download`,
            );
            if (fs.existsSync(clipPath)) {
              try {
                fs.unlinkSync(clipPath);
              } catch {
                /* ignore */
              }
            }
          } finally {
            if (fs.existsSync(rangedSlicePath)) {
              try {
                fs.unlinkSync(rangedSlicePath);
              } catch {
                /* ignore */
              }
            }
          }
        }

        if (!usedRanged) {
          accessMode = 'full_download';
          this.checkScratchCapacity(scratch, parentFileSize, 'full_download');
          await connector.downloadAsset(auth, remoteId!, effectiveSourcePath);
          bytesRead = fs.existsSync(effectiveSourcePath)
            ? fs.statSync(effectiveSourcePath).size
            : parentFileSize;
          await this.ffmpegPipeline.extractClip(effectiveSourcePath, clipPath, startS, endS);
          if (fs.existsSync(effectiveSourcePath)) {
            try {
              fs.unlinkSync(effectiveSourcePath);
              this.logger.log(
                `[Phase F4] Purged master video from scratch immediately after clip extraction: ${effectiveSourcePath}`,
              );
            } catch {
              /* ignore */
            }
          }
        }
      } else if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source video file not found on disk: ${sourcePath}`);
      } else {
        accessMode = 'local';
        bytesRead = fs.statSync(sourcePath).size;
        await this.ffmpegPipeline.extractClip(sourcePath, clipPath, startS, endS);
      }

      const clipThumbPath = path.join(this.thumbnailDir, `${clipAssetId}.jpg`);
      let clipThumbData: string | null = null;
      try {
        await this.ffmpegPipeline.generateThumbnail(clipPath, clipThumbPath);
        if (fs.existsSync(clipThumbPath)) {
          const buf = await fs.promises.readFile(clipThumbPath);
          clipThumbData = `data:image/jpeg;base64,${buf.toString('base64')}`;
        }
      } catch (thumbErr) {
        this.logger.warn(`Could not generate thumbnail for clip ${clipAssetId}: ${thumbErr}`);
      }

      const clipStat = fs.existsSync(clipPath) ? fs.statSync(clipPath) : null;
      const clipSize = clipStat ? clipStat.size : 0;
      let clipChecksum: string;
      if (fs.existsSync(clipPath) && clipSize > 0) {
        clipChecksum = createHash('sha256').update(fs.readFileSync(clipPath)).digest('hex');
      } else {
        clipChecksum = createHash('sha256').update(`${clipAssetId}-${Date.now()}`).digest('hex');
      }

      // Register derived asset in media_assets
      await this.db.query(
        `INSERT INTO media_assets (
           id, user_id, original_filename, original_path, source_type,
           status, stage, progress, duration, proxy_status, proxy_path,
           parent_asset_id, relationship_type, file_size, availability,
           thumbnail_path, thumbnail_data, connector_account_id, checksum, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, 'indexed', 'completed', 100, $6, 'ready', $7, $8, 'derived_from', $9, 'online', $10, $11, $12, $13, NOW(), NOW())`,
        [
          clipAssetId,
          userId,
          clipFilename,
          this.locator(clipPath),
          isRemoteMaster ? (provider === 'drive' ? 'google_drive' : provider) : 'upload',
          duration,
          this.locator(clipPath),
          parentAssetId,
          clipSize,
          fs.existsSync(clipThumbPath) ? this.locator(clipThumbPath) : null,
          clipThumbData,
          connectorAccountId || null,
          clipChecksum,
        ],
      );

      // Register lineage in asset_relationships table
      await this.db.query(
        `INSERT INTO asset_relationships (source_asset_id, target_asset_id, relationship_type, metadata)
         VALUES ($1, $2, 'derived_from', $3)`,
        [
          parentAssetId,
          clipAssetId,
          JSON.stringify({ start_s: startS, end_s: endS, duration }),
        ],
      );

      await this.db.query(
        `UPDATE indexing_jobs SET status = 'completed', stage = 'completed', progress = 100, access_mode = $1, bytes_read = $2, finished_at = NOW() WHERE bull_job_id = $3`,
        [accessMode, bytesRead, job.id],
      );

      if (isRemoteMaster && connectorAccountId) {
        try {
          const driveConnector = this.connectorRegistry.get(
            provider === 'drive' ? 'google_drive' : provider,
          ) as any;
          const auth = await this.connectorsService.getAuthContext(connectorAccountId, userId);
          if (driveConnector?.ensureBriskyStructure && driveConnector.uploadAsset) {
            const folders = await driveConnector.ensureBriskyStructure(auth);
            if (folders.clipsId) {
              const uploaded = await driveConnector.uploadAsset(
                auth,
                folders.clipsId,
                clipPath,
                clipFilename,
              );
              await this.db.query(
                `UPDATE media_assets
                 SET source_type = $1, proxy_remote_id = $2, connector_account_id = $3, updated_at = NOW()
                 WHERE id = $4`,
                [provider === 'drive' ? 'google_drive' : provider, uploaded.remoteId, connectorAccountId, clipAssetId],
              );
              this.logger.log(
                `Uploaded derived clip ${clipAssetId} to user connector Brisky/clips/ (${uploaded.remoteId})`,
              );
            }
          }
        } catch (uploadErr) {
          this.logger.warn(
            `Could not write clip ${clipAssetId} back to connector: ${uploadErr}`,
          );
          throw uploadErr;
        }
      }

      this.logger.log(`Finished clip extraction: derived asset ${clipAssetId} created at ${clipPath}`);
    } catch (err) {
      this.logger.error(`Failed to extract clip for asset ${parentAssetId}: ${err}`);
      await this.db.query(
        `UPDATE indexing_jobs SET status = 'failed', stage = 'failed', error = $1, finished_at = NOW() WHERE bull_job_id = $2`,
        [String(err), job.id],
      );
      throw err;
    } finally {
      this.cleanupJobScratch(scratch);
    }
  }

  private async checkCancelled(jobId: string, assetId: string, scratchDir: string): Promise<boolean> {
    const res = await this.db.query<{ cancel_requested: boolean; status: string }>(
      `SELECT cancel_requested, status FROM indexing_jobs WHERE bull_job_id = $1 LIMIT 1`,
      [jobId],
    );

    const assetRes = await this.db.query<{ status: string; availability: string }>(
      `SELECT status, availability FROM media_assets WHERE id = $1`,
      [assetId],
    );

    // A missing job row is NOT a cancellation — it is usually a bull_job_id mismatch.
    const isJobCancelled =
      res.rows[0]?.cancel_requested === true || res.rows[0]?.status === 'cancelled';
    const isAssetGone =
      assetRes.rows[0]?.availability === 'offline' || assetRes.rows[0]?.status === 'cancelled';

    if (isJobCancelled || isAssetGone) {
      const reason = isAssetGone ? 'Source deleted or marked offline' : 'Cancelled by user';
      this.logger.log(`Job ${jobId} for asset ${assetId} halted mid-job (${reason}); cleaning scratch.`);
      this.cleanupJobScratch(scratchDir);
      if (res.rows.length > 0) {
        await this.db.query(
          `UPDATE indexing_jobs SET status = 'cancelled', stage = 'cancelled', error = $1, finished_at = NOW() WHERE bull_job_id = $2`,
          [reason, jobId],
        );
      }
      if (assetRes.rows.length > 0 && assetRes.rows[0]?.status !== 'cancelled' && assetRes.rows[0]?.availability !== 'offline') {
        await this.db.query(
          `UPDATE media_assets SET status = 'cancelled', stage = 'cancelled', error = $1, updated_at = NOW() WHERE id = $2`,
          [reason, assetId],
        );
      }
      return true;
    }
    return false;
  }

  private async executeProcessing(
    job: Job<IndexingJobData | FactoryJobEnvelope>,
    envelope: FactoryJobEnvelope,
  ): Promise<void> {
    const assetId = envelope.asset_id;
    const userId = envelope.user_id;
    const sourcePath = envelope.source.sourcePath || '';
    const originalFilename = envelope.source.originalFilename || '';
    const checksum = envelope.source.checksum || '';
    const provider = envelope.source.provider || 'upload';
    const remoteId = envelope.source.remoteId;
    const connectorAccountId = envelope.source.connectorAccountId;
    const fileSize = envelope.source.fileSize || 0;
    const forceReindex = Boolean(envelope.processing_config?.forceReindex);
    const jobId = envelope.job_id || job.id || assetId;
    const scratch = path.join(this.scratchDir, String(jobId));

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
      `Starting BullMQ processing for asset ${assetId} (${originalFilename}) - job ${jobId} - attempt ${currentAttempt}/${maxAttempts}`,
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

    let peakScratchBytes = 0;
    const updatePeakScratch = () => {
      peakScratchBytes = Math.max(peakScratchBytes, this.getDirectorySize(scratch));
    };

    const mark = async <T>(stage: string, progress: number, fn: () => Promise<T>): Promise<T> => {
      const t0 = Date.now();
      await setStage(stage, progress, true);
      const result = await fn();
      updatePeakScratch();
      timings.push({ stage, durationMs: Date.now() - t0 });
      return result;
    };

    try {
      // 1. Deduplication check: Has this checksum already been indexed or currently indexing?
      // Skip when forceReindex is set so we can rebuild a broken speech index.
      let donorId: string | null = null;
      if (forceReindex) {
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

      if (await this.checkCancelled(job.id || '', assetId, scratch)) return;

      fs.mkdirSync(scratch, { recursive: true });

      const isRemoteMaster = provider !== 'upload' && Boolean(remoteId);

      let effectiveSourcePath = sourcePath;

      if (isRemoteMaster) {
        const sourceExt = path.extname(originalFilename) || '.mp4';
        effectiveSourcePath = path.join(scratch, `source${sourceExt}`);
        await setStage('downloading_from_connector', 2, true);

        if (!connectorAccountId) {
          throw new Error(`Missing connectorAccountId for asset ${assetId} (provider: ${provider})`);
        }

        const alreadyDownloaded =
          fs.existsSync(effectiveSourcePath) &&
          fileSize > 0 &&
          fs.statSync(effectiveSourcePath).size === fileSize;

        if (alreadyDownloaded) {
          this.logger.log(
            `Source for ${assetId} already exists in scratch with valid size (${(fileSize / (1024 * 1024)).toFixed(2)} MB); skipping re-download`,
          );
          await setStage('downloading_from_connector', 7, true);
        } else {
          this.checkScratchCapacity(scratch, fileSize, 'full_download');
          const connector = this.connectorRegistry.get(provider);
          const auth = await this.connectorsService.getAuthContext(
            connectorAccountId,
            userId,
          );

          let bytesDownloaded = 0;
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
          if (fs.existsSync(effectiveSourcePath)) {
            bytesDownloaded = fs.statSync(effectiveSourcePath).size;
          }
          const downloadTiming = timings.find((t) => t.stage === 'download_from_connector');
          if (downloadTiming) {
            downloadTiming.bytesRead = bytesDownloaded;
            downloadTiming.isFullDownload = true;
            const durationSec =
              downloadTiming.durationMs && downloadTiming.durationMs > 0
                ? downloadTiming.durationMs / 1000
                : 1;
            downloadTiming.mbPerSec = Number(
              (bytesDownloaded / (1024 * 1024) / durationSec).toFixed(2),
            );
          }
          await this.db.query(
            `UPDATE indexing_jobs SET bytes_read = $1, access_mode = 'full_download' WHERE bull_job_id = $2`,
            [bytesDownloaded, job.id],
          ).catch(() => undefined);
        }
      } else {
        if (!fs.existsSync(sourcePath)) {
          throw new Error(`Source video file not found on disk: ${sourcePath}`);
        }
        await this.db.query(
          `UPDATE indexing_jobs SET bytes_read = $1, access_mode = 'local' WHERE bull_job_id = $2`,
          [fs.statSync(sourcePath).size, job.id],
        ).catch(() => undefined);
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

      // Check cooperative cancellation before heavyweight extraction
      if (await this.checkCancelled(job.id || '', assetId, scratch)) return;

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

      // Persist durable keyframes into storage/keyframes/{assetId}/ so Stage-2 search can inspect them after scratch purge
      for (const scene of scenes) {
        if (scene.keyframes && scene.keyframes.length > 0) {
          scene.keyframes = persistDurableKeyframes(assetId, this.storageRoot, scene.keyframes);
          if (scene.keyframePath && scene.keyframes[0]) {
            scene.keyframePath = scene.keyframes[0].path;
          }
        }
      }

      // Checkpoint Planning (Phase F2)
      if (forceReindex) {
        await this.unitsService.resetAssetUnits(assetId);
      }
      await this.unitsService.planUnits(assetId, scenes, metadata.hasAudio);
      const completedUnitsMap = (await this.unitsService.getCompletedUnits?.(assetId)) || new Map();
      const completedUnits =
        completedUnitsMap instanceof Map
          ? new Set<string>(Array.from(completedUnitsMap.keys()).map(String))
          : new Set<string>();

      // Check cooperative cancellation after keyframe extraction
      if (await this.checkCancelled(job.id || '', assetId, scratch)) return;

      // Stage 3: Fast thumbnail (Demand-driven derived media: proxy encoding is decoupled)
      const proxyPath = path.join(this.proxyDir, `${assetId}.mp4`);
      const thumbnailPath = path.join(this.thumbnailDir, `${assetId}.jpg`);

      let proxyStatus: 'none' | 'ready' | 'skipped' = 'none';
      if (fs.existsSync(proxyPath)) {
        proxyStatus = 'ready';
      } else if (
        !isRemoteMaster &&
        (metadata.codec?.toLowerCase().includes('h264') || metadata.codec?.toLowerCase().includes('avc')) &&
        (metadata.height || 0) <= 1080
      ) {
        proxyStatus = 'skipped';
      } else {
        proxyStatus = 'none';
      }

      await this.db.query(`UPDATE media_assets SET proxy_status = $1 WHERE id = $2`, [proxyStatus, assetId]);

      await mark('ffmpeg_outputs', 28, async () => {
        await this.ffmpegPipeline.generateThumbnail(
          effectiveSourcePath,
          thumbnailPath,
          scenes[0]?.representativeTimestamp || 1,
        );
        if (fs.existsSync(thumbnailPath)) {
          try {
            const thumbBuffer = await fs.promises.readFile(thumbnailPath);
            const thumbnailData = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;
            await this.db.query(
              `UPDATE media_assets SET thumbnail_data = $1, thumbnail_path = $2 WHERE id = $3`,
              [thumbnailData, this.locator(thumbnailPath), assetId],
            );
          } catch (readThumbErr) {
            this.logger.warn(`Could not read thumbnail into database for asset ${assetId}: ${readThumbErr}`);
          }
        }
        await setStage('thumbnail_ready', 30, true);
      });

      // Section 5 (03-media-storage-brief.md): Upload preview to user connector under Brisky/
      if (isRemoteMaster && provider === 'google_drive' && connectorAccountId) {
        try {
          const driveConnector = this.connectorRegistry.get('google_drive') as any;
          const auth = await this.connectorsService.getAuthContext(
            connectorAccountId,
            userId,
          );
          if (driveConnector?.ensureBriskyStructure) {
            const folders = await driveConnector.ensureBriskyStructure(auth);
            const thumbUpload = await driveConnector.uploadAsset(auth, folders.previewsId, thumbnailPath, `${assetId}_thumb.jpg`);
            await this.db.query(
              `UPDATE media_assets SET thumbnail_remote_id = $1 WHERE id = $2`,
              [thumbUpload.remoteId, assetId],
            );
            if (proxyStatus === 'ready' && fs.existsSync(proxyPath)) {
              const proxyUpload = await driveConnector.uploadAsset(auth, folders.proxiesId, proxyPath, `${assetId}_proxy.mp4`);
              await this.db.query(
                `UPDATE media_assets SET proxy_remote_id = $1 WHERE id = $2`,
                [proxyUpload.remoteId, assetId],
              );
            }
            this.logger.log(
              `[03-media-storage-brief.md] Uploaded preview to user Google Drive under Brisky/ for asset ${assetId}`,
            );
          }
        } catch (connectorUploadErr) {
          this.logger.warn(
            `Failed to upload preview to user connector (intelligence and preview remain safe): ${connectorUploadErr}`,
          );
        }
      }

      // Check cooperative cancellation after thumbnail
      if (await this.checkCancelled(job.id || '', assetId, scratch)) return;

      await this.dispatchChildUnitJobs(envelope, completedUnits);
      await setStage('planned', 40, true);
      await this.db.query(
        `UPDATE indexing_jobs
         SET status = 'completed', stage = 'planned', progress = 100, finished_at = NOW()
         WHERE bull_job_id = $1`,
        [job.id],
      );
      this.cleanupJobScratch(scratch);
      this.logger.log(`[F2] Planned child unit jobs for asset ${assetId}`);
      return;
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
        const segCheck = await this.db.query<{ count: string }>(
          `SELECT COUNT(*)::int AS count FROM media_segments WHERE asset_id = $1`,
          [assetId],
        );
        const hasSegments = Number(segCheck.rows[0]?.count || 0) > 0;
        const finalAssetStatus = hasSegments ? 'partially_indexed' : 'failed';
        const finalStage = hasSegments ? 'partially_indexed' : 'failed';

        await this.db.query(
          `UPDATE media_assets
           SET status = $1, stage = $2, error = $3,
               proxy_status = CASE WHEN proxy_status = 'ready' THEN 'ready' ELSE 'failed' END,
               updated_at = NOW()
           WHERE id = $4`,
          [finalAssetStatus, finalStage, message, assetId],
        );
        await this.db.query(
          `UPDATE indexing_jobs
           SET status = 'failed', stage = 'failed', error = $1, attempts = $2, finished_at = NOW()
           WHERE bull_job_id = $3`,
          [message, currentAttempt, job.id],
        );
      }

      this.cleanupJobScratch(path.join(this.scratchDir, String(jobId)));

      // CRITICAL: Rethrow error so BullMQ registers the failure, triggers backoff retries,
      // and properly transitions the job to failed / dead-letter status.
      throw err;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<IndexingJobData | FactoryJobEnvelope>) {
    const aid = (job.data as any)?.asset_id || (job.data as any)?.assetId;
    this.logger.log(`BullMQ job ${job.id} (asset: ${aid}) completed successfully.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<IndexingJobData | FactoryJobEnvelope>, err: Error) {
    const aid = (job.data as any)?.asset_id || (job.data as any)?.assetId;
    this.logger.error(
      `BullMQ job ${job.id} (asset: ${aid}) failed after ${job.attemptsMade} attempts: ${err.message}`,
    );
  }

  private async completeUnitJob(job: Job, extra: Record<string, unknown> = {}): Promise<void> {
    await this.db.query(
      `UPDATE indexing_jobs
       SET status = 'completed', stage = 'completed', progress = 100, finished_at = NOW()
       WHERE bull_job_id = $1`,
      [job.id],
    );
    void extra;
  }

  private async failUnitJob(
    job: Job,
    envelope: FactoryJobEnvelope,
    unitId: string,
    err: unknown,
  ): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    await this.unitsService.markUnitFailed(envelope.asset_id, unitId, message);
    await this.db.query(
      `UPDATE indexing_jobs SET status = 'failed', stage = 'failed', error = $1, finished_at = NOW() WHERE bull_job_id = $2`,
      [message, job.id],
    );
  }

  private async delayJob(job: Job, ms = 4000): Promise<never> {
    if (this.scheduler?.releaseSlot) {
      await this.scheduler.releaseSlot(String(job.id || '')).catch(() => undefined);
    }
    if (typeof job.moveToDelayed === 'function') {
      await job.moveToDelayed(Date.now() + ms, job.token);
    }
    throw new DelayedError();
  }

  private async dispatchChildUnitJobs(
    envelope: FactoryJobEnvelope,
    completedUnits: Set<string>,
  ): Promise<void> {
    if (!this.indexingService?.enqueueAsset) {
      this.logger.warn(
        `[F2] No IndexingService; planned units for ${envelope.asset_id} were not enqueued as child jobs`,
      );
      return;
    }
    const units = (await this.unitsService.getUnits?.(envelope.asset_id)) || [];
    for (const unit of units) {
      if (completedUnits.has(unit.unit_id) || unit.status === 'completed') continue;
      await this.indexingService.enqueueAsset({
        job_type: unitTypeToJobType(unit.unit_type),
        asset_id: envelope.asset_id,
        user_id: envelope.user_id,
        source: envelope.source,
        segment:
          unit.start_s != null
            ? { start_s: Number(unit.start_s), end_s: Number(unit.end_s) }
            : null,
        priority: envelope.priority,
        processing_config: {
          unitId: unit.unit_id,
          forceReindex: envelope.processing_config?.forceReindex,
        },
      });
    }
  }

  private async executeAnalyzeFrames(
    job: Job<IndexingJobData | FactoryJobEnvelope>,
    envelope: FactoryJobEnvelope,
  ): Promise<void> {
    const assetId = envelope.asset_id;
    const unitId = envelope.processing_config?.unitId || `scene_${envelope.segment ? 'x' : '0'}`;
    const resolvedUnitId =
      envelope.processing_config?.unitId ||
      (envelope.segment ? undefined : 'scene_0');
    const unit =
      (resolvedUnitId ? await this.unitsService.getUnit(assetId, resolvedUnitId) : null) ||
      (await this.unitsService.getUnits(assetId)).find(
        (u) =>
          u.unit_type === 'analyze_frames' &&
          Number(u.start_s) === envelope.segment?.start_s,
      );
    const sceneUnitId = unit?.unit_id || resolvedUnitId || unitId;
    if (unit?.status === 'completed') {
      await this.completeUnitJob(job);
      return;
    }

    const meta = unit?.metadata || {};
    const scene: SceneBoundary = {
      sceneId: Number(meta.sceneId ?? 0),
      startTime: Number(meta.startTime ?? envelope.segment?.start_s ?? 0),
      endTime: Number(meta.endTime ?? envelope.segment?.end_s ?? 0),
      representativeTimestamp: Number(meta.representativeTimestamp ?? 0),
      keyframePath: String(meta.keyframePath || ''),
      keyframes: Array.isArray(meta.keyframes) ? meta.keyframes : [],
    };
    const scratch = path.join(this.scratchDir, String(envelope.job_id || job.id));
    try {
      const frames = materializeKeyframeFiles(scene.keyframes || [], this.storageRoot, scratch);
      const analysisScene = { ...scene, keyframes: frames };
      const res = await this.geminiService.analyzeFrames([analysisScene]);
      const observations = (res.observations || []).filter(
        (obs) =>
          obs.timestamp >= scene.startTime - 0.05 && obs.timestamp <= scene.endTime + 0.05,
      );
      const kept = observations.length > 0 ? observations : res.observations || [];
      await this.persistSceneCheckpoint(assetId, envelope.user_id, scene, kept);
      await this.unitsService.markUnitCompleted(assetId, sceneUnitId, {
        observations: kept,
        observationsCount: kept.length,
      });
      await this.completeUnitJob(job);
    } catch (err) {
      await this.failUnitJob(job, envelope, sceneUnitId, err);
      throw err;
    } finally {
      this.cleanupJobScratch(scratch);
    }
  }

  private async executeGeminiVideo(
    job: Job<IndexingJobData | FactoryJobEnvelope>,
    envelope: FactoryJobEnvelope,
  ): Promise<void> {
    const assetId = envelope.asset_id;
    const unit = await this.unitsService.getUnit(assetId, 'gemini_video');
    if (unit?.status === 'completed') {
      await this.completeUnitJob(job);
      return;
    }
    const jobId = envelope.job_id || job.id || assetId;
    const scratch = path.join(this.scratchDir, String(jobId));
    fs.mkdirSync(scratch, { recursive: true });
    const provider = envelope.source.provider || 'upload';
    const remoteId = envelope.source.remoteId;
    const connectorAccountId = envelope.source.connectorAccountId;
    const sourcePath = envelope.source.sourcePath || '';
    const originalFilename = envelope.source.originalFilename || 'source.mp4';
    const isRemoteMaster = provider !== 'upload' && Boolean(remoteId);
    let effectiveSourcePath = sourcePath;
    try {
      if (isRemoteMaster) {
        const sourceExt = path.extname(originalFilename) || '.mp4';
        effectiveSourcePath = path.join(scratch, `source${sourceExt}`);
        this.checkScratchCapacity(scratch, envelope.source.fileSize || 0, 'full_download');
        const connector = this.connectorRegistry.get(
          provider === 'drive' ? 'google_drive' : provider,
        );
        const auth = await this.connectorsService.getAuthContext(
          connectorAccountId!,
          envelope.user_id,
        );
        await connector.downloadAsset(auth, remoteId!, effectiveSourcePath);
      } else if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source video file not found on disk: ${sourcePath}`);
      }
      const res = await this.geminiService.analyzeVideo(effectiveSourcePath);
      const analysis = res.analysis || { video_summary: '', key_themes: [], segments: [] };
      if (analysis.segments) {
        for (const gSeg of analysis.segments) {
          await this.db.query(
            `INSERT INTO media_observations (asset_id, user_id, observation_type, timestamp_start, timestamp_end, raw_data)
             VALUES ($1, $2, 'gemini_segment', $3, $4, $5)`,
            [assetId, envelope.user_id, gSeg.start_time, gSeg.end_time, JSON.stringify(gSeg)],
          );
        }
      }
      await this.unitsService.markUnitCompleted(assetId, 'gemini_video', { analysis });
      await this.completeUnitJob(job);
    } catch (err) {
      await this.failUnitJob(job, envelope, 'gemini_video', err);
      throw err;
    } finally {
      this.cleanupJobScratch(scratch);
    }
  }

  private async executeEmbed(
    job: Job<IndexingJobData | FactoryJobEnvelope>,
    envelope: FactoryJobEnvelope,
  ): Promise<void> {
    const assetId = envelope.asset_id;
    const unitId = envelope.processing_config?.unitId || 'embed';
    const unit = await this.unitsService.getUnit(assetId, unitId);
    if (unit?.status === 'completed') {
      await this.completeUnitJob(job);
      return;
    }
    const sceneId = Number(unit?.metadata?.sceneId ?? String(unitId).replace('embed_scene_', ''));
    const sceneUnit = await this.unitsService.getUnit(assetId, `scene_${sceneId}`);
    if (!sceneUnit || sceneUnit.status !== 'completed') {
      await this.delayJob(job);
    }
    const start = Number(unit?.start_s ?? envelope.segment?.start_s ?? 0);
    const end = Number(unit?.end_s ?? envelope.segment?.end_s ?? 0);
    const segId = `${assetId}_seg_${String(sceneId + 1).padStart(3, '0')}`;
    const segRes = await this.db.query<{
      title: string;
      description: string;
      visual_objects: string[];
      actions: string[];
      transcript_text: string;
      on_screen_text: string[];
    }>(
      `SELECT title, description, visual_objects, actions, transcript_text, on_screen_text
       FROM media_segments WHERE id = $1`,
      [segId],
    );
    const row = segRes.rows[0];
    const transRes = await this.db.query<{ raw_data: any }>(
      `SELECT raw_data FROM media_observations
       WHERE asset_id = $1 AND observation_type = 'transcript'
         AND timestamp_start < $3 AND timestamp_end > $2`,
      [assetId, start, end],
    );
    const transcript = transRes.rows
      .map((r) => (typeof r.raw_data === 'string' ? JSON.parse(r.raw_data) : r.raw_data))
      .map((c) => (c?.text || '').trim())
      .filter(Boolean)
      .join(' ');
    const embeddingText = [
      row?.title,
      row?.description,
      (row?.visual_objects || []).join(', '),
      (row?.actions || []).join(', '),
      transcript || row?.transcript_text,
      (row?.on_screen_text || []).join(' '),
    ]
      .filter(Boolean)
      .join('. ');
    try {
      const embedded = await this.mergerService.generateEmbeddingForText(
        embeddingText || `Scene ${sceneId} ${start}s-${end}s`,
      );
      const dim = embedded.values.length;
      const embeddingStr = `[${embedded.values.join(',')}]`;
      if (row) {
        await this.db.query(
          `UPDATE media_segments
           SET embedding = CASE WHEN $2 = 3072 THEN $1::vector ELSE embedding END,
               embedding_384 = CASE WHEN $2 = 384 THEN $1::vector ELSE embedding_384 END,
               embedding_dim = $2,
               transcript_text = COALESCE(NULLIF($3, ''), transcript_text)
           WHERE id = $4`,
          [embeddingStr, dim, transcript, segId],
        );
      }
      await this.unitsService.markUnitCompleted(assetId, unitId, {
        embeddingDim: dim,
        segmentId: segId,
      });
      await this.completeUnitJob(job);
    } catch (err) {
      await this.failUnitJob(job, envelope, unitId, err);
      throw err;
    }
  }

  private async executeFinalize(
    job: Job<IndexingJobData | FactoryJobEnvelope>,
    envelope: FactoryJobEnvelope,
  ): Promise<void> {
    const assetId = envelope.asset_id;
    const pending = await this.unitsService.pendingSiblingUnits(assetId, 'finalize');
    if (pending > 0) {
      await this.delayJob(job, 6000);
    }
    const hasFailed = await this.unitsService.hasFailedUnits(assetId);
    const finalStatus = hasFailed ? 'partially_indexed' : 'indexed';
    const finalStage = hasFailed ? 'partially_indexed' : 'completed';
    const counts = await this.db.query<{ scenes: string; frames: string }>(
      `SELECT
         (SELECT COUNT(*)::int FROM media_segments WHERE asset_id = $1) AS scenes,
         (SELECT COUNT(*)::int FROM media_observations WHERE asset_id = $1 AND observation_type = 'frame') AS frames`,
      [assetId],
    );
    await this.unitsService.markUnitCompleted(assetId, 'finalize');
    await this.db.query(
      `UPDATE media_assets
       SET status = $1, stage = $2, progress = 100,
           frames_analyzed = COALESCE($3, frames_analyzed),
           scene_count = COALESCE($4, scene_count),
           availability = 'online', indexed_at = NOW(), updated_at = NOW()
       WHERE id = $5`,
      [
        finalStatus,
        finalStage,
        Number(counts.rows[0]?.frames || 0),
        Number(counts.rows[0]?.scenes || 0),
        assetId,
      ],
    );
    await this.completeUnitJob(job);
    this.logger.log(`[F2] Finalized asset ${assetId} as ${finalStatus}`);
  }

  private async persistTranscriptObservations(
    assetId: string,
    userId: string,
    cues: TranscriptCue[],
  ): Promise<void> {
    for (const cue of cues || []) {
      if (!cue?.text?.trim()) continue;
      await this.db.query(
        `INSERT INTO media_observations (asset_id, user_id, observation_type, timestamp_start, timestamp_end, raw_data)
         VALUES ($1, $2, 'transcript', $3, $4, $5)`,
        [assetId, userId, cue.start_time, cue.end_time, JSON.stringify(cue)],
      );
    }
  }

  private async persistSceneCheckpoint(
    assetId: string,
    userId: string,
    scene: SceneBoundary,
    observations: FrameObservation[],
  ): Promise<void> {
    for (const obs of observations || []) {
      await this.db.query(
        `INSERT INTO media_observations (asset_id, user_id, observation_type, timestamp_start, timestamp_end, raw_data)
         VALUES ($1, $2, 'frame', $3, $4, $5)`,
        [assetId, userId, obs.timestamp, obs.timestamp, JSON.stringify(obs)],
      );
    }

    const primary = observations[0];
    const description = primary?.description || '';
    const objects = Array.from(new Set(observations.flatMap((o) => o.objects || [])));
    const actions = Array.from(new Set(observations.flatMap((o) => o.activity || [])));
    const onScreen = Array.from(new Set(observations.flatMap((o) => o.onScreenText || [])));
    const segmentId = `${assetId}_seg_${String(scene.sceneId + 1).padStart(3, '0')}`;

    await this.db.query(
      `INSERT INTO media_segments (
         id, asset_id, user_id, start_time, end_time, title, description,
         visual_objects, actions, transcript_text, on_screen_text,
         keyframe_path, sources, analysis_version, keyframe_paths
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11,
         $12, $13, $14, $15::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET
         description = EXCLUDED.description,
         visual_objects = EXCLUDED.visual_objects,
         actions = EXCLUDED.actions,
         on_screen_text = EXCLUDED.on_screen_text,
         keyframe_path = EXCLUDED.keyframe_path,
         keyframe_paths = EXCLUDED.keyframe_paths`,
      [
        segmentId,
        assetId,
        userId,
        scene.startTime,
        scene.endTime,
        primary?.scene || `Scene ${scene.sceneId}`,
        description,
        objects,
        actions,
        '',
        onScreen,
        scene.keyframePath ? this.locator(scene.keyframePath) : '',
        ['visual'],
        ANALYSIS_VERSION,
        JSON.stringify(
          (scene.keyframes || []).map((kf) => ({
            timestamp: kf.timestamp,
            path: kf.path ? this.locator(kf.path) : kf.path,
            data: (kf as { data?: string }).data,
          })),
        ),
      ],
    );

    await this.db.query(
      `UPDATE media_assets
       SET status = CASE WHEN status IN ('queued', 'processing') THEN 'partially_indexed' ELSE status END,
           stage = 'partially_indexed',
           updated_at = NOW()
       WHERE id = $1`,
      [assetId],
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

    // Update asset paths. Do not claim a proxy is ready just because we know its intended path.
    const proxyExists = Boolean(proxyPath && fs.existsSync(proxyPath) && fs.statSync(proxyPath).size > 0);
    let thumbnailData: string | null = null;
    if (thumbnailPath && fs.existsSync(thumbnailPath)) {
      try {
        const thumbBuf = await fs.promises.readFile(thumbnailPath);
        thumbnailData = `data:image/jpeg;base64,${thumbBuf.toString('base64')}`;
      } catch {
        // non-fatal
      }
    }
    await this.db.query(
      `UPDATE media_assets
       SET proxy_path = $1, thumbnail_path = $2, original_path = $3, original_deleted = $4,
           thumbnail_data = COALESCE($5, thumbnail_data)
       WHERE id = $6`,
      [
        proxyExists ? this.locator(proxyPath) : null,
        thumbnailPath ? this.locator(thumbnailPath) : null,
        sourcePath,
        Boolean(isRemoteMaster),
        thumbnailData,
        assetId,
      ],
    );

    const keptSegmentIds: string[] = [];

    // Upsert segments so a crash mid-loop cannot wipe earlier checkpoints
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
         )
         ON CONFLICT (id) DO UPDATE SET
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           visual_objects = EXCLUDED.visual_objects,
           actions = EXCLUDED.actions,
           transcript_text = EXCLUDED.transcript_text,
           on_screen_text = EXCLUDED.on_screen_text,
           keyframe_path = EXCLUDED.keyframe_path,
           sources = EXCLUDED.sources,
           provider = EXCLUDED.provider,
           model = EXCLUDED.model,
           embedding = COALESCE(EXCLUDED.embedding, media_segments.embedding),
           embedding_384 = COALESCE(EXCLUDED.embedding_384, media_segments.embedding_384),
           embedding_dim = EXCLUDED.embedding_dim,
           analysis_version = EXCLUDED.analysis_version,
           keyframe_paths = EXCLUDED.keyframe_paths`,
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
          seg.keyframePath ? this.locator(seg.keyframePath) : '',
          seg.sources || [],
          seg.provider || 'google',
          seg.model || 'gemini-2.5-flash',
          is3072 ? embeddingStr : null,
          is384 ? embeddingStr : null,
          dim || 3072,
          seg.analysisVersion || 2,
          JSON.stringify(
            (seg.keyframePaths || []).map((kf: { timestamp: number; path: string; data?: string }) => ({
              timestamp: kf.timestamp,
              path: kf.path ? this.locator(kf.path) : kf.path,
              data: kf.data,
            })),
          ),
        ],
      );
      keptSegmentIds.push(seg.id);
    }

    if (keptSegmentIds.length > 0) {
      await this.db.query(
        `DELETE FROM media_segments WHERE asset_id = $1 AND NOT (id = ANY($2::varchar[]))`,
        [assetId, keptSegmentIds],
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
              proxy_path, thumbnail_path, proxy_status, cost_usd, cost_per_source_minute_usd,
              frames_analyzed, scene_count, index_duration_ms
       FROM media_assets
       WHERE id = $1`,
      [donorId],
    );

    if (donorRes.rows.length > 0) {
      const d = donorRes.rows[0];
      const donorProxyAbs = resolveStorageLocator(d.proxy_path, this.storageRoot);
      const donorProxyExists =
        Boolean(donorProxyAbs) &&
        fs.existsSync(donorProxyAbs!) &&
        fs.statSync(donorProxyAbs!).size > 0;
      const clonedProxyStatus = donorProxyExists
        ? 'ready'
        : d.proxy_status === 'skipped'
          ? 'skipped'
          : 'none';
      await this.db.query(
        `UPDATE media_assets
         SET duration = $1, width = $2, height = $3, fps = $4, codec = $5, has_audio = $6,
             proxy_path = $7, thumbnail_path = $8, cost_usd = 0, cost_per_source_minute_usd = 0,
             frames_analyzed = $9, scene_count = $10, index_duration_ms = 0, indexed_at = NOW(),
             parent_asset_id = $11, relationship_type = 'duplicate',
             proxy_status = $12, availability = 'online'
         WHERE id = $13`,
        [
          d.duration,
          d.width,
          d.height,
          d.fps,
          d.codec,
          d.has_audio,
          donorProxyExists ? this.locator(donorProxyAbs!) : null,
          d.thumbnail_path ? this.locator(d.thumbnail_path) : d.thumbnail_path,
          d.frames_analyzed,
          d.scene_count,
          donorId,
          clonedProxyStatus,
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
