export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  created_at?: string;
}

export interface AssetSummary {
  assetId: string;
  originalFilename: string;
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
}

export interface IndexingStats {
  discovered: number;
  indexed: number;
  processing: number;
  queued?: number;
  failed: number;
  remaining: number;
  activeAsset?: {
    assetId: string;
    filename: string;
    stage: string;
    progress: number;
  };
}

export interface SearchHit {
  assetId: string;
  segmentId: string;
  startTime: number;
  endTime: number;
  title: string;
  description: string;
  transcriptSnippet: string;
  score: number;
  matchType: 'lexical' | 'semantic' | 'fusion';
  winningPath: string;
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

export interface SearchMeta {
  hasExactMatch: boolean;
  queryIntent?: 'spoken' | 'visual' | 'mixed';
  primaryModifier?: string | null;
  missingTerms?: string[];
  explanation?: string;
}

export interface BenchmarkItem {
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

export interface LibraryBenchmarkItem extends BenchmarkItem {
  verdict: 'pass' | 'fail';
  isNegativeControl?: boolean;
  stage2Verified?: boolean;
  verificationConfidence?: number;
  matchedAsset?: string;
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
  results: LibraryBenchmarkItem[];
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

export interface IndexingJobItem {
  id: string;
  bull_job_id?: string;
  asset_id: string;
  original_filename?: string;
  duration?: number;
  file_size?: number | string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | string;
  stage: string;
  progress: number;
  error?: string;
  attempts: number;
  provider?: string;
  model?: string;
  timings?: Array<{ stage: string; durationMs: number }> | string;
  cost?: {
    estimatedUsd?: number;
    framesAnalyzed?: number;
    sceneCount?: number;
    indexDurationMs?: number;
    stages?: Array<{ stage: string; model: string; estimatedUsd: number; durationMs: number }>;
  } | string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
}

export interface AssetRelationship {
  id: string;
  parentAssetId: string;
  childAssetId: string;
  relationshipType: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AssetLineage {
  assetId: string;
  parentAssetId: string | null;
  relationshipType: string | null;
  phash: string | null;
  ancestors: Array<{
    assetId: string;
    originalFilename: string;
    status: string;
    relationshipType: string | null;
  }>;
  children: Array<{
    assetId: string;
    originalFilename: string;
    status: string;
    relationshipType: string;
  }>;
  relationships: AssetRelationship[];
}

export type ActiveTab = 'search' | 'benchmark' | 'artifacts' | 'observability';

export function parseJsonSafe<T>(val: unknown, fallback: T): T {
  if (!val) return fallback;
  if (typeof val === 'object') return val as T;
  try {
    return JSON.parse(String(val)) as T;
  } catch {
    return fallback;
  }
}

export function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function dynamicPills(artifacts: Record<string, unknown> | null): string[] {
  if (!artifacts) {
    return [
      'find a person speaking',
      'find movement or action',
      'look for text on screen',
      'find an outdoor scene',
      'find a close-up reaction',
    ];
  }

  const segments =
    (artifacts.segments as Array<{ visualObjects?: string[]; actions?: string[]; title?: string }>) || [];
  const detected: string[] = [];

  for (const seg of segments) {
    if (seg.title && seg.title.length > 3 && seg.title.length < 35 && !seg.title.startsWith('Scene')) {
      if (!detected.includes(seg.title)) detected.push(seg.title);
    }
    for (const obj of seg.visualObjects || []) {
      if (obj && !detected.includes(obj)) detected.push(obj);
    }
    for (const act of seg.actions || []) {
      if (act && !detected.includes(act)) detected.push(act);
    }
    if (detected.length >= 6) break;
  }

  return detected.length > 0
    ? detected.slice(0, 6)
    : [
        'find a person speaking',
        'find movement or action',
        'look for text on screen',
        'find an outdoor scene',
      ];
}
