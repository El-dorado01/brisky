import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  MediaConnector,
  ConnectorAsset,
  ListAssetsOptions,
} from './media-connector.interface';
import {
  assertPathWithinRoot,
  guessMime,
  resolveFromRepo,
  sanitizeFilename,
  validateAssetId,
} from '../../common/repo-paths';

@Injectable()
export class UploadConnector implements MediaConnector {
  private readonly logger = new Logger(UploadConnector.name);
  readonly provider = 'upload';
  readonly type = 'upload'; // backwards compatibility
  private uploadDir: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = resolveFromRepo(
      this.configService.get<string>('UPLOAD_DIR', './storage/uploads'),
    );
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  getUploadRoot(): string {
    return this.uploadDir;
  }

  async listAssets(
    _auth?: any,
    _options?: ListAssetsOptions,
  ): Promise<{ assets: ConnectorAsset[]; nextCursor?: string }> {
    if (!fs.existsSync(this.uploadDir)) return { assets: [] };
    const dirs = fs
      .readdirSync(this.uploadDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const assets: ConnectorAsset[] = [];
    for (const dir of dirs) {
      try {
        const asset = await this.getAsset(undefined, dir);
        assets.push(asset);
      } catch {
        // skip empty or unreadable dirs
      }
    }
    return { assets };
  }

  async getAsset(_auth: any, remoteId: string): Promise<ConnectorAsset> {
    const validId = validateAssetId(remoteId);
    const destDir = assertPathWithinRoot(path.join(this.uploadDir, validId), this.uploadDir);
    if (!fs.existsSync(destDir)) {
      throw new Error(`Asset ${validId} not found in upload storage.`);
    }
    const files = fs.readdirSync(destDir).filter((f) => !f.startsWith('.'));
    if (files.length === 0) {
      throw new Error(`Asset ${validId} has no source file in upload storage.`);
    }
    const filename = files[0];
    const fullPath = assertPathWithinRoot(path.join(destDir, filename), this.uploadDir);
    const stat = fs.statSync(fullPath);

    return {
      remoteId: validId,
      name: filename,
      mimeType: guessMime(fullPath) || 'video/mp4',
      size: stat.size,
      modifiedTime: stat.mtime,
      path: fullPath,
    };
  }

  async downloadAsset(
    _auth: any,
    remoteId: string,
    destPath: string,
    _onProgress?: (percent: number) => void,
  ): Promise<void> {
    const asset = await this.getAsset(undefined, remoteId);
    if (!asset.path || !fs.existsSync(asset.path)) {
      throw new Error(`Upload asset ${remoteId} source file not found`);
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(asset.path, destPath);
  }

  async getByteRange(
    _auth: any,
    remoteId: string,
    start: number,
    length?: number,
  ): Promise<NodeJS.ReadableStream> {
    const asset = await this.getAsset(undefined, remoteId);
    const end = length !== undefined ? start + length - 1 : undefined;
    return fs.createReadStream(asset.path!, { start, end });
  }

  async deleteAsset(_auth: any, remoteId: string): Promise<boolean> {
    const validId = validateAssetId(remoteId);
    const destDir = assertPathWithinRoot(path.join(this.uploadDir, validId), this.uploadDir);
    if (!fs.existsSync(destDir)) return false;
    fs.rmSync(destDir, { recursive: true, force: true });
    this.logger.log(`Deleted upload source for ${validId}`);
    return true;
  }

  // Legacy helper methods for existing upload scaffold
  async discover(): Promise<string[]> {
    const res = await this.listAssets();
    return res.assets.map((a) => a.remoteId);
  }

  async deleteSource(assetId: string): Promise<boolean> {
    return this.deleteAsset(undefined, assetId);
  }

  async ingestStream(
    assetId: string,
    originalFilename: string,
    stream: NodeJS.ReadableStream,
  ): Promise<string> {
    const dest = this.destinationPath(assetId, originalFilename);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const write = fs.createWriteStream(dest);
      stream.pipe(write);
      write.on('finish', () => resolve());
      write.on('error', reject);
      stream.on('error', reject);
    });

    const stat = fs.statSync(dest);
    if (stat.size === 0) {
      try {
        fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
      throw new Error(`Uploaded file '${originalFilename}' is empty (0 bytes).`);
    }

    this.logger.log(
      `Stored upload stream for ${assetId} -> ${dest} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`,
    );
    return dest;
  }

  private destinationPath(assetId: string, originalFilename: string): string {
    const validId = validateAssetId(assetId);
    const dest = path.join(this.uploadDir, validId, sanitizeFilename(originalFilename));
    return assertPathWithinRoot(dest, this.uploadDir);
  }
}
