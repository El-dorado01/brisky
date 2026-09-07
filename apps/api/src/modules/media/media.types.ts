export interface SearchResult {
  assetId: string;
  segmentId: string;
  startTime: number;
  endTime: number;
  title: string;
  description: string;
  transcriptSnippet: string;
  score: number;
  matchType: 'lexical' | 'semantic' | 'fusion';
  winningPath: 'transcript' | 'visual' | 'gemini' | 'fusion' | 'semantic';
  matchQuality?: 'direct' | 'related';
  thumbnailUrl: string;
  filename?: string;
  matchReason?: string;
  whyPicked?: string;
  queryRelation?: string;
  subTopic?: string;
}

export interface SubTopicQuery {
  topic: string;
  searchPhrase: string;
}

export interface QueryDecomposition {
  isCompound: boolean;
  subQueries: SubTopicQuery[];
}

export interface BenchmarkResult {
  queryId: string;
  type: string;
  query: string;
  expectedWindow: string;
  resultWindow: string;
  hit: boolean;
  timestampErrorSec: number;
  winningModality: string;
  winningPath: string;
  score: number;
  latencyMs: number;
}

export interface PublicAsset {
  assetId: string;
  originalFilename: string;
  checksum: string;
  sourceType: 'upload';
  status: 'queued' | 'processing' | 'indexed' | 'failed';
  stage: string;
  progress: number;
  error?: string;
  originalDeleted: boolean;
  duration: number;
  resolution: string;
  codec: string;
  segmentCount: number;
  indexedAt?: string;
  thumbnailUrl: string;
  streamUrl: string;
  costUsd?: number;
  costPerSourceMinuteUsd?: number;
  framesAnalyzed?: number;
  indexDurationMs?: number;
  parentAssetId?: string;
  relationshipType?: string;
  phash?: string;
  proxyStatus?: 'pending' | 'processing' | 'ready' | 'failed';
  availability?: 'online' | 'archived' | 'missing' | 'pending';
}

export interface AssetRelationship {
  id: string;
  sourceAssetId: string;
  targetAssetId: string;
  relationshipType: string;
  confidence: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface AssetLineage {
  assetId: string;
  parentAsset: PublicAsset | null;
  children: PublicAsset[];
  relationships: AssetRelationship[];
}
