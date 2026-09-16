import * as fs from 'fs';
import * as path from 'path';
import { ProxyCacheService } from './proxy-cache.service';

describe('Proxy Cache LRU Eviction Seam (Phase F3)', () => {
  let cacheService: ProxyCacheService;
  let mockDb: any;
  let mockConfig: any;

  const testCacheDir = path.join(__dirname, '../../../test-storage-proxy-cache');

  beforeAll(() => {
    fs.mkdirSync(testCacheDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    mockConfig = {
      get: jest.fn((key: string, fallback: any) => {
        if (key === 'PROXY_CACHE_MAX_BYTES') return 1500; // 1.5 KB cap for testing
        return fallback;
      }),
    };

    cacheService = new ProxyCacheService(mockConfig, mockDb, testCacheDir);
  });

  it('evicts least recently accessed proxies when cache size exceeds cap and resets asset proxy_status to none', async () => {
    const fileOld = path.join(testCacheDir, 'asset_old.mp4');
    const fileNew = path.join(testCacheDir, 'asset_new.mp4');

    // Create 2 files of 1000 bytes each (total 2000 bytes > 1500 bytes cap)
    fs.writeFileSync(fileOld, Buffer.alloc(1000, 'a'));
    fs.writeFileSync(fileNew, Buffer.alloc(1000, 'b'));

    // Set fileOld to be older than fileNew
    const pastTime = new Date(Date.now() - 100000);
    fs.utimesSync(fileOld, pastTime, pastTime);

    const evicted = await cacheService.enforceLimit();

    // 1. Evicted the oldest file
    expect(evicted).toContain('asset_old');
    expect(fs.existsSync(fileOld)).toBe(false);

    // 2. Kept the newer file
    expect(fs.existsSync(fileNew)).toBe(true);

    // 3. Updated database to mark evicted asset proxy_status as none
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("SET proxy_status = 'none'"),
      expect.arrayContaining(['asset_old']),
    );
  });
});
