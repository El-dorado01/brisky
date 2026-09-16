export interface ConnectorAsset {
  remoteId: string; // provider_asset_id
  name: string;
  mimeType: string;
  size: number;
  modifiedTime?: Date;
  version?: string;
  path?: string;
  webViewLink?: string;
  md5Checksum?: string;
  metadata?: Record<string, any>;
}

export interface ConnectorFolder {
  id: string;
  name: string;
  parentId?: string;
}

export interface ConnectorChanges {
  added: ConnectorAsset[];
  modified: ConnectorAsset[];
  deleted: string[]; // remoteIds
  newCursor?: string;
}

export interface ListAssetsOptions {
  folderIds?: string[];
  cursor?: string;
  pageSize?: number;
}

export interface ConnectorCapabilities {
  can_read: boolean;
  can_write: boolean;
  can_stream: boolean;
  can_range_read: boolean;
  supports_webhooks: boolean;
  supports_signed_urls: boolean;
  supports_large_files: boolean;
}

/**
 * Standard MediaConnector interface as defined in 03-media-storage-brief.md Section 7.
 * Application logic and the intelligence pipeline interact ONLY with this abstraction,
 * making storage providers completely swappable (Google Drive, Dropbox, OneDrive, S3, Upload).
 */
export interface MediaConnector<TAuth = any> {
  readonly provider: string;
  readonly capabilities?: ConnectorCapabilities;

  authenticate?(credentials: any): Promise<TAuth>;

  listAssets(
    auth: TAuth,
    options?: ListAssetsOptions,
  ): Promise<{ assets: ConnectorAsset[]; nextCursor?: string }>;

  listFolders?(auth: TAuth, parentFolderId?: string): Promise<ConnectorFolder[]>;

  getAsset(auth: TAuth, remoteId: string): Promise<ConnectorAsset>;

  getMetadata?(auth: TAuth, remoteId: string): Promise<Record<string, any>>;

  downloadAsset(
    auth: TAuth,
    remoteId: string,
    destPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<void>;

  uploadAsset?(
    auth: TAuth,
    remoteFolderId: string,
    sourcePath: string,
    filename: string,
  ): Promise<ConnectorAsset>;

  createFolder?(auth: TAuth, name: string, parentFolderId?: string): Promise<ConnectorFolder>;

  deleteAsset?(auth: TAuth, remoteId: string): Promise<boolean>;

  getByteRange?(
    auth: TAuth,
    remoteId: string,
    start: number,
    length?: number,
  ): Promise<NodeJS.ReadableStream>;

  watchChanges?(auth: TAuth, callbackUrl: string): Promise<{ channelId: string; resourceId: string }>;

  getStartCursor?(auth: TAuth): Promise<string>;

  getChanges?(auth: TAuth, cursor: string): Promise<ConnectorChanges>;
}
