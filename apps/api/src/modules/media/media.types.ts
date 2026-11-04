export interface SearchResult {
  conversationVerification?: import('../pipeline/conversation-evidence').ConversationVerification;
  assetId: string;
  segmentId: string;
  startTime: number;
  endTime: number;
  title: string;
  description: string;
  transcriptSnippet: string;
  score: number;
  matchType: 'lexical' | 'semantic' | 'fusion' | 'identity';
  winningPath: 'transcript' | 'visual' | 'gemini' | 'fusion' | 'semantic' | 'identity';
  playbackUrl?: string;
  matchQuality?: 'direct' | 'related';
  thumbnailUrl: string;
  filename?: string;
  matchReason?: string;
  whyPicked?: string;
  queryRelation?: string;
  subTopic?: string;
  verificationStatus?: 'pending' | 'matched' | 'not_matched' | 'uncertain' | 'insufficient_evidence' | 'error';
  verificationIssue?: 'budget' | 'source' | 'temporary' | 'invalid_response';
  stage2Verified?: boolean;
  verificationConfidence?: number;
  verificationEvidenceKind?: 'original' | 'preview' | 'stored_frames';
  verificationMethod?: 'video' | 'frames';
  verificationExplanation?: string;
}

export interface SearchResponse {
  identitySearch?: {
    status: 'resolved' | 'needs_clarification';
    references: import('../people/people-search').PersonReference[];
    evidenceScope: 'manual_appearance_overlap'; queryConditionsVerified: false; hasMore: boolean;
  };
  searchStatus?: 'complete' | 'refining' | 'incomplete';
  canContinue?: boolean;
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
    costBasis: 'legacy_asset_estimates';
    totalCostUsd: number;
    totalSourceMinutes: number;
    costPerSourceMinuteUsd: number;
    totalAssetsIndexed: number;
    totalFramesAnalyzed: number;
  };
  stage2Verification: {
    cachedEvaluations: number;
    measurementStatus: 'not_measured';
    /** Deprecated alias for cachedEvaluations; not an inference/request count. */
    totalQueriesVerified: number;
    estimatedCostUsd: number | null;
    costPerQueryUsd: number | null;
    cacheHitRate: number | null;
  };
  searchFeedback: {
    positiveCount: number;
    negativeCount: number;
    positiveRatio: number | null;
  };
}

export interface PublicAsset {
  assetId: string;
  originalFilename: string;
  checksum: string;
  sourceType: 'upload' | 'google_drive' | 'drive' | 'dropbox' | 'onedrive' | 's3' | string;
  externalFileId?: string;
  connectorAccountId?: string;
  driveWebViewLink?: string;
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
