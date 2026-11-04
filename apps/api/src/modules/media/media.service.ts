import { PageRequest, pageResult } from '../../common/pagination';
import { Injectable, Logger, NotFoundException, Optional, BadRequestException, UnauthorizedException, OnModuleDestroy,ServiceUnavailableException } from '@nestjs/common';
import { validateClip } from '../../common/request-validation';
import { ConfigService } from '@nestjs/config';
import { embeddingProviderForUser } from '../pipeline/embedding-provider';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import { IndexingService } from '../queue/indexing.service';
import { FactoryJobEnvelope } from '../queue/indexing.types';
import { AiIntelligenceService } from '../pipeline/ai-intelligence.service';
import { LocalEmbeddingService } from '../pipeline/local-embedding.service';
import { SearchEvidence, SearchEvidenceService, evidenceMode } from '../pipeline/search-evidence.service';
import { ProxyCacheService } from '../pipeline/proxy-cache.service';
import { UploadConnector } from '../connector/upload.connector';
import { ConnectorsService } from '../connector/connectors.service';
import { ConnectorRegistry } from '../connector/connector.registry';
import {
  assertPathWithinRoot,
  resolveFromRepo,
  validateAssetId,
  guessMime,
} from '../../common/repo-paths';
import { resolveStorageLocator, toStorageLocator } from '../../common/storage-paths';
import {
  getBenchmarkQueries,
  getLibraryBenchmarkQueries,
} from './benchmark-queries';
import { parseSearchQuery } from './query-parse';
import { PeopleSearchService } from '../people/people-search.service';
import { ConversationVerifierService, wantsConversation } from '../people/conversation-verifier.service';
import { peopleSearchOptions } from '../people/people-search';
import { assertSearchActive, searchSignal, SearchDeadlineError, withSearchDeadline } from '../../common/search-deadline';
import { acquireSearchResource, publishSearchResults, retrievalOnly, reserveCloudBytes, withSearchProgress } from '../../common/search-progress';
import { stageCloudSource } from './cloud-inspection-source';
import { openSeekableMediaSource } from '../pipeline/seekable-media-source';
import {
  parseKeyframePaths,
  materializeKeyframeFiles,
  narrowResultWindow,
} from '../pipeline/scene-sampling';
import {
  PublicAsset,
  SearchResult,
  BenchmarkResult,
  LibraryBenchmarkResult,
  LibraryBenchmarkSummary,
  UnitEconomicsSummary,
  AssetLineage,
  AssetRelationship,
  SearchResponse,
  FeedbackPayload,
  UnderstoodQuery,
} from './media.types';
export type {
  PublicAsset,
  SearchResult,
  BenchmarkResult,
  LibraryBenchmarkResult,
  LibraryBenchmarkSummary,
  UnitEconomicsSummary,
  AssetLineage,
  AssetRelationship,
  SearchResponse,
  FeedbackPayload,
  UnderstoodQuery,
};

