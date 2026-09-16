export interface SourceLocator {
  type: 'upload' | 'local' | 'drive';
  path?: string;
  externalFileId?: string;
  originalFilename: string;
  mimeType: string;
  webViewLink?: string;
}

export interface RemoteMediaFile {
  externalFileId: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime?: string;
  webViewLink?: string;
  md5Checksum?: string;
  folderId?: string;
}

export interface DriveFolderInfo {
  id: string;
  name: string;
}

import { ConnectorCapabilities } from './media-connector.interface';

export interface Connector {
  readonly type: string;
  readonly capabilities?: ConnectorCapabilities;

  discover(folderIds?: string[]): Promise<RemoteMediaFile[] | string[]>;

  getSourceLocator(assetId: string): Promise<SourceLocator>;

  getByteRange?(
    assetIdOrFileId: string,
    start: number,
    length?: number,
  ): Promise<NodeJS.ReadableStream>;

  onChanged?(callback: (assetId: string) => void): void;

  onDeleted?(callback: (assetId: string) => void): void;

  deleteSource?(assetId: string): Promise<boolean>;
}
