export interface IndexingJobData {
  assetId: string;
  userId: string;
  sourcePath: string;
  originalFilename: string;
  checksum: string;
  fileSize: number;
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
