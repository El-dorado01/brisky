import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connector, SourceLocator } from './connector.interface';
import * as fs from 'fs';
import * as path from 'path';
import {
  assertPathWithinRoot,
  guessMime,
  resolveFromRepo,
  sanitizeFilename,
  validateAssetId,
} from '../../common/repo-paths';

@Injectable()
export class UploadConnector implements Connector {
  private readonly logger = new Logger(UploadConnector.name);
  readonly type = 'upload';
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

  async discover(): Promise<string[]> {
    if (!fs.existsSync(this.uploadDir)) return [];
    return fs
      .readdirSync(this.uploadDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  async ingestLocalFile(
    assetId: string,
    sourcePath: string,
    originalFilename: string,
  ): Promise<string> {
    const dest = this.destinationPath(assetId, originalFilename);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(sourcePath, dest);
    this.logger.log(`Ingested ${originalFilename} for ${assetId} -> ${dest}`);
    return dest;
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

    this.logger.log(`Stored upload stream for ${assetId} -> ${dest} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
    return dest;
  }

  async getSourceLocator(assetId: string): Promise<SourceLocator> {
    const validId = validateAssetId(assetId);
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
    return {
      type: 'upload',
      path: fullPath,
      originalFilename: filename,
      mimeType: guessMime(fullPath) || 'video/mp4',
    };
  }

  async getByteRange(
    assetId: string,
    start: number,
    length?: number,
  ): Promise<NodeJS.ReadableStream> {
    const locator = await this.getSourceLocator(assetId);
    const end = length !== undefined ? start + length - 1 : undefined;
    return fs.createReadStream(locator.path, { start, end });
  }

  async deleteSource(assetId: string): Promise<boolean> {
    const validId = validateAssetId(assetId);
    const destDir = assertPathWithinRoot(path.join(this.uploadDir, validId), this.uploadDir);
    if (!fs.existsSync(destDir)) return false;
    fs.rmSync(destDir, { recursive: true, force: true });
    this.logger.log(`Deleted upload source for ${validId}`);
    return true;
  }

  private destinationPath(assetId: string, originalFilename: string): string {
    const validId = validateAssetId(assetId);
    const dest = path.join(this.uploadDir, validId, sanitizeFilename(originalFilename));
    return assertPathWithinRoot(dest, this.uploadDir);
  }
}
