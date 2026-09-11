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
  stage2Verified?: boolean;
  verificationConfidence?: number;
  verificationExplanation?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  hasExactMatch: boolean;
  queryIntent: 'spoken' | 'visual' | 'mixed';
  primaryModifier?: string | null;
  missingTerms?: string[];
  explanation?: string;
}

export interface FeedbackPayload {
  query: string;
  assetId: string;
  segmentId?: string;
  timestampSec?: number;
  feedback: 'positive' | 'negative';
  notes?: string;
}

export interface SubTopicQuery {
  topic: string;
  searchPhrase: string;
}

export interface QueryDecomposition {
  isCompound: boolean;
  subQueries: SubTopicQuery[];
}

export interface UnderstoodQuery {
  rawQuery: string;
  cleanSearchPhrase: string;
  coreSubject: string;
  targetEntity?: string;
  aspect?: string;
  aliases: string[];
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

export interface LibraryBenchmarkResult extends BenchmarkResult {
  isNegativeControl?: boolean;
  stage2Verified?: boolean;
  verificationConfidence?: number;
  matchedAsset?: string;
  verdict: 'pass' | 'fail';
  explanation?: string;
}

export interface LibraryBenchmarkSummary {
  totalQueries: number;
  recallAt5: number;
  medianTimestampErrorSec: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  modalityBreakdown: {
    spokenPassRate: number;
    visualPassRate: number;
    mixedPassRate: number;
    negativeControlPassRate: number;
  };
  stage2VerificationCount: number;
  results: LibraryBenchmarkResult[];
}

export interface UnitEconomicsSummary {
  stage1Ingestion: {
    totalCostUsd: number;
    totalSourceMinutes: number;
    costPerSourceMinuteUsd: number;
    totalAssetsIndexed: number;
    totalFramesAnalyzed: number;
  };
  stage2Verification: {
    totalQueriesVerified: number;
    estimatedCostUsd: number;
    costPerQueryUsd: number;
    cacheHitRate: number;
  };
  searchFeedback: {
    positiveCount: number;
    negativeCount: number;
    positiveRatio: number;
  };
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
  startedAt?: string;
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
