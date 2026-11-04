import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  Optional,
  ConflictException,
  UnauthorizedException,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { boundedText } from '../../common/request-validation';
import { PoolClient } from 'pg';
import { PageRequest, pageResult } from '../../common/pagination';
import * as fs from 'fs';
import * as path from 'path';
import { resolveFromRepo } from '../../common/repo-paths';
import { DatabaseService } from '../database/database.service';
import { FactorySchedulerService } from './factory-scheduler.service';
import { ProcessingUnitsService } from '../pipeline/processing-units.service';
import { AiUsageLedger } from '../pipeline/ai-usage-ledger';
import {
  FactoryJobEnvelope,
  IndexingJobData,
  IndexingStats,
  normalizeJobEnvelope,
  unitTypeToJobType,
} from './indexing.types';
import { MediaFactory, MEDIA_FACTORY } from './media-factory.interface';
import { BullmqMediaFactory } from './bullmq-media-factory.service';

@Injectable()
export class IndexingService implements OnApplicationBootstrap, OnModuleDestroy {
  private clipDispatchTimer?: ReturnType<typeof setInterval>;
  private dispatchingClips = false;
  private readonly logger = new Logger(IndexingService.name);
  private readonly storageRoot: string;
  private readonly proxyDir: string;
  private readonly mediaFactory: MediaFactory;

  constructor(
    @InjectQueue('indexing-queue') private readonly queue: Queue<any>,
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    @Optional() private readonly scheduler?: FactorySchedulerService,
    @Optional() @Inject(MEDIA_FACTORY) mediaFactory?: MediaFactory,
    @Optional() private readonly unitsService?: ProcessingUnitsService,
  ) {
    this.mediaFactory = mediaFactory || new BullmqMediaFactory(this.queue, this.scheduler);
    this.storageRoot = resolveFromRepo(
      this.configService.get<string>('STORAGE_ROOT', './storage'),
    );
    this.proxyDir = path.join(this.storageRoot, 'proxies');
  }

  async onApplicationBootstrap() {
    await this.reconcileStalledJobs();
    await this.dispatchPendingClips();
    this.clipDispatchTimer = setInterval(() => { void this.dispatchPendingClips(); }, 5000);
    this.clipDispatchTimer.unref();
  }

  onModuleDestroy() { if (this.clipDispatchTimer) clearInterval(this.clipDispatchTimer); }

