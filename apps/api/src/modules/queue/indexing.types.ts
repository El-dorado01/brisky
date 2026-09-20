export type JobType =
  | 'index_asset'
  | 'plan_asset'
  | 'extract_audio'
  | 'transcribe'
  | 'analyze_frames'
  | 'gemini_video'
  | 'embed'
  | 'finalize_asset'
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
  unitId?: string;
  indexVersion?: number;
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

export const INDEX_UNIT_JOB_TYPES: JobType[] = [
  'transcribe',
  'extract_audio',
  'analyze_frames',
  'gemini_video',
  'embed',
  'finalize_asset',
];

export function isIndexUnitJob(jobType: JobType | string | undefined): boolean {
  return INDEX_UNIT_JOB_TYPES.includes(jobType as JobType);
}

export function unitTypeToJobType(unitType: string): JobType {
  switch (unitType) {
    case 'transcribe':
      return 'transcribe';
    case 'analyze_frames':
      return 'analyze_frames';
    case 'gemini_video':
      return 'gemini_video';
    case 'embed':
      return 'embed';
    case 'finalize_asset':
      return 'finalize_asset';
    default:
      return 'analyze_frames';
  }
}

export function normalizeJobEnvelope(data: any): FactoryJobEnvelope {
  if (data?.job_type) {
    const jobType: JobType =
      data.job_type === 'index_asset' ? 'plan_asset' : data.job_type;
    return {
      job_id: data.job_id || data.jobId,
      job_type: jobType,
      asset_id: data.asset_id || data.assetId,
      user_id: data.user_id || data.userId,
      source: data.source || { provider: 'unknown' },
      segment: data.segment !== undefined ? data.segment : null,
      priority: data.priority || 'normal',
      attempt: data.attempt || 1,
      processing_config: data.processing_config || {},
    };
  }

  // Legacy IndexingJobData fallback — library index is a plan_asset parent.
  const provider = data.provider || (data.sourceType === 'drive' ? 'google_drive' : 'upload');
  return {
    job_id: undefined,
    job_type: 'plan_asset',
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
