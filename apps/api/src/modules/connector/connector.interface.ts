export interface SourceLocator {
  type: 'upload' | 'local' | 'drive';
  path: string;
  originalFilename: string;
  mimeType: string;
}

export interface Connector {
  readonly type: string;

  discover(): Promise<string[]>;

  getSourceLocator(assetId: string): Promise<SourceLocator>;

  getByteRange(
    assetId: string,
    start: number,
    length?: number,
  ): Promise<NodeJS.ReadableStream>;

  onChanged?(callback: (assetId: string) => void): void;

  onDeleted?(callback: (assetId: string) => void): void;

  deleteSource?(assetId: string): Promise<boolean>;
}
