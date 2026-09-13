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
}

export interface IndexingStats {
  discovered: number;
  indexed: number;
  processing: number;
  queued: number;
  failed: number;
  remaining: number;
  activeAsset?: {
    assetId: string;
    filename: string;
    stage: string;
    progress: number;
  };
}
