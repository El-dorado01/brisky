import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { resolveFromRepo } from '../../common/repo-paths';
import { DatabaseService } from '../database/database.service';
import { IndexingJobData, IndexingStats } from './indexing.types';

@Injectable()
export class IndexingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IndexingService.name);
  private readonly storageRoot: string;
  private readonly proxyDir: string;

  constructor(
    @InjectQueue('indexing-queue') private readonly queue: Queue<IndexingJobData>,
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.storageRoot = resolveFromRepo(
      this.configService.get<string>('STORAGE_ROOT', './storage'),
    );
    this.proxyDir = path.join(this.storageRoot, 'proxies');
  }

  async onApplicationBootstrap() {
    await this.reconcileStalledJobs();
  }

  async reconcileStalledJobs(): Promise<{ reconciledJobs: number; reconciledAssets: number }> {
    let reconciledJobs = 0;
    let reconciledAssets = 0;
    try {
      // 1. Reconcile indexing_jobs stuck in 'active' from prior runs
      const activeJobs = await this.db.query<{ id: string; bull_job_id: string; asset_id: string }>(
        `SELECT id, bull_job_id, asset_id FROM indexing_jobs WHERE status = 'active'`,
      );

      if (activeJobs.rows.length > 0) {
        this.logger.log(`Found ${activeJobs.rows.length} stalled active indexing jobs from prior run; reconciling...`);
        for (const jobRow of activeJobs.rows) {
          const bullJob = jobRow.bull_job_id ? await this.queue.getJob(jobRow.bull_job_id) : null;
          const isActiveInBull = bullJob ? await bullJob.isActive() : false;
          if (!isActiveInBull) {
            await this.db.query(
              `UPDATE indexing_jobs
               SET status = 'failed', error = 'Interrupted by server restart. Click Retry to re-index.', finished_at = NOW()
               WHERE id = $1`,
              [jobRow.id],
            );
            reconciledJobs += 1;
          }
        }
      }

      // 2. Reconcile media_assets stuck in 'processing'
      const processingAssets = await this.db.query<{ id: string; original_filename: string }>(
        `SELECT id, original_filename FROM media_assets WHERE status = 'processing'`,
      );

      if (processingAssets.rows.length > 0) {
        this.logger.log(`Found ${processingAssets.rows.length} processing media assets from prior run; reconciling...`);
        for (const asset of processingAssets.rows) {
          await this.db.query(
            `UPDATE media_assets
             SET status = 'failed', stage = 'failed', error = 'Indexing was interrupted by a server restart. Click Retry to re-index.', updated_at = NOW()
             WHERE id = $1`,
            [asset.id],
          );
          reconciledAssets += 1;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed during stalled job reconciliation: ${err}`);
    }
    return { reconciledJobs, reconciledAssets };
  }

  async enqueueAsset(data: IndexingJobData): Promise<string> {
    // Smaller files get lower priority numbers (BullMQ processes lower number first)
    const priority = Math.min(1000, Math.max(1, Math.round(data.fileSize / (1024 * 1024))));

    const job = await this.queue.add('index-video', data, {
      priority,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 4000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    });

    const model = this.configService.get<string>('GEMINI_MODEL', 'gemini-2.5-flash');

    // Record job in database with provider and model metadata
    await this.db.query(
      `INSERT INTO indexing_jobs (bull_job_id, asset_id, user_id, status, stage, progress, provider, model)
       VALUES ($1, $2, $3, 'waiting', 'queued', 0, 'google', $4)`,
      [job.id, data.assetId, data.userId, model],
    );

    this.logger.log(`Enqueued asset ${data.assetId} (${data.originalFilename}, priority: ${priority})`);
    return job.id || '';
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
    let queued = 0;
    let failed = 0;

    for (const row of res.rows) {
      const c = Number(row.count);
      discovered += c;
      if (row.status === 'indexed') indexed += c;
      else if (row.status === 'processing') processing += c;
      else if (row.status === 'queued') queued += c;
      else if (row.status === 'failed') failed += c;
    }

    const remaining = queued;

    // Find current active asset if any
    const activeRes = await this.db.query<{
      id: string;
      original_filename: string;
      stage: string;
      progress: number;
    }>(
      `SELECT id, original_filename, stage, progress
       FROM media_assets
       WHERE status = 'processing' ${userId ? 'AND user_id = $1' : ''}
       ORDER BY updated_at DESC LIMIT 1`,
      params,
    );

    const activeRow = activeRes.rows[0];
    return {
      discovered,
      indexed,
      processing,
      queued,
      failed,
      remaining: Math.max(0, remaining),
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

    await this.db.query(
      `UPDATE media_assets
       SET status = 'queued', stage = 'queued', progress = 0, error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [assetId],
    );

    await this.enqueueAsset({
      assetId: row.id,
      userId,
      sourcePath,
      originalFilename: row.original_filename,
      checksum: row.checksum,
      fileSize: Number(row.file_size || 0),
      sourceType: (row.source_type as any) || 'upload',
      provider: row.source_type || 'upload',
      remoteId: row.external_file_id,
      externalFileId: row.external_file_id,
      connectorAccountId: row.connector_account_id,
      forceReindex: true,
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
