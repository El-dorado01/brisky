import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { stageCloudSource } from './cloud-inspection-source';
import { reserveCloudBytes, withSearchProgress } from '../../common/search-progress';
import { MediaService } from './media.service';
import { ConfigService } from '@nestjs/config';

describe('bounded cloud inspection staging', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-cloud-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it('stages a bounded source and deletes it after inspection', async () => {
    const staged = await stageCloudSource(root, 10, async () => Readable.from([Buffer.from('media')]));
    expect(fs.readFileSync(staged.path, 'utf8')).toBe('media');
    staged.cleanup();
    expect(fs.existsSync(staged.path)).toBe(false);
  });
  it('stops an oversized response even if a server ignores the requested range', async () => {
    await expect(stageCloudSource(root, 2, async () => Readable.from([Buffer.from('too large')]))).rejects.toThrow('byte limit');
    expect(fs.readdirSync(path.join(root, 'scratch', 'cloud-inspection'))).toEqual([]);
  });
  it('limits total reserved cloud bytes across concurrent candidate inspections', async () => {
    await withSearchProgress(false, () => undefined, async () => {
      expect(reserveCloudBytes(16, 32)).toBe(true);
      expect(reserveCloudBytes(16, 32)).toBe(true);
      expect(reserveCloudBytes(1, 32)).toBe(false);
    });
    expect(reserveCloudBytes(1, 32)).toBe(false);
  });
  it('rejects a truncated source rather than inspecting an incomplete master', async () => {
    await expect(stageCloudSource(root, 10, async () => Readable.from([Buffer.from('short')]), 10))
      .rejects.toThrow('incomplete or changed');
    expect(fs.readdirSync(path.join(root, 'scratch', 'cloud-inspection'))).toEqual([]);
  });
  it('shares an authorized asset download across inspection windows and cleans it at request completion', async () => {
    const source = { original_path: null, proxy_path: null, source_type: 'drive',
      connector_account_id: 'account', external_file_id: 'file', file_size: '5' };
    const read = jest.fn(async () => Readable.from([Buffer.from('media')]));
    const paths: string[] = [];
    const evidenceCleanups: jest.Mock[] = [];
    const service: any = Object.create(MediaService.prototype);
    Object.assign(service, { storageRoot: root,
      configService: new ConfigService({ SEARCH_CLOUD_SOURCE_MAX_MB: 1, SEARCH_CLOUD_TOTAL_MB: 1 }),
      db: { query: jest.fn().mockResolvedValue({ rows: [source] }) },
      connectorRegistry: { get: () => ({ getByteRange: read }) },
      connectorsService: { getAuthContext: jest.fn().mockResolvedValue({}) },
      searchEvidenceService: { prepare: jest.fn(async (file: string) => {
        expect(fs.readFileSync(file, 'utf8')).toBe('media');
        paths.push(file);
        const cleanup = jest.fn(); evidenceCleanups.push(cleanup);
        return { frames: [], kind: 'original', cleanup };
      }) },
    });
    await withSearchProgress(false, () => {}, async () => {
      const candidate = { assetId: 'asset', startTime: 0, endTime: 5 };
      const evidence = await Promise.all([service.prepareSearchEvidence(candidate, 'detail', 'owner'),
        service.prepareSearchEvidence({ ...candidate, startTime: 5, endTime: 10 }, 'sequence', 'owner')]);
      evidence.forEach((item: any) => item.cleanup());
      (await service.prepareSearchEvidence(candidate, 'detail', 'owner')).cleanup();
      expect(read).toHaveBeenCalledTimes(1);
      expect(new Set(paths).size).toBe(1);
      expect(fs.existsSync(paths[0])).toBe(true);
      expect(service.connectorsService.getAuthContext).toHaveBeenCalledWith('account', 'owner');
    });
    expect(fs.existsSync(paths[0])).toBe(false);
    expect(evidenceCleanups.every((cleanup) => cleanup.mock.calls.length === 1)).toBe(true);
  });
  it('reuses a seekable reader for large authorized source inspections without a complete download', async () => {
    const size = 100 * 1024 * 1024;
    const openReadSession = jest.fn().mockResolvedValue({ size, version: 'v1', read: jest.fn(),
      validate: jest.fn().mockResolvedValue(undefined) });
    const getByteRange = jest.fn();
    const endpoints: string[] = [];
    const service: any = Object.create(MediaService.prototype);
    Object.assign(service, { storageRoot: root, logger: { warn: jest.fn() },
      configService: new ConfigService({ SEARCH_CLOUD_SOURCE_MAX_MB: 1, SEARCH_CLOUD_TOTAL_MB: 2 }),
      db: { query: jest.fn().mockResolvedValue({ rows: [{ original_path: null, proxy_path: null,
        source_type: 'drive', connector_account_id: 'account', external_file_id: 'file', file_size: String(size) }] }) },
      connectorRegistry: { get: () => ({ openReadSession, getByteRange }) },
      connectorsService: { getAuthContext: jest.fn().mockResolvedValue({}) },
      searchEvidenceService: { prepareRemote: jest.fn(async (reader: any) => {
        endpoints.push(reader.url);
        return { frames: [], kind: 'original', cleanup: jest.fn() };
      }) },
    });
    await withSearchProgress(false, () => {}, async () => {
      const candidate = { assetId: 'asset', startTime: 0, endTime: 5 };
      const evidence = await Promise.all([service.prepareSearchEvidence(candidate, 'detail', 'owner'),
        service.prepareSearchEvidence(candidate, 'sequence', 'owner')]);
      evidence.forEach((item: any) => item.cleanup());
      expect(openReadSession).toHaveBeenCalledTimes(1);
      expect(new Set(endpoints).size).toBe(1);
      expect(getByteRange).not.toHaveBeenCalled();
    });
    await expect(fetch(endpoints[0])).rejects.toThrow();
  });
});