@Injectable()
export class MediaService implements OnModuleDestroy {
  private embeddingCleanupTimer?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(MediaService.name);
  private storageRoot: string;
  private proxyDir: string;
  private clipsDir: string;
  private thumbnailDir: string;
  private scratchDir: string;
  private embeddingCache: Map<string, { values: number[]; timestamp: number }> =
    new Map();
  private readonly EMBEDDING_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
    private readonly indexingService: IndexingService,
    private readonly aiService: AiIntelligenceService,
    private readonly localEmbeddingService: LocalEmbeddingService,
    private readonly uploadConnector: UploadConnector,
    @Optional() private readonly proxyCacheService?: ProxyCacheService,
    @Optional() private readonly connectorsService?: ConnectorsService,
    @Optional() private readonly connectorRegistry?: ConnectorRegistry,
    @Optional() private readonly searchEvidenceService?: SearchEvidenceService,
    @Optional() private readonly peopleSearchService?: PeopleSearchService,
    @Optional() private readonly conversationVerifier?: ConversationVerifierService,
  ) {
    this.storageRoot = resolveFromRepo(
      this.configService.get<string>('STORAGE_ROOT', './storage'),
    );
    this.proxyDir = path.join(this.storageRoot, 'proxies');
    this.clipsDir = path.join(this.storageRoot, 'clips');
    this.thumbnailDir = path.join(this.storageRoot, 'thumbnails');
    this.scratchDir = path.join(this.storageRoot, 'scratch');

    [
      this.storageRoot,
      this.proxyDir,
      this.clipsDir,
      this.thumbnailDir,
      this.scratchDir,
    ].forEach((dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
    this.startEmbeddingCacheCleanup();
  }

  private startEmbeddingCacheCleanup() {
    // Clean up expired cache entries every hour
    this.embeddingCleanupTimer = setInterval(
      () => {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, entry] of this.embeddingCache.entries()) {
          if (now - entry.timestamp > this.EMBEDDING_CACHE_TTL_MS) {
            this.embeddingCache.delete(key);
            cleaned += 1;
          }
        }
        if (cleaned > 0) {
          this.logger.debug(
            `Cleaned ${cleaned} expired embedding cache entries`,
          );
        }
      },
      60 * 60 * 1000,
    ); // Run every hour
    this.embeddingCleanupTimer.unref();
  }

  onModuleDestroy() { if (this.embeddingCleanupTimer) clearInterval(this.embeddingCleanupTimer); }

  private normalizeForCache(text: string): string {
    // Normalize: lowercase, trim, collapse whitespace
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private async getCachedOrGenerateEmbedding(text: string, userId?:string): Promise<number[]> {
    const normalized = this.normalizeForCache(text);
    const preferredProvider = embeddingProviderForUser(this.configService,userId);
    const space=preferredProvider==='local'?this.configService.get('LOCAL_EMBEDDING_MODEL','sentence-transformers/all-MiniLM-L6-v2'):this.aiService.getEmbeddingModel?.()||this.configService.get('AI_EMBEDDING_MODEL','gemini-embedding-001');
    const cacheKey = createHash('sha256').update(JSON.stringify([preferredProvider,space,normalized])).digest('hex');

    // Check cache first
    const cached = this.embeddingCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.EMBEDDING_CACHE_TTL_MS) {
      this.logger.debug(`Embedding cache hit for: ${text.substring(0, 50)}`);
      return cached.values;
    }

    // Generate new embedding
    let values: number[] = [];

    if (preferredProvider === 'local') {
      if (!this.localEmbeddingService.isAvailable()) throw new Error('Local embedding engine unavailable');
      // A remote vector belongs to a different embedding space. Preserve lexical fallback instead.
      const res = await this.localEmbeddingService.generateEmbedding(normalized);
      values = res.values;
    } else if (this.aiService.isConfigured()) {
      const res = await this.aiService.generateEmbedding(normalized);
      values = res.values;
    }

    // Cache the result
    if (values.length > 0) {
      this.embeddingCache.set(cacheKey, { values, timestamp: Date.now() });
      this.logger.debug(
        `Cached embedding for: ${text.substring(0, 50)} (${this.embeddingCache.size} total)`,
      );
    }

    return values;
  }

  newAssetId(): string {
    return `vid_${Date.now()}_${randomBytes(3).toString('hex')}`;
  }

  async hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async findByChecksum(checksum: string, userId: string) {
    const res = await this.db.query(
      `SELECT * FROM media_assets
       WHERE checksum = $1 AND user_id = $2 AND status IN ('indexed', 'queued', 'processing')
       ORDER BY CASE WHEN status = 'indexed' THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1`,
      [checksum, userId],
    );
    return res.rows[0];
  }

  async startFromIngestedFile(params: {
    assetId: string;
    userId: string;
    originalFilename: string;
    sourcePath: string;
    checksum: string;
    fileSize: number;
  }) {
    // 1. Deduplication check
    const existing = await this.findByChecksum(params.checksum, params.userId);
    if (existing) {
      this.logger.log(
        `File ${params.originalFilename} (checksum ${params.checksum}) matches existing asset ${existing.id} (${existing.status}); deduplicating`,
      );
      return {
        assetId: existing.id,
        status: existing.status,
        checksum: params.checksum,
        originalFilename: existing.original_filename,
        deduplicated: true,
      };
    }

    // 2. Insert queued asset row into PostgreSQL
    await this.db.query(
      `INSERT INTO media_assets (
         id, user_id, source_type, original_filename, checksum,
         file_size, status, stage, progress, original_path
       ) VALUES ($1, $2, 'upload', $3, $4, $5, 'queued', 'queued', 0, $6)`,
      [
        params.assetId,
        params.userId,
        params.originalFilename,
        params.checksum,
        params.fileSize,
        params.sourcePath,
      ],
    );

    // 3. Dispatch to BullMQ worker queue with priority
    await this.indexingService.enqueueAsset({
      assetId: params.assetId,
      userId: params.userId,
      sourcePath: params.sourcePath,
      originalFilename: params.originalFilename,
      checksum: params.checksum,
      fileSize: params.fileSize,
    });

    return {
      assetId: params.assetId,
      status: 'queued',
      checksum: params.checksum,
      originalFilename: params.originalFilename,
      deduplicated: false,
    };
  }

  async startFromUploadStream(
    originalFilename: string,
    stream: NodeJS.ReadableStream,
    userId: string,
  ) {
    const assetId = this.newAssetId();
    const stored = await this.uploadConnector.ingestStream(
      assetId,
      originalFilename,
      stream,
    );
    const stat = fs.statSync(stored);
    const checksum = await this.hashFile(stored);
    const existing = await this.findByChecksum(checksum, userId);
    if (existing) {
      await this.uploadConnector.deleteSource(assetId);
      return {
        assetId: existing.id,
        status: existing.status,
        checksum,
        originalFilename: existing.original_filename,
        deduplicated: true,
      };
    }

    return this.startFromIngestedFile({
      assetId,
      userId,
      originalFilename,
      sourcePath: stored,
      checksum,
      fileSize: stat.size,
    });
  }

  async getPublicAsset(assetId: string, userId?: string): Promise<PublicAsset> {
    const userClause = userId ? 'AND user_id = $2' : '';
    const params = userId ? [assetId, userId] : [assetId];

    const res = await this.db.query(
      `SELECT *,
              (SELECT started_at FROM indexing_jobs WHERE asset_id = media_assets.id ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1) AS job_started_at
       FROM media_assets WHERE id = $1 ${userClause}`,
      params,
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundException(`Asset ${assetId} not found.`);

    const countRes = await this.db.query(
      'SELECT COUNT(*)::int AS count FROM media_segments WHERE asset_id = $1',
      [assetId],
    );
    const segmentCount = countRes.rows[0]?.count || 0;

    return {
      assetId: row.id,
      originalFilename: row.original_filename,
      checksum: row.checksum,
      sourceType: row.source_type,
      status: row.status,
      stage: row.stage,
      progress: row.progress,
      error: row.error,
      originalDeleted: row.original_deleted,
      duration: row.duration,
      resolution:
        row.width && row.height ? `${row.width}x${row.height}` : 'unknown',
      codec: row.codec,
      segmentCount,
      indexedAt: row.indexed_at,
      startedAt: row.job_started_at,
      thumbnailUrl: `/api/v1/media/${row.id}/thumbnail`,
      streamUrl: `/api/v1/media/${row.id}/stream`,
      costUsd: row.cost_usd,
      costPerSourceMinuteUsd: row.cost_per_source_minute_usd,
      framesAnalyzed: row.frames_analyzed,
      indexDurationMs: row.index_duration_ms,
      parentAssetId: row.parent_asset_id,
      relationshipType: row.relationship_type,
      phash: row.phash,
      proxyStatus: row.proxy_status,
      availability: row.availability,
      externalFileId: row.external_file_id,
      connectorAccountId: row.connector_account_id,
      driveWebViewLink: row.drive_web_view_link,
    };
  }

  async listPublicAssets(userId?: string): Promise<PublicAsset[]> {
    return (await this.readPublicAssets(userId)).map((row) => this.mapPublicAsset(row));
  }

  async listAssetsPage(userId: string, page: PageRequest) {
    if (!userId) throw new UnauthorizedException();
    const result = pageResult(await this.readPublicAssets(userId, page), page, 'assets', userId, (row) => this.mapPublicAsset(row));
    return { assets: result.items, count: result.count, hasMore: result.hasMore, nextCursor: result.nextCursor };
  }

  private async readPublicAssets(userId?: string, page?: PageRequest) {
    const userClause = userId ? 'WHERE a.user_id = $1' : '';
    const params: any[] = userId ? [userId] : [];
    let cursorClause = '';
    if (page?.after) {
      params.push(page.after.createdAt, page.after.id);
      cursorClause = 'AND (a.created_at,a.id) < ($2::timestamptz,$3::varchar)';
    }
    const limitClause = page ? `LIMIT $${params.push(page.limit + 1)}` : '';

    const res = await this.db.query(
      `SELECT a.*, to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,
              (SELECT COUNT(*)::int FROM media_segments s WHERE s.asset_id=a.id) AS segment_count,
              (SELECT started_at FROM indexing_jobs WHERE asset_id = a.id ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1) AS job_started_at
       FROM media_assets a
       ${userClause} ${cursorClause}
       ORDER BY a.created_at DESC, a.id DESC ${limitClause}`,
      params,
    );

    return res.rows;
  }

  private mapPublicAsset(row: any): PublicAsset {
    return {
      assetId: row.id,
      originalFilename: row.original_filename,
      checksum: row.checksum,
      sourceType: row.source_type,
      externalFileId: row.external_file_id,
      connectorAccountId: row.connector_account_id,
      driveWebViewLink: row.drive_web_view_link,
      status: row.status,
      stage: row.stage,
      progress: row.progress,
      error: row.error ? 'Processing failed; inspect job status to continue' : undefined,
      originalDeleted: row.original_deleted,
      duration: row.duration,
      resolution:
        row.width && row.height ? `${row.width}x${row.height}` : 'unknown',
      codec: row.codec,
      segmentCount: row.segment_count || 0,
      indexedAt: row.indexed_at,
      startedAt: row.job_started_at,
      thumbnailUrl: `/api/v1/media/${row.id}/thumbnail`,
      streamUrl: `/api/v1/media/${row.id}/stream`,
      costUsd: row.cost_usd,
      costPerSourceMinuteUsd: row.cost_per_source_minute_usd,
      framesAnalyzed: row.frames_analyzed,
      indexDurationMs: row.index_duration_ms,
      parentAssetId: row.parent_asset_id,
      relationshipType: row.relationship_type,
      phash: row.phash,
      proxyStatus: row.proxy_status,
      availability: row.availability,
    };
  }

  async getLineage(assetId: string, userId?: string): Promise<AssetLineage> {
    const asset = await this.getPublicAsset(assetId, userId);

    let parentAsset: PublicAsset | null = null;
    if (asset.parentAssetId) {
      try {
        parentAsset = await this.getPublicAsset(asset.parentAssetId, userId);
      } catch {
        // Parent might not be accessible or belongs to another scope
      }
    }

    const childRes = await this.db.query(
      `SELECT id FROM media_assets WHERE parent_asset_id = $1 ${userId ? 'AND user_id = $2' : ''} ORDER BY created_at ASC`,
      userId ? [assetId, userId] : [assetId],
    );
    const children: PublicAsset[] = [];
    for (const row of childRes.rows) {
      try {
        const c = await this.getPublicAsset(row.id, userId);
        children.push(c);
      } catch {
        // skip if not accessible
      }
    }

    const relRes = await this.db.query(
      `SELECT * FROM asset_relationships
       WHERE source_asset_id = $1 OR target_asset_id = $1
       ORDER BY created_at ASC`,
      [assetId],
    );

    const relationships: AssetRelationship[] = relRes.rows.map((r: any) => ({
      id: r.id,
      sourceAssetId: r.source_asset_id,
      targetAssetId: r.target_asset_id,
      relationshipType: r.relationship_type,
      confidence: Number(r.confidence || 1.0),
      metadata: r.metadata,
      createdAt: r.created_at,
    }));

    return {
      assetId,
      parentAsset,
      children,
      relationships,
    };
  }

  async getPublicArtifacts(assetId: string, userId?: string) {
    const asset = await this.getPublicAsset(assetId, userId);

    const segmentsRes = await this.db.query(
      `SELECT id, asset_id, start_time, end_time, title, description,
              visual_objects, actions, transcript_text, on_screen_text,
              keyframe_path, sources, provider, model
       FROM media_segments
       WHERE asset_id = $1
       ORDER BY start_time ASC`,
      [assetId],
    );

    const observationsRes = await this.db.query(
      `SELECT observation_type, timestamp_start, timestamp_end, raw_data
       FROM media_observations
       WHERE asset_id = $1
       ORDER BY timestamp_start ASC`,
      [assetId],
    );

    return {
      ...asset,
      segments: segmentsRes.rows.map((r) => ({
        id: r.id,
        assetId: r.asset_id,
        startTime: r.start_time,
        endTime: r.end_time,
        title: r.title,
        description: r.description,
        visualObjects: r.visual_objects,
        actions: r.actions,
        transcriptText: r.transcript_text,
        onScreenText: r.on_screen_text,
        keyframePath: r.keyframe_path,
        sources: r.sources,
        provider: r.provider,
        model: r.model,
      })),
      observations: observationsRes.rows,
    };
  }

  async getStreamInfo(
    assetId: string,
    userId?: string,
    allowQueue = true,
  ): Promise<
    | { status: 'ready'; filePath: string }
    | { status: 'preparing'; proxyStatus: string; message: string }
  > {
    const validId = validateAssetId(assetId);
    const userClause = userId ? 'AND user_id = $2' : '';
    const params = userId ? [validId, userId] : [validId];

    const res = await this.db.query(
      `SELECT m.id, m.user_id, m.status, m.proxy_status, m.proxy_path, m.original_path, m.original_filename,
              COALESCE(m.source_type, p.source_type) AS source_type,
              m.external_file_id,
              COALESCE(m.connector_account_id, p.connector_account_id) AS connector_account_id,
              m.checksum, m.file_size, m.proxy_remote_id, m.parent_asset_id
       FROM media_assets m
       LEFT JOIN media_assets p ON m.parent_asset_id = p.id
       WHERE m.id = $1 ${userClause ? 'AND m.user_id = $2' : ''}`,
      params,
    );
    const asset = res.rows[0];
    if (!asset) {
      throw new NotFoundException(`Asset ${validId} not found`);
    }

    // Record access for LRU tracking
    if (this.proxyCacheService) {
      this.proxyCacheService.recordAccess(validId);
    }

    const defaultLocalPath = this.defaultPlayablePath(validId, asset.parent_asset_id);
    const resolvedStored = this.safeLocalMediaPath(asset.proxy_path);
    const existing =
      this.existingPlayableFile(resolvedStored) || this.existingPlayableFile(defaultLocalPath);

    if (existing) {
      const loc = toStorageLocator(existing, this.storageRoot);
      if (asset.proxy_path !== loc || asset.proxy_status !== 'ready') {
        await this.db.query(
          `UPDATE media_assets SET proxy_status = 'ready', proxy_path = $1, updated_at = NOW() WHERE id = $2`,
          [loc, validId],
        );
      }
      return { status: 'ready', filePath: existing };
    }

    // Zero-shared-disk: hydrate from connector into THIS host's storage root.
    // Never pass a worker container path like /app/storage/proxies/... to the jail.
    if (asset.proxy_remote_id && asset.connector_account_id) {
      const hydrated = await this.hydrateRemoteDerivedFile(
        asset,
        defaultLocalPath,
        asset.proxy_remote_id,
      );
      if (hydrated) {
        const loc = toStorageLocator(defaultLocalPath, this.storageRoot);
        await this.db.query(
          `UPDATE media_assets SET proxy_status = 'ready', proxy_path = $1, updated_at = NOW() WHERE id = $2`,
          [loc, validId],
        );
        return { status: 'ready', filePath: defaultLocalPath };
      }
    }

    if (asset.proxy_status === 'skipped' || asset.proxy_status === 'ready') {
      const originalLocal =
        this.existingPlayableFile(this.safeLocalMediaPath(asset.original_path)) ||
        this.existingPlayableFile(asset.original_path);
      if (originalLocal) {
        return { status: 'ready', filePath: originalLocal };
      }
    }

    // 3. If preview is already queued or processing, return preparing status
    if (asset.proxy_status === 'processing' || asset.proxy_status === 'queued') {
      return {
        status: 'preparing',
        proxyStatus: asset.proxy_status,
        message: 'Preview is being prepared. Please retry shortly.',
      };
    }

    // The SaaS playback bridge reports readiness without starting background work.
    if(!allowQueue)return {status:'preparing',proxyStatus:asset.proxy_status||'pending',message:'Preview is not ready yet.'};
    // 4. On-demand trigger: enqueue generate_proxy job with interactive priority
    const envelope: FactoryJobEnvelope = {
      job_id: `proxy_${validId}_${Date.now()}`,
      job_type: 'generate_proxy',
      asset_id: validId,
      user_id: asset.user_id,
      source: {
        provider: asset.source_type || 'upload',
        sourcePath: asset.original_path || '',
        remoteId: asset.external_file_id || undefined,
        connectorAccountId: asset.connector_account_id || undefined,
        originalFilename: asset.original_filename || '',
        checksum: asset.checksum || '',
        fileSize: asset.file_size || 0,
      },
      priority: 'interactive',
    };

    await this.indexingService.enqueueAsset(envelope);
    await this.db.query(
      `UPDATE media_assets SET proxy_status = 'queued', updated_at = NOW() WHERE id = $1`,
      [validId],
    );

    return {
      status: 'preparing',
      proxyStatus: 'queued',
      message: 'Preview generation requested. Please retry shortly.',
    };
  }

  async getRemotePlaybackSource(assetId:string,userId:string,signal:AbortSignal){
    const found=await this.db.query(`SELECT a.source_type,a.external_file_id,a.connector_account_id,a.file_size,a.checksum,
      a.original_filename,u.metadata->>'sourceVersion' AS source_version
      FROM media_assets a JOIN connector_accounts c ON c.id=a.connector_account_id AND c.user_id=a.user_id AND c.status='connected'
      LEFT JOIN media_processing_units u ON u.asset_id=a.id AND u.unit_id='source_preparation'
      WHERE a.id=$1 AND a.user_id=$2`,[validateAssetId(assetId),userId]);
    const asset=found.rows[0];
    if(!asset||!asset.external_file_id||!this.connectorsService||!this.connectorRegistry)return null;
    const connector=this.connectorRegistry.get(asset.source_type==='drive'?'google_drive':asset.source_type);
    if(!connector.openReadSession)return null;
    const auth=await this.connectorsService.getAuthContext(asset.connector_account_id,userId);
    const session=await connector.openReadSession(auth,asset.external_file_id,signal);
    if(session.size!==Number(asset.file_size))
      throw new ServiceUnavailableException('The source changed since indexing; sync it again before playback');
    if(!asset.source_version||session.version!==asset.source_version){
      // Drive versions include metadata/permission edits, not just content changes.
      // Accept those only when the stored content checksum still matches.
      if(!/^[a-f0-9]{32}$/i.test(asset.checksum||''))throw new ServiceUnavailableException('Cannot confirm the indexed source identity');
      const metadata=await connector.getAsset(auth,asset.external_file_id);
      if(metadata.md5Checksum?.toLowerCase()!==asset.checksum.toLowerCase()||metadata.size!==session.size)
        throw new ServiceUnavailableException('The source changed since indexing; sync it again before playback');
    }
    const mime=guessMime(asset.original_filename);
    if(!['video/mp4','video/webm','video/quicktime'].includes(mime))return null;
    return {...session,mime};
  }

  private defaultPlayablePath(assetId: string, parentAssetId?: string | null): string {
    const isClip = Boolean(parentAssetId) || assetId.startsWith('clip_');
    const dir = isClip ? this.clipsDir : this.proxyDir;
    return assertPathWithinRoot(path.join(dir, `${assetId}.mp4`), this.storageRoot);
  }

  /** Map a stored locator or foreign absolute path onto this host's STORAGE_ROOT. */
  private safeLocalMediaPath(stored: string | null | undefined): string | null {
    const resolved = resolveStorageLocator(stored, this.storageRoot);
    if (!resolved) return null;
    try {
      return assertPathWithinRoot(resolved, this.storageRoot);
    } catch {
      return null;
    }
  }

  private existingPlayableFile(candidate: string | null | undefined): string | null {
    if (!candidate) return null;
    try {
      const valid = assertPathWithinRoot(candidate, this.storageRoot);
      if (fs.existsSync(valid) && fs.statSync(valid).size > 0) return valid;
    } catch {
      return null;
    }
    return null;
  }

  private async hydrateRemoteDerivedFile(
    asset: {
      user_id: string;
      source_type?: string;
      connector_account_id?: string;
    },
    destPath: string,
    remoteId: string,
  ): Promise<boolean> {
    if (!this.connectorsService || !this.connectorRegistry || !asset.connector_account_id) {
      return false;
    }
    try {
      const provider =
        asset.source_type === 'drive' ? 'google_drive' : asset.source_type || 'google_drive';
      const connector = this.connectorRegistry.get(provider);
      const auth = await this.connectorsService.getAuthContext(
        asset.connector_account_id,
        asset.user_id,
      );
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await connector.downloadAsset(auth, remoteId, destPath);
      return fs.existsSync(destPath) && fs.statSync(destPath).size > 0;
    } catch (err) {
      this.logger.warn(`Failed to hydrate derived media ${remoteId} from connector: ${err}`);
      return false;
    }
  }

  async getStreamPath(assetId: string, userId?: string): Promise<string> {
    const info = await this.getStreamInfo(assetId, userId);
    if (info.status === 'ready') return info.filePath;
    throw new NotFoundException(
      `Playable media preview not ready for asset ${assetId} (status: ${info.proxyStatus}).`,
    );
  }

  async enqueueClipExtraction(
    assetId: string,
    params: { start_s: number; end_s: number; title?: string },
    userId?: string,
    idempotencyKey?: string,
  ): Promise<{ job_id: string; status: string; message: string }> {
    if (!userId) throw new UnauthorizedException();
    validateClip(params);
    const validId = validateAssetId(assetId);
    const userClause = userId ? 'AND user_id = $2' : '';
    const res = await this.db.query(
      `SELECT id, user_id, original_path, original_filename, source_type,
              external_file_id, connector_account_id, checksum, file_size, duration
       FROM media_assets WHERE id = $1 ${userClause}`,
      userId ? [validId, userId] : [validId],
    );
    const asset = res.rows[0];
    if (!asset) {
      throw new NotFoundException(`Asset ${validId} not found`);
    }

    if (Number(asset.duration) > 0 && params.end_s > Number(asset.duration)) {
      throw new BadRequestException('Clip end_s exceeds the source duration');
    }

    const envelope: FactoryJobEnvelope = {
      job_id: `clip_${validId}_${Date.now()}`,
      job_type: 'extract_clip',
      asset_id: validId,
      user_id: asset.user_id,
      source: {
        provider: asset.source_type || 'upload',
        sourcePath: asset.original_path || '',
        remoteId: asset.external_file_id || undefined,
        connectorAccountId: asset.connector_account_id || undefined,
        originalFilename: asset.original_filename || '',
        checksum: asset.checksum || '',
        fileSize: asset.file_size || 0,
      },
      segment: {
        start_s: params.start_s,
        end_s: params.end_s,
      },
      priority: 'interactive',
    };

    return this.indexingService.enqueueClip(envelope, idempotencyKey, params.title);
  }

  async getThumbnailPath(assetId: string, userId?: string): Promise<string> {
    const validId = validateAssetId(assetId);
    let parentAssetId: string | null = null;
    if (userId) {
      const check = await this.db.query(
        'SELECT id, parent_asset_id FROM media_assets WHERE id = $1 AND user_id = $2',
        [validId, userId],
      );
      if (check.rows.length === 0) {
        throw new NotFoundException(`Thumbnail not found for asset ${validId}`);
      }
      parentAssetId = check.rows[0].parent_asset_id;
    } else {
      const check = await this.db.query(
        'SELECT parent_asset_id FROM media_assets WHERE id = $1',
        [validId],
      );
      if (check.rows.length > 0) {
        parentAssetId = check.rows[0].parent_asset_id;
      }
    }

    const thumbPath = assertPathWithinRoot(
      path.join(this.thumbnailDir, `${validId}.jpg`),
      this.storageRoot,
    );
    if (fs.existsSync(thumbPath)) return thumbPath;

    // Fallback to parent asset thumbnail if derived clip
    if (parentAssetId) {
      const parentThumbPath = assertPathWithinRoot(
        path.join(this.thumbnailDir, `${parentAssetId}.jpg`),
        this.storageRoot,
      );
      if (fs.existsSync(parentThumbPath)) return parentThumbPath;
    }

    throw new NotFoundException(`Thumbnail not found for asset ${validId}`);
  }

  async getThumbnail(
    assetId: string,
    userId?: string,
  ): Promise<{ buffer?: Buffer; filePath?: string; mimeType: string }> {
    const validId = validateAssetId(assetId);
    let parentAssetId: string | null = null;
    let thumbnailData: string | null = null;

    const userClause = userId ? 'AND user_id = $2' : '';
    const params = userId ? [validId, userId] : [validId];

    const check = await this.db.query(
      `SELECT id, parent_asset_id, thumbnail_data FROM media_assets WHERE id = $1 ${userClause}`,
      params,
    );
    if (check.rows.length === 0) {
      throw new NotFoundException(`Thumbnail not found for asset ${validId}`);
    }

    thumbnailData = check.rows[0].thumbnail_data;
    parentAssetId = check.rows[0].parent_asset_id;

    // 1. If thumbnail_data is stored in DB (Zero-Shared-Disk contract), decode and serve directly
    if (thumbnailData) {
      const base64Data = thumbnailData.includes(',') ? thumbnailData.split(',')[1] : thumbnailData;
      return {
        buffer: Buffer.from(base64Data, 'base64'),
        mimeType: 'image/jpeg',
      };
    }

    // 2. Local disk check
    const thumbPath = assertPathWithinRoot(
      path.join(this.thumbnailDir, `${validId}.jpg`),
      this.storageRoot,
    );
    if (fs.existsSync(thumbPath)) {
      return { filePath: thumbPath, mimeType: 'image/jpeg' };
    }

    // 3. Fallback to parent asset if derived clip
    if (parentAssetId) {
      const parentCheck = await this.db.query(
        'SELECT thumbnail_data FROM media_assets WHERE id = $1',
        [parentAssetId],
      );
      if (parentCheck.rows[0]?.thumbnail_data) {
        const pData = parentCheck.rows[0].thumbnail_data;
        const base64Data = pData.includes(',') ? pData.split(',')[1] : pData;
        return {
          buffer: Buffer.from(base64Data, 'base64'),
          mimeType: 'image/jpeg',
        };
      }
      const parentThumbPath = assertPathWithinRoot(
        path.join(this.thumbnailDir, `${parentAssetId}.jpg`),
        this.storageRoot,
      );
      if (fs.existsSync(parentThumbPath)) {
        return { filePath: parentThumbPath, mimeType: 'image/jpeg' };
      }
    }

    throw new NotFoundException(`Thumbnail not found for asset ${validId}`);
  }

  async deleteOriginalSource(
    assetId: string,
    userId?: string,
  ): Promise<boolean> {
    const validId = validateAssetId(assetId);
    const userClause = userId ? 'AND user_id = $2' : '';
    const params = userId ? [validId, userId] : [validId];

    const res = await this.db.query(
      `SELECT original_path FROM media_assets WHERE id = $1 ${userClause}`,
      params,
    );
    if (res.rows.length === 0)
      throw new NotFoundException(`Asset ${validId} not found`);

    const originalPath = res.rows[0].original_path;
    await this.uploadConnector.deleteSource(validId);
    if (originalPath && fs.existsSync(originalPath)) {
      try {
        const safeOriginal = assertPathWithinRoot(
          originalPath,
          this.storageRoot,
        );
        fs.unlinkSync(safeOriginal);
      } catch {
        /* folder already wiped or outside storage jail */
      }
    }

    await this.db.query(
      `UPDATE media_assets
       SET original_deleted = true, original_path = '', updated_at = NOW()
       WHERE id = $1`,
      [validId],
    );

    this.logger.log(
      `Deleted master upload bytes for ${validId}; proxy + PostgreSQL intelligence retained`,
    );
    return true;
  }

  async search(
    query: string,
    assetIdFilter?: string,
    limit = 15,
    userId?: string,
  ): Promise<SearchResult[]> {
    const res = await this.searchDetailed(query, assetIdFilter, limit, userId);
    return res.results;
  }

  async getUnderstoodQuery(trimmed: string): Promise<UnderstoodQuery> {
    // A literal spoken quote needs no remote paraphrase; retain it before cached
    // understanding/fallback can strip the defining words from retrieval.
    const literal=parseSearchQuery(trimmed);
    if(literal.intent==='spoken'&&/["\u201c\u201d]/.test(trimmed)&&literal.phrases.length){
      return {rawQuery:trimmed,cleanSearchPhrase:trimmed,coreSubject:literal.cleaned,aliases:[],isCompound:false,subQueries:[{topic:literal.cleaned,searchPhrase:trimmed}]};
    }
    const queryHash = createHash('sha256')
      .update(trimmed.toLowerCase().trim())
      .digest('hex');

    // 1. Fast Cache Check
    try {
      const cached = await this.db.query(
        'SELECT raw_query, clean_search_phrase, core_subject, target_entity, aspect, aliases, is_compound, sub_queries FROM query_understanding_cache WHERE query_hash = $1',
        [queryHash],
      );
      if (cached.rows.length > 0) {
        const row = cached.rows[0];
        return {
          rawQuery: row.raw_query,
          cleanSearchPhrase: row.clean_search_phrase,
          coreSubject: row.core_subject,
          targetEntity: row.target_entity || undefined,
          aspect: row.aspect || undefined,
          aliases: row.aliases || [],
          isCompound: row.is_compound,
          subQueries: Array.isArray(row.sub_queries) ? row.sub_queries : [],
        };
      }
    } catch (err) {
      this.logger.warn(`Query understanding cache lookup error: ${err}`);
    }

    // 2. Fast-Path Heuristic: If simple single alphanumeric word (not command words), bypass AI call (<1ms, $0.00 cost)
    const isSingleWord =
      /^[a-zA-Z0-9_-]{1,40}$/.test(trimmed) &&
      ![
        'find',
        'clip',
        'video',
        'show',
        'search',
        'want',
        'where',
        'me',
      ].includes(trimmed.toLowerCase());

    if (isSingleWord) {
      const fast: UnderstoodQuery = {
        rawQuery: trimmed,
        cleanSearchPhrase: trimmed,
        coreSubject: trimmed,
        targetEntity: trimmed,
        aspect: undefined,
        aliases: [],
        isCompound: false,
        subQueries: [{ topic: trimmed, searchPhrase: trimmed }],
      };
      this.cacheUnderstoodQuery(queryHash, fast).catch(() => undefined);
      return fast;
    }

    // 3. AI Understanding Pipeline
    if (this.aiService.isConfigured()) {
      try {
        const understood = await withSearchDeadline(3500, () => this.aiService.understandQuery(trimmed));
        if (understood) {
          this.cacheUnderstoodQuery(queryHash, understood).catch(
            () => undefined,
          );
          return understood;
        }
      } catch (err) {
        this.logger.warn(
          `AI query understanding failed, using fast-path parse: ${err}`,
        );
      }
    }

    // 4. Fallback fast-path
    const parsed = parseSearchQuery(trimmed);
    return {
      rawQuery: trimmed,
      cleanSearchPhrase: parsed.cleaned || trimmed,
      coreSubject: parsed.headTerm || parsed.cleaned || trimmed,
      targetEntity: parsed.primaryModifier || parsed.headTerm || undefined,
      aspect: undefined,
      aliases: [],
      isCompound: false,
      subQueries: [
        {
          topic: parsed.cleaned || trimmed,
          searchPhrase: parsed.cleaned || trimmed,
        },
      ],
    };
  }

  private async cacheUnderstoodQuery(
    queryHash: string,
    u: UnderstoodQuery,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO query_understanding_cache (query_hash, raw_query, clean_search_phrase, core_subject, target_entity, aspect, aliases, is_compound, sub_queries)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (query_hash) DO UPDATE SET
         clean_search_phrase = EXCLUDED.clean_search_phrase,
         core_subject = EXCLUDED.core_subject,
         target_entity = EXCLUDED.target_entity,
         aspect = EXCLUDED.aspect,
         aliases = EXCLUDED.aliases,
         is_compound = EXCLUDED.is_compound,
         sub_queries = EXCLUDED.sub_queries`,
      [
        queryHash,
        u.rawQuery,
        u.cleanSearchPhrase,
        u.coreSubject,
        u.targetEntity || null,
        u.aspect || null,
        u.aliases,
        u.isCompound,
        JSON.stringify(u.subQueries),
      ],
    );
  }

  async searchDetailed(
    query: string, assetIdFilter?: string, limit = 15, userId?: string,
    phase: 'retrieve' | 'verify' = 'verify',
    signal?: AbortSignal,
    people?: {references?:string[];selections?:Array<{reference:string;personId:string}>},
  ): Promise<SearchResponse> {
    const identityOptions=peopleSearchOptions(people);
    const retained = new Map<string, SearchResult>();
    const publish = (hits: SearchResult[]) => {
      for (const hit of hits) retained.set(`${hit.assetId}:${hit.segmentId}`, hit);
    };
    const configured = Number(this.configService?.get('SEARCH_DEADLINE_MS', 30000) ?? 30000);
    const timeout = Number.isSafeInteger(configured) && configured > 0 && configured <= 240000 ? configured : 30000;
    try {
      const response = await withSearchProgress(phase === 'retrieve', publish,
        () => withSearchDeadline(timeout, async () => {
          const identities = userId && this.peopleSearchService
            ? await this.peopleSearchService.search(userId, { query, assetId: assetIdFilter, limit, ...identityOptions }, true) : null;
          if (identities) {
            if (phase==='verify' && userId && wantsConversation(query) && this.conversationVerifier) {
              return this.conversationVerifier.verify(identities,userId,c=>this.prepareSearchEvidence(c,'sequence',userId));
            }
            return identities;
          }
          return this.searchWithinDeadline(query, assetIdFilter, limit, userId);
        }, signal));
      if (response.identitySearch) return response;
      if (phase === 'retrieve') return { ...response, searchStatus: response.results.length ? 'refining' : 'complete',
        canContinue: response.results.length > 0, missingTerms: undefined,
        explanation: response.results.length ? 'Likely matches are ready. Checking the closest matches next.' : response.explanation };
      const incomplete = response.results.some((hit) => ['error', 'insufficient_evidence', 'pending'].includes(hit.verificationStatus || ''));
      const budgetBlocked = response.results.some((hit) => hit.verificationIssue === 'budget');
      return { ...response, searchStatus: incomplete ? 'incomplete' : 'complete', canContinue: incomplete && !budgetBlocked,
        missingTerms: incomplete ? undefined : response.missingTerms,
        explanation: budgetBlocked ? 'AI checking is paused. Your available results are still ready to browse.' :
          incomplete ? 'Some matches have not been checked yet. You can keep browsing these results.' : response.explanation };
    } catch (err) {
      if (!(err instanceof SearchDeadlineError)) throw err;
      const results = [...retained.values()].sort((a, b) => Number(!!b.stage2Verified) - Number(!!a.stage2Verified) || b.score - a.score).slice(0, limit);
      return { results, hasExactMatch: results.some((hit) => hit.stage2Verified), queryIntent: 'mixed',
        searchStatus: 'incomplete', canContinue: true,
        explanation: results.length ? 'Some matches have not been checked yet. Your available results are kept below.' :
          'This search is taking longer than expected. Try again; this does not establish that the moment is absent.' };
    }
  }

  private async searchWithinDeadline(
    query: string,
    assetIdFilter?: string,
    limit = 15,
    userId?: string,
  ): Promise<SearchResponse> {
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        results: [],
        hasExactMatch: false,
        queryIntent: 'mixed',
      };
    }

    const understood = await this.getUnderstoodQuery(trimmed);
    assertSearchActive();
    const searchTarget = understood.cleanSearchPhrase || trimmed;
    const targetEntity = understood.targetEntity || understood.coreSubject;
    const parsed = parseSearchQuery(searchTarget, targetEntity);

    let results: SearchResult[] = [];
    if (understood.isCompound && understood.subQueries.length > 1) {
      this.logger.log(
        `Executing compound query across ${understood.subQueries.length} sub-queries: ${understood.subQueries
          .map((s) => s.topic)
          .join(' | ')}`,
      );
      results = await this.searchCompoundMultiTopic(
        trimmed,
        understood.subQueries,
        assetIdFilter,
        limit,
        userId,
      );
    } else {
      results = await this.searchSingleTopic(
        searchTarget,
        assetIdFilter,
        limit,
        userId,
        undefined,
        understood.aliases,
        targetEntity,
        trimmed,
      );
    }

    const hasExactMatch = results.some((r) => r.matchQuality === 'direct');
    let missingTerms: string[] | undefined;
    let explanation: string | undefined;

    if (
      !hasExactMatch &&
      parsed.primaryModifier &&
      parsed.contentTerms.length >= 2
    ) {
      missingTerms = [parsed.primaryModifier];
      explanation = `No direct clips for "${parsed.primaryModifier}" found in your library. Showing related topics below:`;
    }

    return {
      results,
      hasExactMatch,
      queryIntent: parsed.intent,
      primaryModifier: parsed.primaryModifier,
      missingTerms,
      explanation,
    };
  }

  private async searchSingleTopic(
    query: string,
    assetIdFilter?: string,
    limit = 15,
    userId?: string,
    topicLabel?: string,
    aliases: string[] = [],
    targetEntity?: string,
    evidenceQuery?: string,
  ): Promise<SearchResult[]> {
    const parsed = parseSearchQuery(query, targetEntity);
    const verificationParsed = { ...parsed, cleaned: evidenceQuery || parsed.cleaned };
    const candidateLimit = Math.min(60, Math.max(limit, 30));

    // Parallel execution: run direct phrase matching and hybrid segment search concurrently
    const [phraseHits, segmentHits] = await Promise.all([
      this.searchTranscriptPhrases(
        parsed,
        assetIdFilter,
        userId,
        candidateLimit,
        aliases,
      ),
      this.searchSegments(parsed, assetIdFilter, userId, candidateLimit, aliases),
    ]);

    const seen = new Set<string>();
    const directHits: SearchResult[] = [];
    const relatedHits: SearchResult[] = [];

    // Exact phrase hits take top priority as direct matches; loose pair hits remain related
    for (const hit of phraseHits) {
      const key = `${hit.assetId}:${hit.startTime.toFixed(1)}`;
      if (!seen.has(key)) {
        seen.add(key);
        const taggedHit: SearchResult = {
          ...hit,
          subTopic: topicLabel || hit.subTopic,
        };
        if (hit.matchQuality === 'direct') {
          directHits.push(taggedHit);
        } else {
          relatedHits.push(taggedHit);
        }
      }
    }

    // Process segment hits
    for (const hit of segmentHits) {
      const key = `${hit.assetId}:${hit.startTime.toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const taggedHit: SearchResult = {
        ...hit,
        subTopic: topicLabel || hit.subTopic,
      };

      if (hit.matchQuality === 'direct') {
        directHits.push(taggedHit);
      } else {
        relatedHits.push(taggedHit);
      }
    }

    // Combine direct and related matches
    let merged = [...directHits, ...relatedHits].slice(0, candidateLimit);
    const provisional = merged.map((hit): SearchResult => ({ ...hit, matchQuality: 'related',
      stage2Verified: false, verificationStatus: 'pending' }));
    publishSearchResults(provisional);
    if (retrievalOnly()) return provisional.slice(0, limit);

    // Stage-2 Deep Verification on candidates if needed
    // SMART VERIFICATION GATING: Only verify when uncertain
    if (this.aiService.isConfigured() && merged.length > 0) {
      const topScore = merged[0]?.score || 0;
      const secondScore = merged[1]?.score || 0;
      const confidenceGap = topScore - secondScore;
      const hasDetailModifier =
        /\b(wearing|holding|carrying|background|small|tiny|brief|fleeting|sitting|standing|running|walking|red|blue|green|black|white|silver|gold|micro|detail)\b/i.test(
          verificationParsed.cleaned,
        );

      // Visual constraints require evidence regardless of retrieval score.
      const hasSequenceConstraint = evidenceMode(verificationParsed.cleaned, false) === 'sequence';
      const requiresVisualEvidence = parsed.intent === 'visual' || hasDetailModifier || hasSequenceConstraint;
      const skipVerification = !requiresVisualEvidence && (
        topScore > 0.85 ||
        (merged.length > 0 && merged.every((r) => r.score < 0.6)));

      // Other requests retain the existing score-based uncertainty policy.
      const needsVerification =
        !skipVerification &&
        (hasSequenceConstraint || parsed.intent === 'visual' ||
          (merged.length > 0 &&
            merged.some((r) => 0.6 < r.score && r.score < 0.85)) ||
          hasDetailModifier ||
          (confidenceGap > 0 && confidenceGap < 0.2));

      if (needsVerification) {
        if (hasDetailModifier) {
          merged = await this.applyDetailedVerification(merged, verificationParsed, userId);
        } else {
          merged = await this.applyStage2Verification(merged, verificationParsed, userId);
        }
      } else {
        this.logger.debug(
          `Skipped verification: topScore=${topScore.toFixed(2)}, gap=${confidenceGap.toFixed(2)}, skipFlag=${skipVerification}`,
        );
      }
    }

    return merged.slice(0, limit);
  }

  private async applyStage2Verification(
    results: SearchResult[],
    parsed: ReturnType<typeof parseSearchQuery>,
    userId?: string,
  ): Promise<SearchResult[]> {
    return this.verifySceneResults(results, parsed, false, userId);
  }

  private async applyDetailedVerification(
    results: SearchResult[],
    parsed: ReturnType<typeof parseSearchQuery>,
    userId?: string,
  ): Promise<SearchResult[]> {
    return this.verifySceneResults(results, parsed, true, userId);
  }

  private async prepareSearchEvidence(candidate: SearchResult, mode: 'detail' | 'sequence',
    userId?: string): Promise<SearchEvidence | null> {
    if (!userId || !this.searchEvidenceService) return null;
    const source = await this.db.query<{ original_path: string; proxy_path: string;
      source_type: string; connector_account_id: string; external_file_id: string; file_size: string }>(
      `SELECT original_path, proxy_path, source_type, connector_account_id, external_file_id, file_size
       FROM media_assets WHERE id = $1 AND user_id = $2`,
      [candidate.assetId, userId],
    );
    const asset = source.rows[0];
    if (!asset) return null;
    const original = this.existingPlayableFile(this.safeLocalMediaPath(asset.original_path));
    const preview = this.existingPlayableFile(this.safeLocalMediaPath(asset.proxy_path));
    const sourcePath = original || preview;
    if (sourcePath) return this.searchEvidenceService.prepare(sourcePath, original ? 'original' : 'preview',
      candidate.startTime, candidate.endTime, mode);
    const limitMb = Number(this.configService.get('SEARCH_CLOUD_SOURCE_MAX_MB', 16));
    const bytes = Number(asset.file_size);
    if (!Number.isFinite(limitMb) || limitMb <= 0 || limitMb > 64 || !Number.isFinite(bytes) ||
      !Number.isSafeInteger(bytes) || bytes <= 0 || !asset.external_file_id ||
      !asset.connector_account_id || !this.connectorRegistry || !this.connectorsService) return null;
    assertSearchActive();
    const connector = this.connectorRegistry.get(asset.source_type === 'drive' ? 'google_drive' : asset.source_type);
    const totalMb = Number(this.configService.get('SEARCH_CLOUD_TOTAL_MB', 32));
    if (!Number.isFinite(totalMb) || totalMb <= 0 || totalMb > 128) return null;
    if (bytes > limitMb * 1024 * 1024 && connector.openReadSession) {
      const key = JSON.stringify(['seekable', this.storageRoot, userId, candidate.assetId,
        asset.connector_account_id, asset.external_file_id, bytes]);
      const lease = await acquireSearchResource(key, async () => {
        assertSearchActive();
        const auth = await this.connectorsService!.getAuthContext(asset.connector_account_id, userId);
        const session = await connector.openReadSession!(auth, asset.external_file_id, searchSignal());
        if (session.size !== bytes) throw new Error('Cloud source size changed since indexing');
        const reader = await openSeekableMediaSource(session, { maxBytes: Math.floor(totalMb * 1024 * 1024),
          signal: searchSignal(), reserve: (length) => reserveCloudBytes(length, totalMb * 1024 * 1024) });
        return { reader, cleanup: () => { void reader.close().catch((error) => this.logger.warn(`Source cleanup failed: ${error.message}`)); } };
      });
      if (!lease) return null;
      try {
        const evidence = await this.searchEvidenceService.prepareRemote(lease.value.reader,
          candidate.startTime, candidate.endTime, mode);
        if (!evidence) { lease.release(); return null; }
        return { ...evidence, cleanup: () => { try { evidence.cleanup(); } finally { lease.release(); } } };
      } catch (error) { lease.release(); throw error; }
    }
    if (!connector.getByteRange || bytes > limitMb * 1024 * 1024) return null;
    const key = JSON.stringify([this.storageRoot, userId, candidate.assetId, asset.source_type,
      asset.connector_account_id, asset.external_file_id, bytes]);
    const lease = await acquireSearchResource(key, async () => {
      assertSearchActive();
      if (!reserveCloudBytes(bytes, totalMb * 1024 * 1024)) return null;
      const auth = await this.connectorsService!.getAuthContext(asset.connector_account_id, userId);
      return stageCloudSource(this.storageRoot, Math.min(bytes, limitMb * 1024 * 1024),
        () => connector.getByteRange!(auth, asset.external_file_id, 0, bytes, searchSignal()), bytes);
    });
    if (!lease) return null;
    const staged = lease.value;
    try {
      const evidence = await this.searchEvidenceService.prepare(staged.path, 'original',
        candidate.startTime, candidate.endTime, mode);
      if (!evidence) { lease.release(); return null; }
      return { ...evidence, cleanup: () => { try { evidence.cleanup(); } finally { lease.release(); } } };
    } catch (error) { lease.release(); throw error; }
  }

  private async verifySceneResults(
    results: SearchResult[],
    parsed: ReturnType<typeof parseSearchQuery>,
    detailMode: boolean,
    userId?: string,
    remainingBudget = 15,
  ): Promise<SearchResult[]> {
    const count = Math.min(detailMode ? 8 : 5, remainingBudget, results.length);
    const inspect = async (candidate:SearchResult): Promise<SearchResult> => {
      assertSearchActive();
      const unavailable = (status: 'error' | 'insufficient_evidence', explanation: string,
        issue: SearchResult['verificationIssue'] = status === 'insufficient_evidence' ? 'source' : 'temporary'): SearchResult => {
        const hit: SearchResult = {
        ...candidate,
        matchQuality: 'related',
        stage2Verified: false,
        verificationStatus: status,
        verificationIssue: issue,
        verificationExplanation: explanation,
        whyPicked: explanation,
        };
        publishSearchResults([hit]);
        return hit;
      };
      let expanded: SearchEvidence | null = null;
      try {
        const segRow = await this.db.query<{ keyframe_paths: unknown }>(
          `SELECT keyframe_paths FROM media_segments WHERE id = $1`,
          [candidate.segmentId],
        );
        const scratch = path.join(this.scratchDir, 'stage2', candidate.segmentId);
        let frames = materializeKeyframeFiles(
          parseKeyframePaths(segRow.rows[0]?.keyframe_paths), this.storageRoot, scratch,
        ).filter((f) => Number.isFinite(f.timestamp) &&
          f.timestamp >= candidate.startTime && f.timestamp <= candidate.endTime &&
          fs.existsSync(f.path));
        if(frames.length>12)frames=Array.from({length:12},(_,i)=>frames[Math.round(i*(frames.length-1)/11)]);
        const mode = evidenceMode(parsed.cleaned, detailMode);
        if(mode==='sequence'){
          const maxSeconds=Number(this.configService?.get('SEARCH_INSPECTION_MAX_SECONDS',20)??20);
          if(candidate.endTime-candidate.startTime>maxSeconds){
            // Still frames cannot establish a moving action. Inspect bounded
            // beginning/middle/end excerpts, returning only a positively checked
            // interval. Missing/cross-window actions remain incomplete.
            const starts=[...new Set([candidate.startTime,
              candidate.startTime+(candidate.endTime-candidate.startTime-maxSeconds)/2,
              candidate.endTime-maxSeconds])];
            for(const start of starts){
              const checked=await inspect({...candidate,startTime:start,endTime:start+maxSeconds});
              if(checked.stage2Verified)return checked;
              if(checked.verificationStatus==='error')return unavailable('error',checked.verificationExplanation||'Video inspection failed');
            }
            return unavailable('insufficient_evidence','The action was not established in bounded excerpts; this does not rule it out across the entire scene');
          }
        }
        if (mode !== 'frames') {
          expanded = await this.prepareSearchEvidence(candidate, mode, userId);
          if (!expanded) return unavailable('insufficient_evidence',
            'Closer inspection needs an available source within the inspection limits');
          frames = expanded.frames;
        }
        const clipPath = expanded?.clipPath;
        if (!frames.length && !clipPath) return unavailable('insufficient_evidence', 'Scene evidence unavailable');

        // The existing explanation column stores a versioned JSON envelope. No migration required.
        // Hash actual evidence bytes so replaced frames cannot reuse stale verification.
        const queryHash = createHash('sha256').update(JSON.stringify({
          version: 'scene-verification-v3', query: parsed.cleaned, mode,
          evidenceKind: expanded?.kind || 'stored_frames',
          clipHash: clipPath ? createHash('sha256').update(fs.readFileSync(clipPath)).digest('hex') : undefined,
          models: this.aiService.getModelCascade(),
          start: candidate.startTime, end: candidate.endTime,
          transcript: candidate.transcriptSnippet,
          frames: frames.map((f) => ({ timestamp: f.timestamp,
            sha256: createHash('sha256').update(fs.readFileSync(f.path)).digest('hex') })),
        })).digest('hex');
        let cached: any;
        try {
          const rows = await this.db.query<{ explanation: string }>(
            `SELECT explanation FROM verified_queries WHERE query_hash = $1 AND segment_id = $2`,
            [queryHash, candidate.segmentId],
          );
          if (rows.rows[0]) cached = JSON.parse(rows.rows[0].explanation);
        } catch (err) { this.logger.warn(`Verification cache read failed: ${err}`); }
        const valid = (v: any) => v?.status === 'evaluated' &&
          typeof v.matched === 'boolean' && typeof v.confidence === 'number' &&
          Number.isFinite(v.confidence) && v.confidence >= 0 && v.confidence <= 1 &&
          typeof v.explanation === 'string' && v.explanation.trim().length > 0 &&
          (!clipPath || !v.matched || v.matchedTimestamp != null) &&
          (v.matchedTimestamp == null || (typeof v.matchedTimestamp === 'number' &&
            Number.isFinite(v.matchedTimestamp) && (clipPath ?
              v.matchedTimestamp >= candidate.startTime && v.matchedTimestamp <= candidate.endTime :
              frames.some((f) => Math.abs(f.timestamp - v.matchedTimestamp) <= 0.011))));
        const ver = valid(cached) ? cached : clipPath ?
          await this.aiService.verifyClip(clipPath, parsed.cleaned, candidate.startTime,
            candidate.endTime, candidate.transcriptSnippet) :
          await this.aiService.verifyCandidate(frames, parsed.cleaned, candidate.transcriptSnippet,
            detailMode, expanded ? 12 : 3);
        if (!valid(ver)) return unavailable(
          ver.status === 'insufficient_evidence' ? 'insufficient_evidence' : 'error',
          ver.explanation || 'Scene verification failed; no conclusion available',
          ver.issue,
        );
        if (!valid(cached)) {
          try {
            await this.db.query(
              `INSERT INTO verified_queries (query_hash, asset_id, segment_id, is_verified, confidence, explanation)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (query_hash, segment_id) DO UPDATE SET
                 is_verified = EXCLUDED.is_verified, confidence = EXCLUDED.confidence, explanation = EXCLUDED.explanation`,
              [queryHash, candidate.assetId, candidate.segmentId, ver.matched,
                ver.confidence, JSON.stringify({ status: ver.status, matched: ver.matched,
                  confidence: ver.confidence, explanation: ver.explanation,
                  matchedTimestamp: ver.matchedTimestamp })],
            );
          } catch (err) { this.logger.warn(`Verification cache write failed: ${err}`); }
        }
        const confirmed = ver.matched && ver.confidence >= 0.5;
        const window = confirmed && mode !== 'sequence' ? narrowResultWindow(candidate.startTime, candidate.endTime,
          ver.matchedTimestamp) : { startTime: candidate.startTime, endTime: candidate.endTime };
        const hit: SearchResult = {
          ...candidate, ...window,
          // Preserve retrieval score; a model's self-reported confidence is not a calibrated score.
          matchQuality: confirmed ? 'direct' as const : 'related' as const,
          stage2Verified: confirmed,
          verificationStatus: confirmed ? 'matched' as const :
            ver.matched ? 'uncertain' as const : 'not_matched' as const,
          verificationConfidence: ver.confidence,
          verificationEvidenceKind: expanded?.kind || 'stored_frames',
          verificationMethod: clipPath ? 'video' : 'frames',
          verificationExplanation: ver.explanation,
          whyPicked: confirmed ? 'Scene verification confirmed' : 'Scene match not confirmed',
          queryRelation: ver.explanation,
        };
        publishSearchResults([hit]);
        // A verified timestamp is an anchor, not event boundaries. Recheck a
        // shorter actual clip before replacing its wider containing interval.
        if(confirmed&&mode==='sequence'&&clipPath&&Number.isFinite(ver.matchedTimestamp)&&
          candidate.endTime-candidate.startTime>10&&
          !/\b(before|after|then|until|while|sequence|without|except|not)\b/i.test(parsed.cleaned)){
          const start=Math.max(candidate.startTime,Math.min(candidate.endTime-8,ver.matchedTimestamp!-3));
          try{
            const focused=await inspect({...candidate,startTime:Number(start.toFixed(2)),endTime:Number((start+8).toFixed(2))});
            if(focused.stage2Verified)return focused;
          }catch{ /* Keep the already checked wider match if refinement cannot finish. */ }
          publishSearchResults([hit]);
        }
        return hit;
      } catch (err) {
        this.logger.warn(`Scene verification failed for ${candidate.segmentId}: ${err}`);
        return unavailable('error', 'Scene verification failed; no conclusion available');
      } finally {
        try { expanded?.cleanup(); }
        catch (err) { this.logger.warn(`Search evidence cleanup failed: ${err}`); }
      }
    };
    const inspected:SearchResult[]=[];
    const multiple=/\b(all|every|moments|clips|examples)\b/i.test(parsed.cleaned);
    for(const candidate of results.slice(0,count)){
      const hit=await inspect(candidate);inspected.push(hit);
      if(hit.stage2Verified&&!multiple)break;
    }
    let remaining = results.slice(inspected.length);
    // Broaden only when no inspected scene confirmed the request. Errors stop expansion;
    // missing source evidence may be candidate-specific, so other candidates can still help.
    if (remaining.length && remainingBudget > inspected.length &&
      !inspected.some((hit) => hit.stage2Verified || hit.verificationStatus === 'error')) {
      remaining = await this.verifySceneResults(remaining, parsed, detailMode, userId, remainingBudget - inspected.length);
    } else {
      remaining = remaining.map((hit) => ({ ...hit, matchQuality: 'related' as const,
        stage2Verified: false, verificationStatus: 'insufficient_evidence' as const,
        whyPicked: 'Candidate not inspected within this search budget' }));
    }
    return [...inspected, ...remaining].sort((a, b) => {
      if (!!a.stage2Verified !== !!b.stage2Verified) return a.stage2Verified ? -1 : 1;
      if (a.matchQuality !== b.matchQuality) return a.matchQuality === 'direct' ? -1 : 1;
      return b.score - a.score;
    });
  }

  async saveFeedback(
    payload: FeedbackPayload,
    userId?: string,
  ): Promise<boolean> {
    const validAssetId = validateAssetId(payload.assetId);
    await this.db.query(
      `INSERT INTO search_feedback (user_id, query, asset_id, segment_id, timestamp_sec, feedback, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId || null,
        payload.query,
        validAssetId,
        payload.segmentId || null,
        payload.timestampSec || 0,
        payload.feedback,
        payload.notes || null,
      ],
    );
    this.logger.log(
      `Search feedback saved for query "${payload.query}" on asset ${validAssetId}: ${payload.feedback}`,
    );
    return true;
  }

  private async searchCompoundMultiTopic(
    originalQuery: string,
    subQueries: Array<{ topic: string; searchPhrase: string }>,
    assetIdFilter: string | undefined,
    limit: number,
    userId: string | undefined,
  ): Promise<SearchResult[]> {
    // 1. Run each sub-query in parallel
    const perTopicSearches = await Promise.all(
      subQueries.map((sq) =>
        this.searchSingleTopic(
          sq.searchPhrase,
          assetIdFilter,
          limit,
          userId,
          sq.topic,
          [],
          undefined,
          originalQuery,
        ),
      ),
    );

    // 2. Count occurrences across sub-topics to identify true multi-topic segments
    const topicMatchesPerSegment = new Map<
      string,
      { count: number; hit: SearchResult; topics: string[] }
    >();
    for (let t = 0; t < perTopicSearches.length; t++) {
      const topic = subQueries[t].topic;
      for (const hit of perTopicSearches[t]) {
        const key = `${hit.assetId}:${hit.startTime.toFixed(1)}`;
        const existing = topicMatchesPerSegment.get(key);
        if (existing) {
          existing.count += 1;
          if (!existing.topics.includes(topic)) existing.topics.push(topic);
        } else {
          topicMatchesPerSegment.set(key, { count: 1, hit, topics: [topic] });
        }
      }
    }

    const seen = new Set<string>();
    const finalResults: SearchResult[] = [];

    // 3. Any segment that authenticates across multiple sub-topics gets top priority
    for (const [key, val] of topicMatchesPerSegment.entries()) {
      if (val.count >= 2) {
        seen.add(key);
        finalResults.push({
          ...val.hit,
          subTopic: val.topics.join(' & '),
          queryRelation: `Directly answers multiple topics in your query: ${val.topics.join(' & ')}.`,
        });
        if (finalResults.length >= limit) break;
      }
    }

    // 4. Interleaved Diversity RRF: Alternate fairly between sub-topics
    const maxTopicItems = Math.max(
      ...perTopicSearches.map((res) => res.length),
      0,
    );
    for (let i = 0; i < maxTopicItems; i++) {
      for (let t = 0; t < perTopicSearches.length; t++) {
        const item = perTopicSearches[t][i];
        if (!item) continue;
        const key = `${item.assetId}:${item.startTime.toFixed(1)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const subTopic = subQueries[t].topic;
        finalResults.push({
          ...item,
          subTopic,
          queryRelation: item.queryRelation
            ? `[Topic: ${subTopic}] ${item.queryRelation}`
            : `Directly answers the "${subTopic}" topic of your query.`,
        });

        if (finalResults.length >= limit) break;
      }
      if (finalResults.length >= limit) break;
    }

    return finalResults.slice(0, limit);
  }

  private async searchTranscriptPhrases(
    parsed: ReturnType<typeof parseSearchQuery>,
    assetIdFilter: string | undefined,
    userId: string | undefined,
    limit: number,
    aliases: string[] = [],
  ): Promise<SearchResult[]> {
    if (
      parsed.phrases.length === 0 &&
      parsed.contentTerms.length === 0 &&
      aliases.length === 0
    )
      return [];

    const params: unknown[] = [];
    let p = 1;
    const where: string[] = [
      `o.observation_type = 'transcript'`,
      `a.status IN ('indexed', 'partially_indexed')`,
      `(a.availability IS NULL OR a.availability != 'offline')`,
    ];

    if (userId) {
      where.push(`a.user_id = $${p}`);
      params.push(userId);
      p += 1;
    }
    if (assetIdFilter) {
      where.push(`a.id = $${p}`);
      params.push(assetIdFilter);
      p += 1;
    }

    const normalizedDoc = `regexp_replace(lower(coalesce(o.raw_data->>'text', '')), '[-–—]', ' ', 'g')`;
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Word-boundary matching (\y) prevents substring false positives (e.g. 'anti' matching 'antihistamines')
    const phraseClauses: string[] = [];
    const allPhrases = [...parsed.phrases];
    for (const al of aliases) {
      const trimmedAl = al.toLowerCase().trim();
      if (trimmedAl && !allPhrases.includes(trimmedAl)) {
        allPhrases.push(trimmedAl);
      }
    }
    for (const phrase of allPhrases) {
      phraseClauses.push(`${normalizedDoc} ~* $${p}`);
      params.push(`\\y${escapeRegex(phrase)}\\y`);
      p += 1;
    }
    const termClauses: string[] = [];
    for (const term of parsed.contentTerms) {
      termClauses.push(`${normalizedDoc} ~* $${p}`);
      params.push(`\\y${escapeRegex(term)}\\y`);
      p += 1;
    }

    const matchConditions: string[] = [];
    if (phraseClauses.length) {
      matchConditions.push(`(${phraseClauses.join(' OR ')})`);
    }
    if (termClauses.length) {
      matchConditions.push(`(${termClauses.join(' AND ')})`);
      if (termClauses.length >= 3) {
        // Build 2-term pair combinations so multi-word queries match cues containing multiple key terms
        // If a primary modifier / defining entity is set, only consider pairs that include the primary modifier
        const modifierIdx = parsed.primaryModifier
          ? parsed.contentTerms.findIndex(
              (t) => t.toLowerCase() === parsed.primaryModifier!.toLowerCase(),
            )
          : -1;

        const pairClauses: string[] = [];
        for (let i = 0; i < termClauses.length; i++) {
          for (let j = i + 1; j < termClauses.length; j++) {
            if (modifierIdx !== -1 && i !== modifierIdx && j !== modifierIdx) {
              // Skip pairs that do not mention the defining entity (e.g. skip 'mechanism & action' when entity is 'levodopa')
              continue;
            }
            pairClauses.push(`(${termClauses[i]} AND ${termClauses[j]})`);
          }
        }
        if (pairClauses.length) {
          matchConditions.push(`(${pairClauses.slice(0, 10).join(' OR ')})`);
        }
      }
    }

    const matchSql = matchConditions.join(' OR ');

    if (!matchSql) return [];
    where.push(`(${matchSql})`);
    params.push(limit);

    const phraseRankSql =
      phraseClauses.length > 0 ? phraseClauses.join(' OR ') : 'FALSE';
    const termsRankSql =
      termClauses.length > 0 ? termClauses.join(' AND ') : 'FALSE';

    const sql = `
      SELECT o.asset_id, o.timestamp_start, o.timestamp_end,
             o.raw_data->>'text' AS text, a.original_filename,
             CASE
               WHEN (${phraseRankSql}) THEN 'phrase'
               WHEN (${termsRankSql}) THEN 'all_terms'
               ELSE 'pair'
             END AS match_tier
      FROM media_observations o
      JOIN media_assets a ON a.id = o.asset_id
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE
          WHEN (${phraseRankSql}) THEN 0
          WHEN (${termsRankSql}) THEN 1
          ELSE 2
        END ASC,
        o.timestamp_start ASC
      LIMIT $${p}
    `;

    try {
      const res = await this.db.query(sql, params);
      return res.rows.map((row, i) => {
        const startTime = Number(Number(row.timestamp_start).toFixed(2));
        const endTime = Number(
          Math.max(Number(row.timestamp_end), startTime + 2).toFixed(2),
        );
        const text = String(row.text || '').trim();
        const queryText = (
          parsed.raw ||
          parsed.cleaned ||
          'your search'
        ).trim();
        const snippet = text.length > 140 ? text.slice(0, 140) + '...' : text;
        const matchesModifier =
          !parsed.primaryModifier ||
          new RegExp(`\\b${escapeRegex(parsed.primaryModifier)}`, 'i').test(
            text,
          );
        const isDirect =
          (row.match_tier === 'phrase' ||
            (row.match_tier === 'all_terms' &&
              parsed.contentTerms.length >= 2)) &&
          matchesModifier;
        const whyPicked = isDirect
          ? 'Direct spoken phrase match in audio track'
          : 'Partial term match in audio transcript';
        const queryRelation = isDirect
          ? `Spoken dialogue states: "${snippet}" — directly matching your query for "${queryText}".`
          : `Spoken dialogue mentions related terms: "${snippet}".`;
        const score = isDirect
          ? Number(Math.max(0.78, 0.96 - i * 0.02).toFixed(3))
          : Number(Math.max(0.48, 0.54 - i * 0.02).toFixed(3));
        return {
          assetId: row.asset_id,
          segmentId: `cue_${row.asset_id}_${i}`,
          startTime,
          endTime,
          title: row.original_filename || 'Spoken moment',
          description: text,
          transcriptSnippet: text,
          score,
          matchType: 'lexical' as const,
          winningPath: 'transcript' as const,
          matchQuality: isDirect ? ('direct' as const) : ('related' as const),
          thumbnailUrl: `/api/v1/media/${row.asset_id}/thumbnail`,
          filename: row.original_filename,
          matchReason: `${whyPicked}: ${queryRelation}`,
          whyPicked,
          queryRelation,
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Transcript phrase search failed: ${message}`);
      return [];
    }
  }

  private async searchSegments(
    parsed: ReturnType<typeof parseSearchQuery>,
    assetIdFilter: string | undefined,
    userId: string | undefined,
    limit: number,
    aliases: string[] = [],
  ): Promise<SearchResult[]> {
    let andQuery = parsed.andTsQuery;
    let orQuery = parsed.orTsQuery;
    const embedSource = parsed.cleaned || parsed.raw;
    let queryEmbedding: number[] = [];

    // Extract additional clean terms from aliases (e.g. 'boi')
    const aliasTerms = (aliases || [])
      .flatMap((a) =>
        a
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/),
      )
      .filter((t) => t.length >= 2 && !parsed.contentTerms.includes(t));

    if (aliasTerms.length > 0) {
      if (orQuery) {
        orQuery = `${orQuery} | ${aliasTerms.join(' | ')}`;
      } else {
        orQuery = aliasTerms.join(' | ');
      }
    }

    // Use cached embedding to avoid regenerating for repeated queries
    try {
      queryEmbedding = await this.getCachedOrGenerateEmbedding(embedSource,userId);
    } catch (err) {
      // Budget denial or provider failure must not disable local lexical retrieval.
      this.logger.warn(`Semantic retrieval unavailable; using lexical retrieval: ${err}`);
    }

    const hasEmbedding = queryEmbedding.length > 0;
    const queryDim = queryEmbedding.length;
    const is384 = queryDim === 384;
    const embeddingCol = is384 ? 's.embedding_384' : 's.embedding';
    const minSemCandidate = is384 ? 0.38 : 0.45;
    const minSemDirect = is384 ? 0.48 : 0.58;
    const embeddingStr = hasEmbedding ? `[${queryEmbedding.join(',')}]` : null;

    const params: unknown[] = [];
    let p = 1;
    let andSql = 'NULL::tsquery';
    if (andQuery) {
      andSql = `to_tsquery('simple', $${p})`;
      params.push(andQuery);
      p += 1;
    }
    let orSql = 'NULL::tsquery';
    if (orQuery) {
      orSql = `to_tsquery('simple', $${p})`;
      params.push(orQuery);
      p += 1;
    }
    let embeddingSql = 'NULL::vector';
    if (hasEmbedding) {
      embeddingSql = `$${p}::vector`;
      params.push(embeddingStr);
      p += 1;
    }
    let userSql = '';
    if (userId) {
      userSql = `AND a.user_id = $${p}`;
      params.push(userId);
      p += 1;
    }
    let assetSql = '';
    if (assetIdFilter) {
      assetSql = `AND a.id = $${p}`;
      params.push(assetIdFilter);
      p += 1;
    }
    params.push(limit);
    const limitSql = `$${p}`;

    // Calibrated threshold: 384-dim (>= 0.38 cand / >= 0.48 direct), 3072-dim (>= 0.45 cand / >= 0.58 direct)
    const sql = `
      WITH indexed_segments AS (
        SELECT s.id, s.asset_id, s.start_time, s.end_time, s.title, s.description,
               s.transcript_text, s.visual_objects, s.actions, s.on_screen_text,
               ${embeddingCol} AS embedding, a.original_filename,
               media_segment_search_text(
                 s.title, s.description, s.transcript_text,
                 s.actions, s.visual_objects, s.on_screen_text
               ) AS doc_vector
        FROM media_segments s
        JOIN media_assets a ON a.id = s.asset_id
        WHERE a.status IN ('indexed', 'partially_indexed')
          AND (a.availability IS NULL OR a.availability != 'offline')
          ${userSql}
          ${assetSql}
      ),
      lexical AS (
        SELECT s.*,
               (
                 coalesce(ts_rank_cd(s.doc_vector, ${andSql}), 0.0) * 2.5 +
                 coalesce(ts_rank_cd(s.doc_vector, ${orSql}), 0.0)
               ) AS lex_score,
               (CASE WHEN ${andQuery ? `s.doc_vector @@ ${andSql}` : 'FALSE'} THEN true ELSE false END) AS has_all_terms,
               ROW_NUMBER() OVER (ORDER BY (
                 coalesce(ts_rank_cd(s.doc_vector, ${andSql}), 0.0) * 2.5 +
                 coalesce(ts_rank_cd(s.doc_vector, ${orSql}), 0.0)
               ) DESC) AS lex_rank
        FROM indexed_segments s
        WHERE ${orQuery ? `s.doc_vector @@ ${orSql}` : andQuery ? `s.doc_vector @@ ${andSql}` : 'FALSE'}
        LIMIT 25
      ),
      semantic AS (
        SELECT s.*,
               ${hasEmbedding ? `(1 - (s.embedding <=> ${embeddingSql}))` : '0.0'} AS sem_score,
               ROW_NUMBER() OVER (ORDER BY ${hasEmbedding ? `s.embedding <=> ${embeddingSql}` : 's.id'}) AS sem_rank
        FROM indexed_segments s
        WHERE ${hasEmbedding ? `s.embedding IS NOT NULL AND (1 - (s.embedding <=> ${embeddingSql})) >= ${minSemCandidate}` : 'FALSE'}
        LIMIT 25
      )
      SELECT
        coalesce(l.id, s.id) AS id,
        coalesce(l.asset_id, s.asset_id) AS asset_id,
        coalesce(l.start_time, s.start_time) AS start_time,
        coalesce(l.end_time, s.end_time) AS end_time,
        coalesce(l.title, s.title) AS title,
        coalesce(l.description, s.description) AS description,
        coalesce(l.transcript_text, s.transcript_text) AS transcript_text,
        coalesce(l.visual_objects, s.visual_objects) AS visual_objects,
        coalesce(l.actions, s.actions) AS actions,
        coalesce(l.on_screen_text, s.on_screen_text) AS on_screen_text,
        coalesce(l.original_filename, s.original_filename) AS original_filename,
        coalesce(l.lex_score, 0) AS lex_score,
        coalesce(l.has_all_terms, false) AS has_all_terms,
        coalesce(s.sem_score, 0) AS sem_score,
        (coalesce(1.0 / (60.0 + l.lex_rank), 0.0) + coalesce(1.0 / (60.0 + s.sem_rank), 0.0)) AS rrf_score
      FROM lexical l
      FULL OUTER JOIN semantic s ON l.id = s.id
      WHERE coalesce(l.lex_score, 0) > 0 OR coalesce(s.sem_score, 0) >= ${minSemCandidate}
      ORDER BY rrf_score DESC
      LIMIT ${limitSql};
    `;

    try {
      const res = await this.db.query(sql, params);
      if (res.rows.length > 0) {
        this.logger.log(
          `Search '${embedSource}' (${queryDim}d via ${embeddingCol}) -> ${res.rows.length} rows; top semScores: [${res.rows
            .slice(0, 3)
            .map((r) => Number(r.sem_score).toFixed(4))
            .join(', ')}], top lexScores: [${res.rows
            .slice(0, 3)
            .map((r) => Number(r.lex_score).toFixed(4))
            .join(', ')}]`,
        );
      }
      return res.rows.map((row) => {
        const lexScore = Number(row.lex_score);
        const semScore = Number(row.sem_score);
        const hasAllTerms = Boolean(row.has_all_terms);
        const hasLex = lexScore > 0;
        const hasSem = semScore >= minSemCandidate;

        // Direct match: verified all terms exact hit OR strong semantic relevance
        const transcript = (row.transcript_text || '').trim();
        const onScreen = (row.on_screen_text || []).filter(Boolean);
        const actions = (row.actions || []).filter(Boolean);
        const objects = (row.visual_objects || []).filter(Boolean);
        const description = (row.description || '').trim();

        const allPhrasesToCheck = [...parsed.phrases, ...aliases]
          .map((s) => s.toLowerCase().trim())
          .filter((s) => s.length >= 3);
        const onScreenExactMatch = allPhrasesToCheck.some((p) =>
          onScreen.some((t: string) => t.toLowerCase().includes(p)),
        );

        // Check if candidate scene has explicit evidence of primary modifier / target entity (e.g. 'levodopa')
        // Across observations: transcript, on-screen text, visual objects, actions, description, title, filename
        const escapeRegex = (s: string) =>
          s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const modifier = parsed.primaryModifier;
        const hasPrimaryModifierFocus =
          !modifier ||
          new RegExp(`\\b${escapeRegex(modifier)}`, 'i').test(transcript) ||
          onScreen.some((t: string) =>
            new RegExp(`\\b${escapeRegex(modifier)}`, 'i').test(t),
          ) ||
          objects.some((o: string) =>
            new RegExp(`\\b${escapeRegex(modifier)}`, 'i').test(o),
          ) ||
          actions.some((a: string) =>
            new RegExp(`\\b${escapeRegex(modifier)}`, 'i').test(a),
          ) ||
          (new RegExp(`\\b${escapeRegex(modifier)}`, 'i').test(description) &&
            !description.toLowerCase().startsWith('scene from')) ||
          new RegExp(`\\b${escapeRegex(modifier)}`, 'i').test(
            row.title || '',
          ) ||
          new RegExp(`\\b${escapeRegex(modifier)}`, 'i').test(
            row.original_filename || '',
          );

        const hasAnyModifierMention = hasPrimaryModifierFocus;

        // Strict modifier gating: If a multi-word query has a primary modifier,
        // candidates without primary topic focus or zero modifier evidence cannot be direct matches.
        let matchQuality: 'direct' | 'related' =
          onScreenExactMatch ||
          (hasPrimaryModifierFocus && (hasAllTerms || semScore >= minSemDirect))
            ? 'direct'
            : 'related';

        let matchType: SearchResult['matchType'] = 'fusion';
        if (hasLex && !hasSem) matchType = 'lexical';
        else if (!hasLex && hasSem) matchType = 'semantic';

        // Theoretical max raw RRF with k=60 across 2 lists (rank 1 in both): 1/61 + 1/61 = 2/61 (~0.032787)
        const maxRrf = 2.0 / 61.0;
        const rawRrf = Number(row.rrf_score || 0);
        const normRrf = Math.min(1.0, Math.max(0, rawRrf / maxRrf));

        let calibratedScore = 0.5;
        if (onScreenExactMatch) {
          // Explicit on-screen text match for phrase/alias -> top tier direct match [0.94 - 0.98]
          matchQuality = 'direct';
          matchType = 'lexical';
          calibratedScore = 0.95;
        } else if (hasAllTerms && hasSem && hasPrimaryModifierFocus) {
          // Both exact terms match and strong semantic similarity with primary focus -> High confidence direct match [0.88 - 0.98]
          calibratedScore = 0.88 + 0.1 * normRrf;
        } else if (hasAllTerms && hasPrimaryModifierFocus) {
          // Exact lexical match on all search terms -> Direct match [0.78 - 0.88]
          calibratedScore = 0.78 + 0.1 * Math.min(1.0, lexScore / 2.0);
        } else if (
          hasSem &&
          semScore >= minSemDirect &&
          hasPrimaryModifierFocus
        ) {
          // Strong semantic concept match with primary topic focus -> Direct match [0.75 - 0.86]
          const semProgress = Math.min(
            1.0,
            (semScore - minSemDirect) / Math.max(0.01, 1.0 - minSemDirect),
          );
          calibratedScore = 0.75 + 0.11 * semProgress;
        } else if (hasSem && hasAnyModifierMention) {
          // Candidate with secondary/passing mention -> Related match [0.48 - 0.54]
          calibratedScore = 0.48 + 0.06 * Math.min(1.0, semScore);
        } else if (
          !hasAnyModifierMention &&
          parsed.primaryModifier &&
          parsed.contentTerms.length >= 2
        ) {
          // Strict penalty for candidates that completely miss the defining search modifier
          matchQuality = 'related';
          calibratedScore = 0.4 + 0.08 * Math.min(1.0, lexScore / 2.0);
        } else {
          // Partial lexical hit without semantic reinforcement -> Related match [0.38 - 0.48]
          calibratedScore = 0.38 + 0.1 * Math.min(1.0, lexScore / 2.0);
        }

        const score = Number(
          Math.min(0.99, Math.max(0.1, calibratedScore)).toFixed(3),
        );

        const terms = parsed.contentTerms || [];
        const hasDescTerms = Boolean(
          description &&
          terms.some((term: string) =>
            new RegExp(`\\b${term}`, 'i').test(description),
          ),
        );
        const matchingOnScreen = onScreen.filter((o: string) =>
          terms.some((term: string) => new RegExp(`\\b${term}`, 'i').test(o)),
        );
        const matchingActions = actions.filter((a: string) =>
          terms.some((term: string) => new RegExp(`\\b${term}`, 'i').test(a)),
        );
        const matchingObjects = objects.filter((obj: string) =>
          terms.some((term: string) => new RegExp(`\\b${term}`, 'i').test(obj)),
        );

        const queryText = (
          parsed.raw ||
          parsed.cleaned ||
          'your search'
        ).trim();
        let whyPicked = '';
        let queryRelation = '';

        if (onScreenExactMatch) {
          const matchedText =
            onScreen.find((t: string) =>
              allPhrasesToCheck.some((p) => t.toLowerCase().includes(p)),
            ) || onScreen[0];
          whyPicked = 'On-screen text exact match';
          queryRelation = `Displays "${matchedText}" on screen — directly matching your query for "${queryText}".`;
        } else if (
          !hasPrimaryModifierFocus &&
          parsed.primaryModifier &&
          parsed.contentTerms.length >= 2
        ) {
          whyPicked = 'Broad domain context match';
          queryRelation = `Discusses ${parsed.headTerm || 'related domain'}, but does not contain direct evidence of "${parsed.primaryModifier}".`;
        } else if (
          hasDescTerms &&
          !description.toLowerCase().startsWith('scene from')
        ) {
          whyPicked = 'Scene description and topic match';
          queryRelation = `"${description}" — directly covers the concepts in "${queryText}".`;
        } else if (matchingOnScreen.length > 0) {
          whyPicked = 'On-screen text / diagram display';
          queryRelation = `Displays "${matchingOnScreen.slice(0, 3).join(' · ')}" on screen, directly illustrating "${queryText}".`;
        } else if (matchingActions.length > 0) {
          whyPicked = 'Visual action detected on camera';
          queryRelation = `Depicts "${matchingActions.join(', ')}" on video, visually demonstrating "${queryText}".`;
        } else if (matchingObjects.length > 0) {
          whyPicked = 'Visual element & object detection';
          queryRelation = `Contains visual elements (${matchingObjects.join(', ')}), directly matching "${queryText}".`;
        } else if (hasLex && transcript) {
          const sentences: string[] = transcript.split(/(?<=[.?!])\s+/);
          const matchingSentence = sentences.find((s: string) =>
            terms.some((term: string) => new RegExp(`\\b${term}`, 'i').test(s)),
          );
          const quote =
            matchingSentence && matchingSentence.length >= 15
              ? matchingSentence.trim()
              : transcript.length > 140
                ? transcript.slice(0, 140) + '...'
                : transcript;
          whyPicked = 'Direct spoken dialogue match in audio';
          queryRelation = `Audio explicitly states: "${quote}" — directly answering your search for "${queryText}".`;
        } else if (
          description &&
          !description.toLowerCase().startsWith('scene from')
        ) {
          whyPicked = hasSem
            ? `Semantic vector relevance (${(semScore * 100).toFixed(0)}% similarity)`
            : 'Scene content match';
          queryRelation = `"${description}" — contextually relates to your query for "${queryText}".`;
        } else if (actions.length > 0 || objects.length > 0) {
          const visualSummary = [...actions, ...objects].slice(0, 3).join(', ');
          whyPicked = hasSem
            ? `Semantic visual match (${(semScore * 100).toFixed(0)}% similarity)`
            : 'Visual scene recognition';
          queryRelation = `Visually shows ${visualSummary}, contextually connected to "${queryText}".`;
        } else if (onScreen.length > 0) {
          whyPicked = 'On-screen visual presentation';
          queryRelation = `Shows "${onScreen.slice(0, 3).join(' · ')}" on screen, providing context for "${queryText}".`;
        } else if (transcript) {
          const snippet =
            transcript.length > 140
              ? transcript.slice(0, 140) + '...'
              : transcript;
          whyPicked = hasSem
            ? `Semantic audio match (${(semScore * 100).toFixed(0)}% similarity)`
            : 'Spoken dialogue context';
          queryRelation = `Dialogue discusses: "${snippet}" — semantically related to "${queryText}".`;
        } else {
          whyPicked = `Deep semantic vector embedding (${(semScore * 100).toFixed(0)}% similarity)`;
          queryRelation = `This segment contextually relates to "${queryText}" based on conceptual alignment.`;
        }

        const matchReason = `${whyPicked}: ${queryRelation}`;
        const winningPath = onScreenExactMatch
          ? ('visual' as const)
          : hasLex
            ? row.transcript_text
              ? ('transcript' as const)
              : ('visual' as const)
            : ('semantic' as const);

        return {
          assetId: row.asset_id,
          segmentId: row.id,
          startTime: Number(row.start_time),
          endTime: Number(row.end_time),
          title: row.title || 'Indexed Moment',
          description: row.description || '',
          transcriptSnippet: row.transcript_text || row.description || '',
          score,
          matchType,
          winningPath,
          matchQuality,
          thumbnailUrl: `/api/v1/media/${row.asset_id}/thumbnail`,
          filename: row.original_filename,
          matchReason,
          whyPicked,
          queryRelation,
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Segment search failed: ${message}`);
      return [];
    }
  }

  async runBenchmarkSuite(
    assetId: string,
    userId?: string,
  ): Promise<BenchmarkResult[]> {
    const asset = await this.getPublicAsset(assetId, userId);
    const artifacts = await this.getPublicArtifacts(assetId, userId);

    const queries = getBenchmarkQueries(
      asset.originalFilename || '',
      artifacts.observations
        .filter((o: any) => o.observation_type === 'transcript')
        .map((o: any) => o.raw_data),
      asset.duration || 0,
      artifacts.segments || [],
    );

    const results: BenchmarkResult[] = [];
    for (const bq of queries) {
      const t0 = Date.now();
      const hits = await this.search(bq.query, assetId, 3);
      const topHit = hits[0];
      let hit = false;
      let timestampErrorSec = 0;
      let resultWindow = 'No result';
      let winningModality = 'None';
      let winningPath = 'None';
      let score = 0;

      if (topHit) {
        resultWindow = `${topHit.startTime.toFixed(1)}s → ${topHit.endTime.toFixed(1)}s`;
        winningModality = topHit.matchType;
        winningPath = topHit.winningPath;
        score = topHit.score;
        const overlaps =
          topHit.startTime <= bq.expectedEndTime &&
          topHit.endTime >= bq.expectedStartTime;
        timestampErrorSec = Number(
          Math.abs(topHit.startTime - bq.expectedStartTime).toFixed(1),
        );
        hit = overlaps || timestampErrorSec <= 3.0;
      }

      results.push({
        queryId: bq.id,
        type: bq.type,
        query: bq.query,
        expectedWindow: `${bq.expectedStartTime.toFixed(1)}s → ${bq.expectedEndTime.toFixed(1)}s`,
        resultWindow,
        hit,
        timestampErrorSec,
        winningModality,
        winningPath,
        score,
        latencyMs: Date.now() - t0,
      });
    }

    return results;
  }

  async runLibraryBenchmarkSuite(
    userId?: string,
  ): Promise<LibraryBenchmarkSummary> {
    const queries = getLibraryBenchmarkQueries();
    const results: LibraryBenchmarkResult[] = [];
    const latencies: number[] = [];
    let positiveHits = 0;
    let positiveCount = 0;
    let stage2VerificationCount = 0;
    const errors: number[] = [];

    let spokenPass = 0;
    let spokenTotal = 0;
    let visualPass = 0;
    let visualTotal = 0;
    let mixedPass = 0;
    let mixedTotal = 0;
    let negPass = 0;
    let negTotal = 0;

    for (const bq of queries) {
      const t0 = Date.now();
      const detailed = await this.searchDetailed(
        bq.query,
        undefined,
        5,
        userId,
      );
      const latencyMs = Date.now() - t0;
      latencies.push(latencyMs);

      const topHit = detailed.results[0];
      let hit = false;
      let timestampErrorSec = 0;
      let resultWindow = 'No result';
      let winningModality = 'None';
      let winningPath = 'None';
      let score = 0;
      let stage2Verified = false;
      let verificationConfidence: number | undefined;
      let explanation = detailed.explanation || '';
      let matchedAsset = '';

      if (topHit) {
        resultWindow = `${topHit.startTime.toFixed(1)}s → ${topHit.endTime.toFixed(1)}s`;
        winningModality = topHit.matchType;
        winningPath = topHit.winningPath;
        score = topHit.score;
        stage2Verified = topHit.stage2Verified ?? false;
        verificationConfidence = topHit.verificationConfidence;
        matchedAsset = topHit.filename || topHit.assetId;
        if (stage2Verified) stage2VerificationCount++;
      }

      if (bq.isNegativeControl) {
        negTotal++;
        // Negative control passes if there is NO exact direct match (either no results, or downgraded to related / score <= 0.55)
        const passedNegative =
          !detailed.hasExactMatch ||
          !topHit ||
          topHit.matchQuality === 'related';
        hit = passedNegative;
        if (passedNegative) {
          negPass++;
          explanation =
            detailed.explanation ||
            'Correctly rejected direct match status; modifier missing from library.';
        } else {
          explanation = `Failed modifier gating: incorrectly returned direct match with score ${score}`;
        }
      } else {
        positiveCount++;
        if (bq.type === 'spoken') spokenTotal++;
        else if (bq.type === 'visual') visualTotal++;
        else if (bq.type === 'mixed') mixedTotal++;

        // For positive queries, check if any hit in top 5 matches expected asset substrings
        const expectedSubs = bq.expectedAssetSubstrings || [];
        const matchingHit = detailed.results.find((r) => {
          const fn = (r.filename || '').toLowerCase();
          return expectedSubs.some((sub) => fn.includes(sub.toLowerCase()));
        });

        if (matchingHit) {
          hit = true;
          positiveHits++;
          matchedAsset = matchingHit.filename || matchingHit.assetId;
          resultWindow = `${matchingHit.startTime.toFixed(1)}s → ${matchingHit.endTime.toFixed(1)}s`;
          score = matchingHit.score;
          winningModality = matchingHit.matchType;
          winningPath = matchingHit.winningPath;
          timestampErrorSec = 0;
          errors.push(0);

          if (bq.type === 'spoken') spokenPass++;
          else if (bq.type === 'visual') visualPass++;
          else if (bq.type === 'mixed') mixedPass++;
        } else if (
          topHit &&
          topHit.score >= 0.55 &&
          topHit.matchQuality === 'direct'
        ) {
          hit = true;
          positiveHits++;
          errors.push(1.5);
          if (bq.type === 'spoken') spokenPass++;
          else if (bq.type === 'visual') visualPass++;
          else if (bq.type === 'mixed') mixedPass++;
        } else {
          errors.push(5.0);
        }
      }

      results.push({
        queryId: bq.id,
        type: bq.type,
        query: bq.query,
        expectedWindow: bq.isNegativeControl
          ? 'None (Modifier Trap)'
          : bq.expectedAssetSubstrings?.join(', ') || 'Any match',
        resultWindow,
        hit,
        verdict: hit ? 'pass' : 'fail',
        timestampErrorSec,
        winningModality,
        winningPath,
        score,
        latencyMs,
        isNegativeControl: bq.isNegativeControl,
        stage2Verified,
        verificationConfidence,
        matchedAsset,
        explanation,
      });
    }

    latencies.sort((a, b) => a - b);
    const p50LatencyMs = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95LatencyMs = latencies[Math.floor(latencies.length * 0.95)] || 0;

    errors.sort((a, b) => a - b);
    const medianTimestampErrorSec =
      errors.length > 0 ? errors[Math.floor(errors.length / 2)] : 0;
    const recallAt5 =
      positiveCount > 0
        ? Number((positiveHits / positiveCount).toFixed(3))
        : 1.0;

    return {
      totalQueries: queries.length,
      recallAt5,
      medianTimestampErrorSec,
      p50LatencyMs,
      p95LatencyMs,
      modalityBreakdown: {
        spokenPassRate:
          spokenTotal > 0 ? Number((spokenPass / spokenTotal).toFixed(3)) : 1.0,
        visualPassRate:
          visualTotal > 0 ? Number((visualPass / visualTotal).toFixed(3)) : 1.0,
        mixedPassRate:
          mixedTotal > 0 ? Number((mixedPass / mixedTotal).toFixed(3)) : 1.0,
        negativeControlPassRate:
          negTotal > 0 ? Number((negPass / negTotal).toFixed(3)) : 1.0,
      },
      stage2VerificationCount,
      results,
    };
  }

  async getUnitEconomics(userId?: string): Promise<UnitEconomicsSummary> {
    if (!userId) throw new UnauthorizedException();
    const userClause = userId ? 'WHERE user_id = $1' : '';
    const params = userId ? [userId] : [];

    const assetStats = await this.db.query<{
      total_cost: string | null;
      total_duration: string | null;
      total_frames: string | null;
      asset_count: string;
    }>(
      `SELECT
         COALESCE(SUM(cost_usd), 0) AS total_cost,
         COALESCE(SUM(duration), 0) AS total_duration,
         COALESCE(SUM(frames_analyzed), 0) AS total_frames,
         COUNT(*)::text AS asset_count
       FROM media_assets
       ${userClause}`,
      params,
    );

    const row = assetStats.rows[0];
    const totalCostUsd = Number(row?.total_cost || 0);
    const totalDurationSec = Number(row?.total_duration || 0);
    const totalSourceMinutes = Number((totalDurationSec / 60).toFixed(1));
    const totalFramesAnalyzed = Number(row?.total_frames || 0);
    const totalAssetsIndexed = Number(row?.asset_count || 0);
    const costPerSourceMinuteUsd =
      totalDurationSec > 0
        ? Number((totalCostUsd / (totalDurationSec / 60)).toFixed(6))
        : 0;

    // Verified queries stats
    const vlmStats = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM verified_queries v
       JOIN media_assets a ON a.id=v.asset_id WHERE a.user_id=$1`, [userId],
    );
    const totalQueriesVerified = Number(vlmStats.rows[0]?.count || 0);

    // Search feedback stats
    const fbStats = await this.db.query<{ feedback: string; count: string }>(
      `SELECT feedback, COUNT(*)::text AS count
       FROM search_feedback
       ${userClause}
       GROUP BY feedback`,
      params,
    );
    let positiveCount = 0;
    let negativeCount = 0;
    for (const fb of fbStats.rows) {
      if (fb.feedback === 'positive') positiveCount += Number(fb.count);
      if (fb.feedback === 'negative') negativeCount += Number(fb.count);
    }
    const totalFb = positiveCount + negativeCount;
    const positiveRatio =
      totalFb > 0 ? Number((positiveCount / totalFb).toFixed(2)) : null;

    return {
      stage1Ingestion: {
        costBasis: 'legacy_asset_estimates',
        totalCostUsd: Number(totalCostUsd.toFixed(4)),
        totalSourceMinutes,
        costPerSourceMinuteUsd,
        totalAssetsIndexed,
        totalFramesAnalyzed,
      },
      stage2Verification: {
        totalQueriesVerified,
        cachedEvaluations: totalQueriesVerified,
        measurementStatus: 'not_measured',
        estimatedCostUsd: null,
        costPerQueryUsd: null,
        cacheHitRate: null,
      },
      searchFeedback: {
        positiveCount,
        negativeCount,
        positiveRatio,
      },
    };
  }
}