  async getJob(id: string, userId: string) {
    if (!userId) throw new UnauthorizedException();
    const field = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? 'id' : 'bull_job_id';
    const result = await this.db.query(`SELECT j.id, j.bull_job_id, j.asset_id, j.job_type, j.status, j.stage,
      j.progress, j.cancel_requested, j.created_at, j.started_at, j.finished_at, j.updated_at,
      j.result_asset_id, o.dispatch_pending
      FROM indexing_jobs j LEFT JOIN clip_operations o ON o.id=j.clip_operation_id
      WHERE j.user_id=$2 AND j.${field}=$1 ORDER BY j.created_at DESC LIMIT 1`, [id, userId]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Job not found');
    const status = row.dispatch_pending && row.status === 'waiting' ? 'dispatch_pending' :
      ({ waiting: 'queued', active: 'processing' } as Record<string, string>)[row.status] || row.status;
    return { job_id: row.bull_job_id || row.id, asset_id: row.asset_id, job_type: row.job_type, status,
      stage: row.stage, progress: row.progress, cancel_requested: row.cancel_requested,
      created_at: row.created_at, started_at: row.started_at, finished_at: row.finished_at, updated_at: row.updated_at,
      result_asset_id: row.status === 'completed' ? row.result_asset_id : null,
      error: row.status === 'failed' ? { code: 'JOB_FAILED', message: 'Processing failed' } : null };
  }

  async enqueueClip(envelope: FactoryJobEnvelope, key?: string, title?: string) {
    if (!envelope.user_id) throw new UnauthorizedException();
    if (key !== undefined) {
      boundedText(key, 'Idempotency-Key', 128);
      if (!/^[\x21-\x7e]+$/.test(key)) throw new BadRequestException('Idempotency-Key must contain visible ASCII characters');
    }
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const keyHash = hash(key ?? randomUUID());
    const requestHash = hash(JSON.stringify([envelope.asset_id, envelope.segment?.start_s, envelope.segment?.end_s, title ?? '']));
    const operationId = randomUUID();
    const jobId = `clip_job_${operationId}`;
    const outputId = `clip_${operationId.replace(/-/g, '')}`;
    envelope = { ...envelope, job_id: jobId, processing_config: { clipOperationId: operationId, clipAssetId: outputId } };
    const client = await this.db.getClient();
    let operation: any;
    let reused = false;
    try {
      await client.query('BEGIN');
      const inserted = await client.query(`INSERT INTO clip_operations(id,user_id,source_asset_id,key_hash,request_hash,bull_job_id,output_asset_id,envelope)
        SELECT $1::uuid,$2::uuid,$3::varchar(64),$4::text,$5::text,$6::text,$7::text,$8::jsonb
        FROM media_assets WHERE id=$3::varchar(64) AND user_id=$2::uuid
        ON CONFLICT(user_id,key_hash) DO NOTHING RETURNING *`,
        [operationId,envelope.user_id,envelope.asset_id,keyHash,requestHash,jobId,outputId,JSON.stringify(envelope)]);
      operation = inserted.rows[0];
      if (!operation) {
        const previous = await client.query('SELECT * FROM clip_operations WHERE user_id=$1 AND key_hash=$2', [envelope.user_id,keyHash]);
        operation = previous.rows[0]; reused = true;
      }
      if (!operation) throw new NotFoundException('Asset not found');
      if (operation.request_hash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This Idempotency-Key was already used with different clip parameters' });
      await client.query(`INSERT INTO indexing_jobs(bull_job_id,asset_id,user_id,job_type,priority,status,stage,progress,segment_start,segment_end,clip_operation_id)
        VALUES($1,$2,$3,'extract_clip','interactive','waiting','queued',0,$4,$5,$6)
        ON CONFLICT(clip_operation_id) DO NOTHING`,
        [operation.bull_job_id,envelope.asset_id,envelope.user_id,envelope.segment!.start_s,envelope.segment!.end_s,operation.id]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    if (operation.dispatch_pending) await this.dispatchClip(operation);
    const job = await this.getJob(operation.bull_job_id, envelope.user_id);
    return { ...job, reused, status_url: `/api/v1/indexing/jobs/${operation.bull_job_id}`, message: 'Clip operation accepted' };
  }

  private async dispatchClip(operation: any): Promise<void> {
    try {
      // Reserve a short retry lease; queue delivery happens outside the SQL transaction.
      const claimed = await this.db.query(`UPDATE clip_operations o SET dispatch_after=NOW()+INTERVAL '30 seconds'
        WHERE o.id=$1 AND o.dispatch_pending AND o.dispatch_after<=NOW()
        AND EXISTS(SELECT 1 FROM indexing_jobs j WHERE j.clip_operation_id=o.id AND j.status='waiting' AND NOT j.cancel_requested)
        RETURNING o.envelope`, [operation.id]);
      if (!claimed.rows.length) return;
      const envelope = typeof claimed.rows[0].envelope === 'string' ? JSON.parse(claimed.rows[0].envelope) : claimed.rows[0].envelope;
      const existing = await this.queue.getJob(envelope.job_id);
      const state = existing ? await existing.getState() : null;
      if (state === 'failed') await existing!.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
      const dispatched = existing ? envelope.job_id : await this.mediaFactory.dispatch(envelope);
      if (dispatched !== envelope.job_id) throw new Error('Queue did not preserve clip operation identity');
      await this.db.query('UPDATE clip_operations SET dispatch_pending=FALSE,updated_at=NOW() WHERE id=$1', [operation.id]);
    } catch (error) { this.logger.warn(`Clip dispatch pending for ${operation.id}; retry will resume delivery`); }
  }

  private async dispatchPendingClips(): Promise<void> {
    if (this.dispatchingClips) return;
    this.dispatchingClips = true;
    try {
      const pending = await this.db.query(`SELECT o.id FROM clip_operations o WHERE dispatch_pending AND dispatch_after<=NOW()
        AND EXISTS(SELECT 1 FROM indexing_jobs j WHERE j.clip_operation_id=o.id AND j.status='waiting' AND NOT j.cancel_requested)
        ORDER BY dispatch_after LIMIT 50`);
      for (const row of pending.rows) await this.dispatchClip(row);
    } catch (error) { this.logger.warn('Clip outbox recovery unavailable; will retry'); }
    finally { this.dispatchingClips = false; }
  }

  async isClipPublished(operationId: string, userId: string): Promise<boolean> {
    const result = await this.db.query('SELECT completed FROM clip_operations WHERE id=$1 AND user_id=$2', [operationId,userId]);
    if (!result.rows.length) throw new NotFoundException('Clip operation not found');
    return result.rows[0].completed === true;
  }

  async retryClip(id: string, userId: string) {
    if (!userId) throw new UnauthorizedException();
    const field = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? 'id' : 'bull_job_id';
    const client = await this.db.getClient();
    let operationId: string;
    try {
      await client.query('BEGIN');
      const found = await client.query(`SELECT j.status,j.clip_operation_id,j.bull_job_id FROM indexing_jobs j
        JOIN clip_operations o ON o.id=j.clip_operation_id
        WHERE j.user_id=$2 AND j.${field}=$1 FOR UPDATE OF o`, [id,userId]);
      const job = found.rows[0];
      if (!job) throw new NotFoundException('Clip job not found');
      operationId = job.clip_operation_id;
      if (job.status === 'failed') {
        await client.query(`UPDATE indexing_jobs SET status='waiting',stage='queued',error=NULL,finished_at=NULL,cancel_requested=FALSE,updated_at=NOW()
          WHERE clip_operation_id=$1`, [operationId]);
        await client.query(`UPDATE clip_operations SET dispatch_pending=TRUE,dispatch_after=NOW(),updated_at=NOW() WHERE id=$1 AND NOT completed`, [operationId]);
      } else if (!['waiting','active','completed'].includes(job.status)) {
        throw new ConflictException('Only failed clip operations can be retried');
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    await this.dispatchClip({ id: operationId });
    return this.getJob(id, userId);
  }

  async publishClip(operationId: string, userId: string, outputId: string, jobId: string,
    work: (client: PoolClient) => Promise<void>): Promise<boolean> {
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT completed,output_asset_id,bull_job_id FROM clip_operations WHERE id=$1 AND user_id=$2 FOR UPDATE', [operationId,userId]);
      const operation = result.rows[0];
      if (!operation || operation.output_asset_id !== outputId || operation.bull_job_id !== jobId) throw new Error('Clip publication identity mismatch');
      if (!operation.completed) {
        const state = await client.query('SELECT cancel_requested,status FROM indexing_jobs WHERE clip_operation_id=$1 FOR UPDATE', [operationId]);
        if (!state.rows.length) throw new Error('Clip operation job is missing');
        if (state.rows[0].cancel_requested || state.rows[0].status === 'cancelled') {
          await client.query("UPDATE indexing_jobs SET status='cancelled',stage='cancelled',finished_at=NOW(),updated_at=NOW() WHERE clip_operation_id=$1", [operationId]);
          await client.query('UPDATE clip_operations SET dispatch_pending=FALSE,updated_at=NOW() WHERE id=$1', [operationId]);
          await client.query('COMMIT');
          return false;
        }
        await work(client);
        await client.query(`UPDATE indexing_jobs SET result_asset_id=$1,status='completed',stage='completed',progress=100,error=NULL,finished_at=NOW(),updated_at=NOW()
          WHERE clip_operation_id=$2 AND user_id=$3`, [outputId,operationId,userId]);
        await client.query('UPDATE clip_operations SET completed=TRUE,dispatch_pending=FALSE,updated_at=NOW() WHERE id=$1', [operationId]);
      }
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async reconcileStalledJobs(): Promise<{ reconciledJobs: number; reconciledAssets: number }> {
    let reconciledJobs = 0;
    let reconciledAssets = 0;
    try {
      // Never fail a live worker job: skip if Bull still has it active OR the
      // worker heartbeated recently (API restart must not steal factory slots).
      const activeJobs = await this.db.query<{ id: string; bull_job_id: string; asset_id: string }>(
        `SELECT id, bull_job_id, asset_id FROM indexing_jobs
         WHERE status = 'active'
           AND COALESCE(last_heartbeat_at, started_at, created_at) < NOW() - INTERVAL '15 minutes'`,
      );

      if (activeJobs.rows.length > 0) {
        this.logger.log(`Found ${activeJobs.rows.length} stalled active indexing jobs from prior run; reconciling...`);
        for (const jobRow of activeJobs.rows) {
          const bullJob = jobRow.bull_job_id ? await this.queue.getJob(jobRow.bull_job_id) : null;
          const isActiveInBull = bullJob ? await bullJob.isActive() : false;
          if (isActiveInBull) continue;
          await this.db.query(
            `UPDATE indexing_jobs
             SET status = 'failed', error = 'Interrupted by server restart. Click Retry to re-index.', finished_at = NOW()
             WHERE id = $1 AND status = 'active'`,
            [jobRow.id],
          );
          reconciledJobs += 1;
        }
      }

      // Only fail processing assets that have no live (fresh-heartbeat or waiting) job.
      const processingAssets = await this.db.query<{ id: string; original_filename: string }>(
        `SELECT id, original_filename FROM media_assets WHERE status = 'processing'`,
      );

      if (processingAssets.rows.length > 0) {
        this.logger.log(`Found ${processingAssets.rows.length} processing media assets from prior run; reconciling...`);
        for (const asset of processingAssets.rows) {
          const live = await this.db.query(
            `SELECT 1 FROM indexing_jobs
             WHERE asset_id = $1
               AND (
                 status = 'waiting'
                 OR (status = 'active'
                     AND COALESCE(last_heartbeat_at, started_at, created_at) > NOW() - INTERVAL '15 minutes')
               )
             LIMIT 1`,
            [asset.id],
          );
          if (live.rows.length > 0) continue;
          await this.db.query(
            `UPDATE media_assets
             SET status = 'failed', stage = 'failed', error = 'Indexing was interrupted by a server restart. Click Retry to re-index.', updated_at = NOW()
             WHERE id = $1 AND status = 'processing'`,
            [asset.id],
          );
          reconciledAssets += 1;
        }
      }

      // 3. Reconcile orphaned BullMQ active jobs in Redis that have no running worker or are finished in DB
      if (typeof this.queue?.getActive === 'function') {
        const bullActiveJobs = await this.queue.getActive().catch(() => []);
        for (const bullJob of bullActiveJobs) {
          try {
            const dbJob = await this.db.query<{ id: string; status: string }>(
              `SELECT id, status FROM indexing_jobs WHERE bull_job_id = $1`,
              [bullJob.id],
            );
            const row = dbJob?.rows?.[0];
            if (!row || row.status === 'completed') {
              if (typeof bullJob.moveToCompleted === 'function') {
                await bullJob.moveToCompleted('Reconciled on startup', '0', false).catch(() => bullJob.remove().catch(() => {}));
              } else if (typeof bullJob.remove === 'function') {
                await bullJob.remove().catch(() => {});
              }
              reconciledJobs += 1;
            } else if (row.status === 'failed') {
              if (typeof bullJob.moveToFailed === 'function') {
                await bullJob.moveToFailed(new Error('Interrupted by server restart'), '0', false).catch(() => bullJob.remove().catch(() => {}));
              } else if (typeof bullJob.remove === 'function') {
                await bullJob.remove().catch(() => {});
              }
              reconciledJobs += 1;
            }
          } catch (e) {
            this.logger.warn(`Could not reconcile BullMQ job ${bullJob.id}: ${e}`);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Failed during stalled job reconciliation: ${err}`);
    }
    return { reconciledJobs, reconciledAssets };
  }

  async enqueueAsset(data: IndexingJobData | FactoryJobEnvelope): Promise<string> {
    const envelope = normalizeJobEnvelope(data);
    if (!envelope.job_id) {
      envelope.job_id = `job_${envelope.asset_id}_${Date.now()}_${randomBytes(4).toString('hex')}`;
    }

    const model = this.configService.get<string>('AI_MODEL') ??
      this.configService.get<string>('GEMINI_MODEL', 'gemini-2.5-flash');

    // Insert the waiting row BEFORE dispatch so claimSlot can match bull_job_id.
    await this.db.query(
      `INSERT INTO indexing_jobs (
         bull_job_id, asset_id, user_id, status, stage, progress,
         provider, model, job_type, priority, segment_start, segment_end, unit_id
       )
       VALUES ($1, $2, $3, 'waiting', 'queued', 0, $4, $5, $6, $7, $8, $9, $10)`,
      [
        envelope.job_id,
        envelope.asset_id,
        envelope.user_id,
        envelope.source.provider || 'google',
        model,
        envelope.job_type,
        envelope.priority,
        envelope.segment ? envelope.segment.start_s : null,
        envelope.segment ? envelope.segment.end_s : null,
        envelope.processing_config?.unitId || null,
      ],
    );

    let jobId = envelope.job_id;
    try {
      const dispatchedId = await this.mediaFactory.dispatch(envelope);
      if (dispatchedId && dispatchedId !== envelope.job_id) {
        await this.db.query(
          `UPDATE indexing_jobs SET bull_job_id = $1, updated_at = NOW() WHERE bull_job_id = $2 AND status = 'waiting'`,
          [dispatchedId, envelope.job_id],
        );
        jobId = dispatchedId;
      }
    } catch (err) {
      await this.db.query(
        `UPDATE indexing_jobs
         SET status = 'failed', stage = 'failed', error = $1, finished_at = NOW(), updated_at = NOW()
         WHERE bull_job_id = $2 AND status = 'waiting'`,
        [String(err), envelope.job_id],
      );
      throw err;
    }

    this.logger.log(
      `Enqueued asset ${envelope.asset_id} (${envelope.source.originalFilename || 'unnamed'}, type: ${envelope.job_type}, priority: ${envelope.priority})`,
    );

    const workers = await this.queue.getWorkers().catch(() => []);
    if (workers.length === 0) {
      this.logger.warn(
        `[MediaFactory] Asset ${envelope.asset_id} enqueued, but NO active workers are connected to 'indexing-queue'. Run 'pnpm dev:worker' to process jobs.`,
      );
    }

    return jobId;
  }

  async cancelJob(jobOrAssetId: string, userId: string): Promise<{ cancelled: boolean; state: string }> {
    const res = await this.db.query<{
      id: string;
      bull_job_id: string;
      asset_id: string;
      status: string;
      job_type: string;
    }>(
      `SELECT id, bull_job_id, asset_id, status, job_type
       FROM indexing_jobs
       WHERE (id::text = $1 OR bull_job_id = $1 OR asset_id = $1)
         AND user_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [jobOrAssetId, userId],
    );

    if (res.rows.length === 0) {
      return { cancelled: false, state: 'not_found' };
    }

    const jobRow = res.rows[0];

    if (jobRow.status === 'waiting') {
      if (jobRow.bull_job_id) {
        await this.mediaFactory.cancel(jobRow.bull_job_id).catch(() => false);
      }

      await this.db.query(
        `UPDATE indexing_jobs
         SET status = 'cancelled', stage = 'cancelled', error = 'Cancelled by user', finished_at = NOW()
         WHERE id = $1`,
        [jobRow.id],
      );

      if (jobRow.job_type !== 'extract_clip') await this.db.query(
        `UPDATE media_assets
         SET status = 'cancelled', stage = 'cancelled', error = 'Cancelled by user', updated_at = NOW()
         WHERE id = $1`,
        [jobRow.asset_id],
      );

      return { cancelled: true, state: 'waiting_cancelled' };
    }

    if (jobRow.status === 'active') {
      await this.db.query(
        `UPDATE indexing_jobs
         SET cancel_requested = true, updated_at = NOW()
         WHERE id = $1`,
        [jobRow.id],
      );

      return { cancelled: true, state: 'active_cancel_requested' };
    }

    return { cancelled: false, state: jobRow.status };
  }

  async getStats(userId?: string): Promise<IndexingStats> {
    const userClause = userId ? 'WHERE user_id = $1' : '';
    const params = userId ? [userId] : [];

    const res = await this.db.query<{
      status: string;
      count: string;
    }>(
      `SELECT status, COUNT(*)::int AS count
       FROM media_assets
       ${userClause}
       GROUP BY status`,
      params,
    );

    let discovered = 0;
    let indexed = 0;
    let processing = 0;
    let failed = 0;

    for (const r of res.rows) {
      const c = parseInt(r.count, 10);
      discovered += c;
      if (r.status === 'indexed') indexed += c;
      else if (r.status === 'processing') processing += c;
      else if (r.status === 'failed') failed += c;
    }

    const waitingRes = await this.queue.getWaitingCount();
    const activeRes = await this.queue.getActiveCount();
    const queued = waitingRes + activeRes;
    const remaining = processing + queued;

    // Find current active asset if any
    const activeAssetRes = await this.db.query<{
      id: string;
      original_filename: string;
      stage: string;
      progress: number;
    }>(
      `SELECT id, original_filename, stage, progress
       FROM media_assets
       WHERE status = 'processing' ${userId ? 'AND user_id = $1' : ''}
       ORDER BY updated_at DESC
       LIMIT 1`,
      params,
    );

    const activeRow = activeAssetRes.rows[0];
    const capacity = await this.mediaFactory.getCapacity(userId).catch(() => undefined);
    const fallbackWorkers = capacity ? capacity.activeWorkers : (await this.queue.getWorkers().catch(() => [])).length;

    return {
      discovered,
      indexed,
      processing,
      queued,
      failed,
      remaining: Math.max(0, remaining),
      activeWorkers: capacity?.activeWorkers ?? fallbackWorkers,
      globalMaxSlots: capacity?.globalMaxSlots,
      defaultUserSlots: capacity?.defaultUserSlots,
      activeSlots: capacity?.activeSlots,
      waitingForSlot: capacity?.waitingForSlot,
      waitingReasons: capacity?.waitingReasons,
      activeAsset: activeRow
        ? {
            assetId: activeRow.id,
            filename: activeRow.original_filename,
            stage: activeRow.stage,
            progress: activeRow.progress,
          }
        : undefined,
    };
  }

  async getRecentJobs(userId?: string, limit = 50) {
    const userClause = userId ? 'WHERE j.user_id = $1' : '';
    const params = userId ? [userId, limit] : [limit];

    const res = await this.db.query(
      `SELECT j.*, a.original_filename, a.duration, a.file_size
       FROM indexing_jobs j
       LEFT JOIN media_assets a ON a.id = j.asset_id
       ${userClause}
       ORDER BY j.created_at DESC
       LIMIT $${userId ? 2 : 1}`,
      params,
    );
    return res.rows;
  }

  async listJobsPage(userId: string, page: PageRequest) {
    if (!userId) throw new UnauthorizedException();
    const args: any[] = [userId];
    const after = page.after ? (args.push(page.after.createdAt, page.after.id), 'AND (j.created_at,j.id)<($2::timestamptz,$3::uuid)') : '';
    args.push(page.limit + 1);
    const result = await this.db.query(`SELECT j.id,j.bull_job_id,j.asset_id,j.job_type,j.status,j.stage,j.progress,j.priority,
      j.created_at,j.started_at,j.finished_at,j.updated_at,j.cancel_requested,j.result_asset_id,
      j.attempts,j.provider,j.model,j.waiting_reason,j.timings,j.cost,
      a.original_filename, a.duration, a.file_size,o.dispatch_pending,
      to_char(j.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
      FROM indexing_jobs j LEFT JOIN media_assets a ON a.id=j.asset_id LEFT JOIN clip_operations o ON o.id=j.clip_operation_id
      WHERE j.user_id=$1 ${after} ORDER BY j.created_at DESC,j.id DESC LIMIT $${args.length}`, args);
    const paged = pageResult(result.rows, page, 'jobs', userId, ({ cursor_created_at, dispatch_pending, ...row }) => ({ ...row,
      status: dispatch_pending && row.status === 'waiting' ? 'dispatch_pending' :
        ({ waiting: 'queued', active: 'processing' } as Record<string, string>)[row.status] || row.status,
      result_asset_id: row.status === 'completed' ? row.result_asset_id : null }));
    return { jobs: paged.items, count: paged.count, hasMore: paged.hasMore, nextCursor: paged.nextCursor };
  }

  resolveSourcePath(assetId: string, originalPath?: string): string | null {
    if (originalPath && fs.existsSync(originalPath)) {
      return originalPath;
    }
    const proxyPath = path.join(this.proxyDir, `${assetId}.mp4`);
    if (fs.existsSync(proxyPath)) {
      return proxyPath;
    }
    const directUpload = path.join(this.storageRoot, 'uploads', `${assetId}.mp4`);
    if (fs.existsSync(directUpload)) {
      return directUpload;
    }
    const uploadDir = path.join(this.storageRoot, 'uploads', assetId);
    if (fs.existsSync(uploadDir)) {
      try {
        const files = fs.readdirSync(uploadDir);
        if (files.length > 0) {
          const p = path.join(uploadDir, files[0]);
          if (fs.existsSync(p)) return p;
        }
      } catch {
        /* folder inaccessible or deleted */
      }
    }
    return null;
  }

  async retryAsset(assetId: string, userId: string): Promise<boolean> {
    const res = await this.db.query<{
      id: string;
      original_path: string;
      original_filename: string;
      checksum: string;
      file_size: number;
      source_type?: string;
      connector_account_id?: string;
      external_file_id?: string;
    }>(
      `SELECT id, original_path, original_filename, checksum, file_size, source_type, connector_account_id, external_file_id
       FROM media_assets
       WHERE id = $1 AND user_id = $2`,
      [assetId, userId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Asset ${assetId} not found or unauthorized`);
    }

    const row = res.rows[0];
    const isConnectorAsset = Boolean(row.connector_account_id && row.external_file_id);
    let sourcePath = '';

    if (!isConnectorAsset) {
      const resolved = this.resolveSourcePath(row.id, row.original_path);
      // Check if source file or web proxy exists on disk before re-queuing
      if (!resolved) {
        throw new BadRequestException(
          `Cannot retry indexing for ${row.original_filename} (${assetId}): neither original master file nor generated web proxy exists.`,
        );
      }
      sourcePath = resolved;

      if (sourcePath !== row.original_path) {
        this.logger.log(
          `Original file for ${row.original_filename} (${assetId}) was deleted; falling back to web proxy at ${sourcePath}`,
        );
      }
    }

    let retryPlanReady = true;
    if (this.configService.get('INDEX_BUDGET_PLAN_ENABLED', 'false') === 'true') {
      const live = await this.db.query(`SELECT 1 FROM indexing_jobs WHERE asset_id=$1 AND user_id=$2
        AND (status='active' OR (status='waiting' AND job_type NOT IN ('embed','finalize_asset'))) LIMIT 1`, [assetId,userId]);
      if (live.rows.length) throw new ConflictException('This file still has queued or active work. Wait for it to finish before retrying.');
      retryPlanReady = new AiUsageLedger(this.configService).restorePlanForRetry(`${userId}/${assetId}`);
    }

    await this.db.query(
      `UPDATE media_assets
       SET status = 'queued', stage = 'queued', progress = 0, error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [assetId],
    );

    const source = {
      provider: row.source_type || 'upload',
      sourcePath,
      remoteId: row.external_file_id || undefined,
      connectorAccountId: row.connector_account_id || undefined,
      originalFilename: row.original_filename,
      checksum: row.checksum,
      fileSize: Number(row.file_size || 0),
    };

    const failedUnits = this.unitsService
      ? await this.unitsService.getFailedUnits(assetId)
      : [];

    if (failedUnits.length > 0 && this.unitsService) {
      await this.unitsService.resetFailedUnits(assetId);
      if (!retryPlanReady) {
        // Legacy/interrupted work without a recorded plan must pass measured
        // admission again. Completed units/checkpoints are deliberately retained.
        await this.enqueueAsset({job_type:'plan_asset',asset_id:assetId,user_id:userId,source,priority:'normal',processing_config:{forceReindex:false}});
        return true;
      }
      for (const unit of failedUnits) {
        if (unit.unit_id === 'audio_windows' && failedUnits.some((entry) => entry.unit_id === 'audio_transcribe')) continue;
        await this.enqueueAsset({
          job_type: unitTypeToJobType(unit.unit_type),
          asset_id: assetId,
          user_id: userId,
          source,
          segment:
            unit.start_s != null
              ? { start_s: Number(unit.start_s), end_s: Number(unit.end_s) }
              : null,
          priority: 'normal',
          processing_config: { unitId: unit.unit_id },
        });
      }
      await this.enqueueAsset({
        job_type: 'finalize_asset',
        asset_id: assetId,
        user_id: userId,
        source,
        segment: null,
        priority: 'normal',
        processing_config: { unitId: 'finalize' },
      });
      this.logger.log(
        `Retrying ${failedUnits.length} failed unit(s) for asset ${assetId}; completed units left in place`,
      );
      return true;
    }

    if (this.unitsService) {
      await this.unitsService.resetAssetUnits(assetId);
    }

    await this.enqueueAsset({
      job_type: 'plan_asset',
      asset_id: row.id,
      user_id: userId,
      source,
      priority: 'normal',
      processing_config: { forceReindex: true },
    });

    return true;
  }

  async reindexMatching(userId: string, pattern: string): Promise<{ queued: number; skipped: number; assetIds: string[] }> {
    const res = await this.db.query<{
      id: string;
      original_path: string;
      original_filename: string;
      checksum: string;
      file_size: string;
    }>(
      `SELECT id, original_path, original_filename, checksum, file_size
       FROM media_assets
       WHERE user_id = $1
         AND original_filename ILIKE $2
       ORDER BY
         CASE WHEN original_filename ILIKE '%HEART FAILURE%' THEN 0 ELSE 1 END,
         original_filename`,
      [userId, `%${pattern}%`],
    );

    const assetIds: string[] = [];
    let skipped = 0;
    for (const row of res.rows) {
      const sourcePath = this.resolveSourcePath(row.id, row.original_path);
      if (!sourcePath) {
        this.logger.warn(`Skip reindex ${row.original_filename}: neither original source nor proxy found`);
        skipped += 1;
        continue;
      }
      if (sourcePath !== row.original_path) {
        this.logger.log(`Reindexing ${row.original_filename} from web proxy fallback: ${sourcePath}`);
      }
      await this.db.query(
        `UPDATE media_assets
         SET status = 'queued', stage = 'queued', progress = 0, error = NULL, updated_at = NOW()
         WHERE id = $1`,
        [row.id],
      );
      await this.enqueueAsset({
        assetId: row.id,
        userId,
        sourcePath,
        originalFilename: row.original_filename,
        checksum: row.checksum,
        fileSize: Number(row.file_size || 0),
        forceReindex: true,
      });
      assetIds.push(row.id);
    }

    this.logger.log(`Queued ${assetIds.length} assets for force reindex (pattern=${pattern})`);
    return { queued: assetIds.length, skipped, assetIds };
  }
}
