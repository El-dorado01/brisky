export type JobType =
  | 'index_asset'
  | 'extract_audio'
  | 'transcribe'
  | 'analyze_frames'
  | 'embed'
  | 'generate_proxy'
  | 'extract_clip';

export type JobPriority = 'interactive' | 'normal' | 'batch';

export interface JobSource {
  provider: string;
  connectorAccountId?: string;
  remoteId?: string;
  sourcePath?: string;
  originalFilename?: string;
  checksum?: string;
  fileSize?: number;
}

export interface JobSegment {
  start_s: number;
  end_s: number;
}

export interface JobProcessingConfig {
  analysisVersion?: number;
  model?: string;
  embeddingModel?: string;
  forceReindex?: boolean;
}

export interface FactoryJobEnvelope {
  job_id?: string;
  job_type: JobType;
  asset_id: string;
  user_id: string;
  source: JobSource;
  segment?: JobSegment | null;
  priority: JobPriority;
  attempt?: number;
  processing_config?: JobProcessingConfig;
}

export interface IndexingJobData {
  assetId: string;
  userId: string;
  provider?: string; // 'google_drive' | 'upload' | 'dropbox' | 'onedrive' | 's3'
  remoteId?: string; // provider_asset_id
  connectorAccountId?: string;
  sourcePath: string;
  originalFilename: string;
  checksum: string;
  fileSize: number;
  sourceType?: 'upload' | 'drive' | 'local';
  externalFileId?: string;
  forceReindex?: boolean;
  priority?: JobPriority;
}

export type WaitingReason = 'user_slot' | 'global_capacity';

export interface IndexingStats {
  discovered: number;
  indexed: number;
  processing: number;
  queued: number;
  failed: number;
  remaining: number;
  activeWorkers?: number;
  activeAsset?: {
    assetId: string;
    filename: string;
    stage: string;
    progress: number;
  };
  // Phase F5: Scheduler Telemetry
  globalMaxSlots?: number;
  defaultUserSlots?: number;
  activeSlots?: number;
  waitingForSlot?: number;
  waitingReasons?: {
    user_slot: number;
    global_capacity: number;
  };
}

export function priorityToBullNumber(priority?: JobPriority, fileSizeMb?: number): number {
  const sizeOffset = Math.min(4, Math.max(0, Math.floor((fileSizeMb || 0) / 100)));
  switch (priority) {
    case 'interactive':
      return 1;
    case 'batch':
      return 10 + sizeOffset;
    case 'normal':
    default:
      return 5 + sizeOffset;
  }
}

export function normalizeJobEnvelope(data: any): FactoryJobEnvelope {
  if (data?.job_type) {
    return {
      job_id: data.job_id || data.jobId,
      job_type: data.job_type,
      asset_id: data.asset_id || data.assetId,
      user_id: data.user_id || data.userId,
      source: data.source || { provider: 'unknown' },
      segment: data.segment !== undefined ? data.segment : null,
      priority: data.priority || 'normal',
      attempt: data.attempt || 1,
      processing_config: data.processing_config || {},
    };
  }

  // Legacy IndexingJobData fallback
  const provider = data.provider || (data.sourceType === 'drive' ? 'google_drive' : 'upload');
  return {
    job_id: undefined,
    job_type: 'index_asset',
    asset_id: data.assetId,
    user_id: data.userId,
    source: {
      provider,
      connectorAccountId: data.connectorAccountId,
      remoteId: data.remoteId || data.externalFileId,
      sourcePath: data.sourcePath || '',
      originalFilename: data.originalFilename || '',
      checksum: data.checksum || '',
      fileSize: data.fileSize || 0,
    },
    segment: null,
    priority: data.priority || 'normal',
    attempt: 1,
    processing_config: {
      forceReindex: Boolean(data.forceReindex),
    },
  };
}
