import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import { resolveFromRepo } from '../../common/repo-paths';

@Injectable()
export class ProxyCacheService {
  private readonly logger = new Logger(ProxyCacheService.name);
  private readonly proxyDir: string;
  private readonly maxBytes: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
    @Optional() customProxyDir?: string,
  ) {
    const storageRoot = resolveFromRepo(
      this.configService.get<string>('STORAGE_ROOT', './storage'),
    );
    this.proxyDir = customProxyDir || path.join(storageRoot, 'proxies');
    const maxGb = Number(this.configService.get<number>('PROXY_CACHE_MAX_GB', 10));
    const explicitBytes = this.configService.get<number>('PROXY_CACHE_MAX_BYTES');
    this.maxBytes = explicitBytes ? Number(explicitBytes) : maxGb * 1024 * 1024 * 1024;
  }

  recordAccess(assetId: string): void {
    const filePath = path.join(this.proxyDir, `${assetId}.mp4`);
    if (fs.existsSync(filePath)) {
      try {
        const now = new Date();
        fs.utimesSync(filePath, now, now);
      } catch {
        // ignore
      }
    }
  }

  async enforceLimit(): Promise<string[]> {
    if (!fs.existsSync(this.proxyDir)) return [];

    const entries = fs.readdirSync(this.proxyDir)
      .filter((file) => file.endsWith('.mp4'))
      .map((file) => {
        const fullPath = path.join(this.proxyDir, file);
        try {
          const stat = fs.statSync(fullPath);
          return {
            assetId: path.basename(file, '.mp4'),
            fullPath,
            size: stat.size,
            atimeMs: stat.atimeMs || stat.mtimeMs,
          };
        } catch {
          return null;
        }
      })
      .filter((e): e is NonNullable<typeof e> => Boolean(e));

    let totalBytes = entries.reduce((acc, e) => acc + e.size, 0);
    if (totalBytes <= this.maxBytes) return [];

    // Sort ascending by atimeMs (oldest accessed first)
    entries.sort((a, b) => a.atimeMs - b.atimeMs);

    const evictedAssetIds: string[] = [];

    for (const entry of entries) {
      if (totalBytes <= this.maxBytes) break;
      try {
        fs.unlinkSync(entry.fullPath);
        totalBytes -= entry.size;
        evictedAssetIds.push(entry.assetId);
        await this.db.query(
          `UPDATE media_assets SET proxy_status = 'none', proxy_path = NULL, updated_at = NOW() WHERE id = $1`,
          [entry.assetId],
        );
        this.logger.log(`[LRU Proxy Cache] Evicted ${entry.assetId}.mp4 (${(entry.size / (1024 * 1024)).toFixed(2)} MB)`);
      } catch (err) {
        this.logger.warn(`Could not evict proxy file ${entry.fullPath}: ${err}`);
      }
    }

    return evictedAssetIds;
  }
}
