import * as fs from 'fs';
import * as path from 'path';
import { MediaService } from './media.service';

describe('Derived Clip Playback & Fallbacks Seam (Phase F3)', () => {
  let mediaService: MediaService;
  let mockDb: any;
  let mockConfig: any;
  let mockGemini: any;
  let mockLocalEmbedding: any;
  let mockIndexingService: any;
  let mockUploadConnector: any;
  let mockProxyCache: any;

  const testStorage = path.join(__dirname, '../../../test-storage-derived-clip');
  const testClipsDir = path.join(testStorage, 'clips');
  const testThumbsDir = path.join(testStorage, 'thumbnails');

  beforeAll(() => {
    fs.mkdirSync(testClipsDir, { recursive: true });
    fs.mkdirSync(testThumbsDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testStorage)) {
      try {
        fs.rmSync(testStorage, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  });

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    mockConfig = {
      get: jest.fn((key: string, fallback: any) => {
        if (key === 'STORAGE_ROOT') return testStorage;
        return fallback;
      }),
    };
    mockGemini = {};
    mockLocalEmbedding = {};
    mockIndexingService = {
      enqueueAsset: jest.fn().mockResolvedValue('job_clip_1'),
    };
    mockUploadConnector = {};
    mockProxyCache = {
      recordAccess: jest.fn(),
    };

    mediaService = new MediaService(
      mockConfig,
      mockDb,
      mockIndexingService,
      mockGemini,
      mockLocalEmbedding,
      mockUploadConnector,
      mockProxyCache,
    );
  });

  it('streams derived clip directly from storage/clips without triggering on-demand proxy job', async () => {
    const clipFile = path.join(testClipsDir, 'clip_abc123.mp4');
    fs.writeFileSync(clipFile, 'clip_binary_data');

    mockDb.query.mockImplementation(async (sql: string) => {
      if (sql.includes('proxy_status') && sql.includes('FROM media_assets')) {
        return {
          rows: [
            {
              id: 'clip_abc123',
              user_id: 'user_1',
              status: 'indexed',
              proxy_status: 'ready',
              proxy_path: clipFile,
              original_path: clipFile,
              source_type: 'upload',
              file_size: 16,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const info = await mediaService.getStreamInfo('clip_abc123', 'user_1');

    expect(info.status).toBe('ready');
    if (info.status === 'ready') {
      expect(info.filePath).toBe(clipFile);
    }
    // Verified: No proxy generation job was enqueued
    expect(mockIndexingService.enqueueAsset).not.toHaveBeenCalled();
    expect(mockProxyCache.recordAccess).toHaveBeenCalledWith('clip_abc123');
  });

  it('falls back to parent asset thumbnail if derived clip thumbnail does not exist on disk', async () => {
    const parentThumb = path.join(testThumbsDir, 'parent_master_1.jpg');
    fs.writeFileSync(parentThumb, 'jpeg_header');

    mockDb.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM media_assets WHERE id =')) {
        return {
          rows: [
            {
              id: 'clip_xyz789',
              parent_asset_id: 'parent_master_1',
            },
          ],
        };
      }
      return { rows: [] };
    });

    const thumbPath = await mediaService.getThumbnailPath('clip_xyz789', 'user_1');
    expect(thumbPath).toBe(parentThumb);
  });
});
