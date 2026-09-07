import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import { IndexingService } from '../queue/indexing.service';
import { GeminiIntelligenceService } from '../pipeline/gemini-intelligence.service';
import { LocalEmbeddingService } from '../pipeline/local-embedding.service';
import { UploadConnector } from '../connector/upload.connector';
import {
  assertPathWithinRoot,
  findRepoRoot,
  resolveFromRepo,
  validateAssetId,
} from '../../common/repo-paths';
import { getBenchmarkQueries } from './benchmark-queries';
import { parseSearchQuery } from './query-parse';
import { PublicAsset, SearchResult, BenchmarkResult, AssetLineage, AssetRelationship } from './media.types';
export { PublicAsset, SearchResult, BenchmarkResult, AssetLineage, AssetRelationship };

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private storageRoot: string;
  private proxyDir: string;
  private thumbnailDir: string;
  private scratchDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
    private readonly indexingService: IndexingService,
    private readonly geminiService: GeminiIntelligenceService,
    private readonly localEmbeddingService: LocalEmbeddingService,
    private readonly uploadConnector: UploadConnector,
  ) {
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


  async startFromUploadStream(originalFilename: string, stream: NodeJS.ReadableStream, userId: string) {
    const assetId = this.newAssetId();
    const stored = await this.uploadConnector.ingestStream(assetId, originalFilename, stream);
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
      `SELECT * FROM media_assets WHERE id = $1 ${userClause}`,
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
      resolution: row.width && row.height ? `${row.width}x${row.height}` : 'unknown',
      codec: row.codec,
      segmentCount,
      indexedAt: row.indexed_at,
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

  async listPublicAssets(userId?: string): Promise<PublicAsset[]> {
    const userClause = userId ? 'WHERE a.user_id = $1' : '';
    const params = userId ? [userId] : [];

    const res = await this.db.query(
      `SELECT a.*, COUNT(s.id)::int AS segment_count
       FROM media_assets a
       LEFT JOIN media_segments s ON s.asset_id = a.id
       ${userClause}
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
      params,
    );

    return res.rows.map((row) => ({
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
      resolution: row.width && row.height ? `${row.width}x${row.height}` : 'unknown',
      codec: row.codec,
      segmentCount: row.segment_count || 0,
      indexedAt: row.indexed_at,
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
    }));
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

  async getStreamPath(assetId: string, userId?: string): Promise<string> {
    const validId = validateAssetId(assetId);
    if (userId) {
      const check = await this.db.query('SELECT id FROM media_assets WHERE id = $1 AND user_id = $2', [
        validId,
        userId,
      ]);
      if (check.rows.length === 0) {
        throw new NotFoundException(`Asset ${validId} not found`);
      }
    }

    const proxyPath = assertPathWithinRoot(path.join(this.proxyDir, `${validId}.mp4`), this.storageRoot);
    if (fs.existsSync(proxyPath)) return proxyPath;

    // Check storage/uploads/${validId} folder for original file
    const uploadDir = assertPathWithinRoot(path.join(this.storageRoot, 'uploads', validId), this.storageRoot);
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      if (files.length > 0) {
        const originalPath = assertPathWithinRoot(path.join(uploadDir, files[0]), this.storageRoot);
        if (fs.existsSync(originalPath)) return originalPath;
      }
    }

    // Check scratch or direct upload file
    const scratchOriginal = assertPathWithinRoot(path.join(this.storageRoot, 'uploads', `${validId}.mp4`), this.storageRoot);
    if (fs.existsSync(scratchOriginal)) return scratchOriginal;

    throw new NotFoundException(`Playable media proxy not found for asset ${validId}`);
  }

  async getThumbnailPath(assetId: string, userId?: string): Promise<string> {
    const validId = validateAssetId(assetId);
    if (userId) {
      const check = await this.db.query('SELECT id FROM media_assets WHERE id = $1 AND user_id = $2', [
        validId,
        userId,
      ]);
      if (check.rows.length === 0) {
        throw new NotFoundException(`Thumbnail not found for asset ${validId}`);
      }
    }

    const thumbPath = assertPathWithinRoot(path.join(this.thumbnailDir, `${validId}.jpg`), this.storageRoot);
    if (fs.existsSync(thumbPath)) return thumbPath;
    throw new NotFoundException(`Thumbnail not found for asset ${validId}`);
  }

  async deleteOriginalSource(assetId: string, userId?: string): Promise<boolean> {
    const validId = validateAssetId(assetId);
    const userClause = userId ? 'AND user_id = $2' : '';
    const params = userId ? [validId, userId] : [validId];

    const res = await this.db.query(
      `SELECT original_path FROM media_assets WHERE id = $1 ${userClause}`,
      params,
    );
    if (res.rows.length === 0) throw new NotFoundException(`Asset ${validId} not found`);

    const originalPath = res.rows[0].original_path;
    await this.uploadConnector.deleteSource(validId);
    if (originalPath && fs.existsSync(originalPath)) {
      try {
        const safeOriginal = assertPathWithinRoot(originalPath, this.storageRoot);
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

    this.logger.log(`Deleted master upload bytes for ${validId}; proxy + PostgreSQL intelligence retained`);
    return true;
  }

  async search(
    query: string,
    assetIdFilter?: string,
    limit = 15,
    userId?: string,
  ): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // Check if query contains explicit compound signals indicating multiple distinct sub-topics
    // Exclude simple 2-4 word noun queries with "and" / "or" which are handled natively by full-text and vector search
    const hasCompoundSignal =
      trimmed.includes(';') ||
      /\b(compare|versus|vs\.?)\b/i.test(trimmed) ||
      /\b(also find|in addition to|as well as|show both|find both|find all)\b/i.test(trimmed) ||
      (/\bboth\b/i.test(trimmed) && /\band\b/i.test(trimmed)) ||
      (trimmed.includes(',') && trimmed.split(',').length >= 3);

    if (hasCompoundSignal && this.geminiService.isConfigured()) {
      try {
        // Enforce a strict 400ms timeout race on query decomposition so search is never blocked
        const decompPromise = this.geminiService.decomposeQuery(trimmed);
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 400));
        const decomp = await Promise.race([decompPromise, timeoutPromise]);

        if (decomp && decomp.isCompound && decomp.subQueries.length > 1) {
          this.logger.log(
            `Decomposed compound query into ${decomp.subQueries.length} sub-queries: ${decomp.subQueries
              .map((s) => s.topic)
              .join(' | ')}`,
          );
          return this.searchCompoundMultiTopic(trimmed, decomp.subQueries, assetIdFilter, limit, userId);
        }
      } catch (err) {
        this.logger.warn(`Query decomposition error or timeout, continuing with single search: ${err}`);
      }
    }

    return this.searchSingleTopic(trimmed, assetIdFilter, limit, userId);
  }

  private async searchSingleTopic(
    query: string,
    assetIdFilter?: string,
    limit = 15,
    userId?: string,
    topicLabel?: string,
  ): Promise<SearchResult[]> {
    const parsed = parseSearchQuery(query);

    // Parallel execution: run direct phrase matching and hybrid segment search concurrently
    const [phraseHits, segmentHits] = await Promise.all([
      this.searchTranscriptPhrases(parsed, assetIdFilter, userId, limit),
      this.searchSegments(parsed, assetIdFilter, userId, limit + 10),
    ]);

    const seen = new Set<string>();
    const directHits: SearchResult[] = [];
    const relatedHits: SearchResult[] = [];

    // Exact phrase hits take top priority as direct matches
    for (const hit of phraseHits) {
      const key = `${hit.assetId}:${hit.startTime.toFixed(1)}`;
      if (!seen.has(key)) {
        seen.add(key);
        directHits.push({
          ...hit,
          matchQuality: 'direct',
          subTopic: topicLabel || hit.subTopic,
        });
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

    // Direct matches take precedence, followed by related semantic explorations
    return [...directHits, ...relatedHits].slice(0, limit);
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
        this.searchSingleTopic(sq.searchPhrase, assetIdFilter, limit, userId, sq.topic),
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
    const maxTopicItems = Math.max(...perTopicSearches.map((res) => res.length), 0);
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
  ): Promise<SearchResult[]> {
    if (parsed.phrases.length === 0 && parsed.contentTerms.length === 0) return [];

    const params: unknown[] = [];
    let p = 1;
    const where: string[] = [`o.observation_type = 'transcript'`, `a.status = 'indexed'`];

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
    for (const phrase of parsed.phrases) {
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
        const pairClauses: string[] = [];
        for (let i = 0; i < termClauses.length; i++) {
          for (let j = i + 1; j < termClauses.length; j++) {
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

    const phraseRankSql = phraseClauses.length > 0 ? phraseClauses.join(' OR ') : 'FALSE';
    const termsRankSql = termClauses.length > 0 ? termClauses.join(' AND ') : 'FALSE';

    const sql = `
      SELECT o.asset_id, o.timestamp_start, o.timestamp_end,
             o.raw_data->>'text' AS text, a.original_filename
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
        const endTime = Number(Math.max(Number(row.timestamp_end), startTime + 2).toFixed(2));
        const text = String(row.text || '').trim();
        const queryText = (parsed.raw || parsed.cleaned || 'your search').trim();
        const snippet = text.length > 140 ? text.slice(0, 140) + '...' : text;
        const whyPicked = 'Direct spoken phrase match in audio track';
        const queryRelation = `Spoken dialogue states: "${snippet}" — directly matching your query for "${queryText}".`;
        return {
          assetId: row.asset_id,
          segmentId: `cue_${row.asset_id}_${i}`,
          startTime,
          endTime,
          title: row.original_filename || 'Spoken moment',
          description: text,
          transcriptSnippet: text,
          score: Number(Math.max(0.78, 0.96 - i * 0.02).toFixed(3)),
          matchType: 'lexical' as const,
          winningPath: 'transcript' as const,
          matchQuality: 'direct' as const,
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
  ): Promise<SearchResult[]> {
    const andQuery = parsed.andTsQuery;
    const orQuery = parsed.orTsQuery;
    const embedSource = parsed.cleaned || parsed.raw;
    let queryEmbedding: number[] = [];

    const preferredProvider = this.configService.get<string>('EMBEDDING_PROVIDER', 'gemini');
    if (preferredProvider === 'local' && this.localEmbeddingService.isAvailable()) {
      try {
        const res = await this.localEmbeddingService.generateEmbedding(embedSource);
        queryEmbedding = res.values;
      } catch (localErr) {
        this.logger.warn(`Local query embedding failed, trying Gemini: ${localErr}`);
        if (this.geminiService.isConfigured()) {
          queryEmbedding = (await this.geminiService.generateEmbedding(embedSource)).values;
        }
      }
    } else if (this.geminiService.isConfigured()) {
      queryEmbedding = (await this.geminiService.generateEmbedding(embedSource)).values;
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
        WHERE a.status = 'indexed'
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
        WHERE ${orQuery ? `s.doc_vector @@ ${orSql}` : (andQuery ? `s.doc_vector @@ ${andSql}` : 'FALSE')}
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
        const matchQuality: 'direct' | 'related' = (hasAllTerms || semScore >= minSemDirect) ? 'direct' : 'related';

        let matchType: SearchResult['matchType'] = 'fusion';
        if (hasLex && !hasSem) matchType = 'lexical';
        else if (!hasLex && hasSem) matchType = 'semantic';

        // Theoretical max raw RRF with k=60 across 2 lists (rank 1 in both): 1/61 + 1/61 = 2/61 (~0.032787)
        const maxRrf = 2.0 / 61.0;
        const rawRrf = Number(row.rrf_score || 0);
        const normRrf = Math.min(1.0, Math.max(0, rawRrf / maxRrf));

        let calibratedScore = 0.5;
        if (hasAllTerms && hasSem) {
          // Both exact terms match and strong semantic similarity -> High confidence direct match [0.88 - 0.98]
          calibratedScore = 0.88 + 0.10 * normRrf;
        } else if (hasAllTerms) {
          // Exact lexical match on all search terms -> Direct match [0.78 - 0.88]
          calibratedScore = 0.78 + 0.10 * Math.min(1.0, lexScore / 2.0);
        } else if (hasSem && semScore >= minSemDirect) {
          // Strong semantic concept match -> Direct match [0.75 - 0.86]
          const semProgress = Math.min(1.0, (semScore - minSemDirect) / Math.max(0.01, 1.0 - minSemDirect));
          calibratedScore = 0.75 + 0.11 * semProgress;
        } else if (hasSem) {
          // Moderate semantic candidate -> Related match [0.52 - 0.74]
          const semProgress = Math.min(1.0, (semScore - minSemCandidate) / Math.max(0.01, minSemDirect - minSemCandidate));
          calibratedScore = 0.52 + 0.22 * semProgress;
        } else {
          // Partial lexical hit without semantic reinforcement -> Related match [0.40 - 0.65]
          calibratedScore = 0.40 + 0.25 * Math.min(1.0, lexScore / 2.0);
        }

        const score = Number(Math.min(0.99, Math.max(0.10, calibratedScore)).toFixed(3));

        const transcript = (row.transcript_text || '').trim();
        const onScreen = (row.on_screen_text || []).filter(Boolean);
        const actions = (row.actions || []).filter(Boolean);
        const objects = (row.visual_objects || []).filter(Boolean);
        const description = (row.description || '').trim();

        const terms = parsed.contentTerms || [];
        const hasDescTerms = Boolean(
          description && terms.some((term: string) => new RegExp(`\\b${term}`, 'i').test(description))
        );
        const matchingOnScreen = onScreen.filter((o: string) =>
          terms.some((term: string) => new RegExp(`\\b${term}`, 'i').test(o))
        );
        const matchingActions = actions.filter((a: string) =>
          terms.some((term: string) => new RegExp(`\\b${term}`, 'i').test(a))
        );
        const matchingObjects = objects.filter((obj: string) =>
          terms.some((term: string) => new RegExp(`\\b${term}`, 'i').test(obj))
        );

        const queryText = (parsed.raw || parsed.cleaned || 'your search').trim();
        let whyPicked = '';
        let queryRelation = '';

        if (hasDescTerms && !description.toLowerCase().startsWith('scene from')) {
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
            terms.some((term: string) => new RegExp(`\\b${term}`, 'i').test(s))
          );
          const quote = matchingSentence && matchingSentence.length >= 15
            ? matchingSentence.trim()
            : (transcript.length > 140 ? transcript.slice(0, 140) + '...' : transcript);
          whyPicked = 'Direct spoken dialogue match in audio';
          queryRelation = `Audio explicitly states: "${quote}" — directly answering your search for "${queryText}".`;
        } else if (description && !description.toLowerCase().startsWith('scene from')) {
          whyPicked = hasSem ? `Semantic vector relevance (${(semScore * 100).toFixed(0)}% similarity)` : 'Scene content match';
          queryRelation = `"${description}" — contextually relates to your query for "${queryText}".`;
        } else if (actions.length > 0 || objects.length > 0) {
          const visualSummary = [...actions, ...objects].slice(0, 3).join(', ');
          whyPicked = hasSem ? `Semantic visual match (${(semScore * 100).toFixed(0)}% similarity)` : 'Visual scene recognition';
          queryRelation = `Visually shows ${visualSummary}, contextually connected to "${queryText}".`;
        } else if (onScreen.length > 0) {
          whyPicked = 'On-screen visual presentation';
          queryRelation = `Shows "${onScreen.slice(0, 3).join(' · ')}" on screen, providing context for "${queryText}".`;
        } else if (transcript) {
          const snippet = transcript.length > 140 ? transcript.slice(0, 140) + '...' : transcript;
          whyPicked = hasSem ? `Semantic audio match (${(semScore * 100).toFixed(0)}% similarity)` : 'Spoken dialogue context';
          queryRelation = `Dialogue discusses: "${snippet}" — semantically related to "${queryText}".`;
        } else {
          whyPicked = `Deep semantic vector embedding (${(semScore * 100).toFixed(0)}% similarity)`;
          queryRelation = `This segment contextually relates to "${queryText}" based on conceptual alignment.`;
        }

        const matchReason = `${whyPicked}: ${queryRelation}`;

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
          winningPath: hasLex ? 'transcript' : 'semantic',
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

  async runBenchmarkSuite(assetId: string, userId?: string): Promise<BenchmarkResult[]> {
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
          topHit.startTime <= bq.expectedEndTime && topHit.endTime >= bq.expectedStartTime;
        timestampErrorSec = Number(Math.abs(topHit.startTime - bq.expectedStartTime).toFixed(1));
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
}
