import { MediaService } from '../media/media.service';
import { NotFoundException } from '@nestjs/common';
import { resolveFromRepo } from '../../common/repo-paths';
import * as fs from 'fs';
import * as path from 'path';

describe('Zero-Shared-Disk Thumbnail Delivery (Phase F7 Seam 2)', () => {
  let mediaService: MediaService;
  let mockDb: any;
  let mockConfig: any;
  let mockIndexingService: any;
  let mockGemini: any;
  let mockLocalEmbedding: any;
  let mockUploadConnector: any;

  const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const sampleDataUri = `data:image/jpeg;base64,${sampleBase64}`;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    };

    mockConfig = {
      get: jest.fn((key: string, def?: any) => {
        if (key === 'STORAGE_ROOT') return './test-storage-f7-zerodisk';
        return def;
      }),
    };

    mockIndexingService = {
      enqueueAsset: jest.fn(),
    };

    mockGemini = {};
    mockLocalEmbedding = {};
    mockUploadConnector = {};

    mediaService = new MediaService(
      mockConfig,
      mockDb,
      mockIndexingService,
      mockGemini as any,
      mockLocalEmbedding as any,
      mockUploadConnector as any,
    );
  });

  afterAll(() => {
    const testDir = resolveFromRepo('./test-storage-f7-zerodisk');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('serves thumbnail from database thumbnail_data with zero local disk access', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'asset_remote_1',
          parent_asset_id: null,
          thumbnail_data: sampleDataUri,
        },
      ],
    });

    const result = await mediaService.getThumbnail('asset_remote_1', 'user_1');

    expect(result.buffer).toBeDefined();
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.buffer!.toString('base64')).toBe(sampleBase64);
  });

  it('falls back to parent asset thumbnail_data in DB for derived clips without local files', async () => {
    // 1. Query for clip: returns clip with parent_asset_id, but null thumbnail_data
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'clip_remote_1',
          parent_asset_id: 'asset_parent_1',
          thumbnail_data: null,
        },
      ],
    });

    // 2. Query for parent: returns parent's thumbnail_data
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          thumbnail_data: sampleDataUri,
        },
      ],
    });

    const result = await mediaService.getThumbnail('clip_remote_1', 'user_1');

    expect(result.buffer).toBeDefined();
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.buffer!.toString('base64')).toBe(sampleBase64);
  });

  it('hydrates a missing local proxy from connector proxy_remote_id', async () => {
    const destDir = resolveFromRepo('./test-storage-f7-zerodisk/proxies');
    const destPath = path.join(destDir, 'asset_remote_1.mp4');
    const mockConnectors = {
      getAuthContext: jest.fn().mockResolvedValue({}),
    };
    const mockRegistry = {
      get: jest.fn().mockReturnValue({
        downloadAsset: jest.fn().mockImplementation(async (_auth: unknown, _id: string, dest: string) => {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, Buffer.alloc(64, 1));
        }),
      }),
    };
    const svc = new MediaService(
      mockConfig,
      mockDb,
      mockIndexingService,
      mockGemini as any,
      mockLocalEmbedding as any,
      mockUploadConnector as any,
      undefined,
      mockConnectors as any,
      mockRegistry as any,
    );

    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'asset_remote_1',
          user_id: 'user_1',
          status: 'indexed',
          proxy_status: 'ready',
          proxy_path: destPath,
          original_path: '',
          original_filename: 'lecture.mp4',
          source_type: 'google_drive',
          external_file_id: 'orig',
          connector_account_id: 'acc_1',
          checksum: 'x',
          file_size: 10,
          proxy_remote_id: 'drive_proxy_1',
        },
      ],
    });
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const info = await svc.getStreamInfo('asset_remote_1', 'user_1');
    expect(info.status).toBe('ready');
    if (info.status === 'ready') {
      expect(fs.existsSync(info.filePath)).toBe(true);
    }
    expect(mockRegistry.get).toHaveBeenCalled();
  });

  it('hydrates a missing local derived clip from connector proxy_remote_id using parent connector account', async () => {
    const destDir = resolveFromRepo('./test-storage-f7-zerodisk/clips');
    const destPath = path.join(destDir, 'clip_remote_1.mp4');
    const mockConnectors = {
      getAuthContext: jest.fn().mockResolvedValue({}),
    };
    const mockRegistry = {
      get: jest.fn().mockReturnValue({
        downloadAsset: jest.fn().mockImplementation(async (_auth: unknown, _id: string, dest: string) => {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, Buffer.alloc(128, 2));
        }),
      }),
    };
    const svc = new MediaService(
      mockConfig,
      mockDb,
      mockIndexingService,
      mockGemini as any,
      mockLocalEmbedding as any,
      mockUploadConnector as any,
      undefined,
      mockConnectors as any,
      mockRegistry as any,
    );

    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'clip_remote_1',
          user_id: 'user_1',
          status: 'indexed',
          proxy_status: 'ready',
          proxy_path: destPath,
          original_path: destPath,
          original_filename: 'clip_lecture_0s_10s.mp4',
          source_type: 'google_drive',
          external_file_id: null,
          connector_account_id: 'acc_parent_1',
          checksum: 'clip_crc',
          file_size: 128,
          proxy_remote_id: 'drive_clip_1',
          parent_asset_id: 'asset_parent_1',
        },
      ],
    });
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const info = await svc.getStreamInfo('clip_remote_1', 'user_1');
    expect(info.status).toBe('ready');
    if (info.status === 'ready') {
      expect(info.filePath).toBe(destPath);
      expect(fs.existsSync(info.filePath)).toBe(true);
      expect(fs.statSync(info.filePath).size).toBe(128);
    }
    expect(mockRegistry.get).toHaveBeenCalledWith('google_drive');
  });

  it('hydrates from a worker container proxy_path without treating /app/storage as local', async () => {
    const destDir = resolveFromRepo('./test-storage-f7-zerodisk/proxies');
    const localPath = path.join(destDir, 'asset_foreign_1.mp4');
    const mockConnectors = {
      getAuthContext: jest.fn().mockResolvedValue({}),
    };
    const mockRegistry = {
      get: jest.fn().mockReturnValue({
        downloadAsset: jest.fn().mockImplementation(async (_auth: unknown, _id: string, dest: string) => {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, Buffer.alloc(32, 3));
        }),
      }),
    };
    const svc = new MediaService(
      mockConfig,
      mockDb,
      mockIndexingService,
      mockGemini as any,
      mockLocalEmbedding as any,
      mockUploadConnector as any,
      undefined,
      mockConnectors as any,
      mockRegistry as any,
    );

    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'asset_foreign_1',
          user_id: 'user_1',
          status: 'indexed',
          proxy_status: 'ready',
          proxy_path: '/app/storage/proxies/asset_foreign_1.mp4',
          original_path: '',
          original_filename: 'lecture.mp4',
          source_type: 'google_drive',
          external_file_id: 'orig',
          connector_account_id: 'acc_1',
          checksum: 'x',
          file_size: 10,
          proxy_remote_id: 'drive_proxy_foreign',
        },
      ],
    });
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const info = await svc.getStreamInfo('asset_foreign_1', 'user_1');
    expect(info.status).toBe('ready');
    if (info.status === 'ready') {
      expect(info.filePath).toBe(localPath);
      expect(fs.existsSync(info.filePath)).toBe(true);
    }
    const persist = mockDb.query.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('proxy_path = $1'),
    );
    expect(persist?.[1]?.[0]).toBe('proxies/asset_foreign_1.mp4');
  });

  it('throws NotFoundException if neither DB thumbnail_data nor disk file exists', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'missing_asset',
          parent_asset_id: null,
          thumbnail_data: null,
        },
      ],
    });

    await expect(mediaService.getThumbnail('missing_asset', 'user_1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
