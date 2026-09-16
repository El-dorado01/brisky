import { Readable } from 'stream';
import { IndexingProcessor } from './indexing.processor';
import { FactoryJobEnvelope } from './indexing.types';

describe('Ranged Media Access & Fallback (Phase F4)', () => {
  let processor: IndexingProcessor;
  let mockDb: any;
  let mockFfmpeg: any;
  let mockGemini: any;
  let mockWhisper: any;
  let mockMerger: any;
  let mockConfig: any;
  let mockRegistry: any;
  let mockConnectors: any;
  let mockUnitsService: any;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('FROM media_assets WHERE id =')) {
          const is50Mb = sql.includes('50mb') || String(params?.[0] || '').includes('50mb');
          return {
            rows: [
              {
                id: is50Mb ? 'master_video_50mb' : 'master_video_10gb',
                status: 'indexed',
                availability: 'online',
                duration: is50Mb ? 120 : 3600,
                file_size: is50Mb ? 50 * 1024 * 1024 : 10 * 1024 * 1024 * 1024,
              },
            ],
          };
        }
        if (sql.includes('FROM indexing_jobs WHERE')) {
          return { rows: [{ cancel_requested: false, status: 'active' }] };
        }
        return { rows: [] };
      }),
    };
    mockFfmpeg = {
      probeMetadata: jest.fn(),
      detectScenesAndExtractFrames: jest.fn(),
      generateThumbnail: jest.fn().mockResolvedValue('/thumb.jpg'),
      extractAudio: jest.fn(),
      generateProxy: jest.fn(),
      extractClip: jest.fn().mockResolvedValue(undefined),
    };
    mockGemini = {};
    mockWhisper = {};
    mockMerger = {};
    mockConfig = {
      get: jest.fn((key: string, fallback: any) => fallback),
    };
    mockRegistry = {
      get: jest.fn(),
    };
    mockConnectors = {
      getAuthContext: jest.fn().mockResolvedValue({}),
    };
    mockUnitsService = {};

    processor = new IndexingProcessor(
      mockDb,
      mockFfmpeg,
      mockGemini,
      mockWhisper,
      mockMerger,
      mockConfig,
      mockRegistry,
      mockConnectors,
      mockUnitsService,
    );
  });

  it('uses getByteRange for clip extraction when connector supports can_range_read', async () => {
    const mockConnector = {
      capabilities: {
        can_read: true,
        can_write: true,
        can_stream: true,
        can_range_read: true,
        supports_webhooks: true,
        supports_signed_urls: false,
        supports_large_files: true,
      },
      getByteRange: jest.fn().mockImplementation(async () => {
        return Readable.from([Buffer.alloc(1024 * 100, 1)]); // 100 KB ranged slice
      }),
      downloadAsset: jest.fn(),
    };
    mockRegistry.get.mockReturnValue(mockConnector);

    const envelope: FactoryJobEnvelope = {
      job_id: 'job_ranged_clip_1',
      job_type: 'extract_clip',
      priority: 'normal',
      asset_id: 'master_video_10gb',
      user_id: 'user_1',
      segment: {
        start_s: 60,
        end_s: 75, // 15s clip
      },
      source: {
        provider: 'google_drive',
        remoteId: 'remote_10gb_file',
        connectorAccountId: 'acc_1',
        originalFilename: 'large_master.mp4',
        fileSize: 10 * 1024 * 1024 * 1024,
      },
    };

    const mockJob: any = {
      id: 'bull_ranged_clip_1',
      data: envelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
    };

    await processor.process(mockJob);

    // 1. Must have used getByteRange instead of downloading the whole 10GB file!
    expect(mockConnector.getByteRange).toHaveBeenCalled();
    expect(mockConnector.downloadAsset).not.toHaveBeenCalled();

    // 2. Verified that access_mode = 'range_read' was recorded on indexing_jobs
    const updateJobCalls = mockDb.query.mock.calls.filter(
      (c: any[]) => c[0].includes('UPDATE indexing_jobs') && c[0].includes('access_mode'),
    );
    expect(updateJobCalls.length).toBeGreaterThan(0);
    expect(updateJobCalls[0][1]).toContain('range_read');
  });

  it('falls back to full_download if ranged clip extraction encounters container/header failure', async () => {
    const mockConnector = {
      capabilities: {
        can_read: true,
        can_write: true,
        can_stream: true,
        can_range_read: true,
        supports_webhooks: true,
        supports_signed_urls: false,
        supports_large_files: true,
      },
      getByteRange: jest.fn().mockImplementation(async () => {
        return Readable.from([Buffer.alloc(1024, 0)]);
      }),
      downloadAsset: jest.fn().mockResolvedValue(undefined),
    };
    mockRegistry.get.mockReturnValue(mockConnector);

    // Make extractClip fail on the first attempt (ranged slice missing moov atom)
    // and succeed on the fallback full file
    mockFfmpeg.extractClip
      .mockRejectedValueOnce(new Error('moov atom not found'))
      .mockResolvedValueOnce(undefined);

    const envelope: FactoryJobEnvelope = {
      job_id: 'job_clip_fallback',
      job_type: 'extract_clip',
      priority: 'normal',
      asset_id: 'master_video_50mb',
      user_id: 'user_1',
      segment: {
        start_s: 100,
        end_s: 115,
      },
      source: {
        provider: 'google_drive',
        remoteId: 'remote_50mb_file',
        connectorAccountId: 'acc_1',
        originalFilename: 'master_50mb.mp4',
        fileSize: 50 * 1024 * 1024,
      },
    };

    const mockJob: any = {
      id: 'bull_clip_fallback',
      data: envelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
    };

    await processor.process(mockJob);

    // 1. Attempted getByteRange first
    expect(mockConnector.getByteRange).toHaveBeenCalled();

    // 2. Because moov atom failed, cleanly fell back to downloadAsset
    expect(mockConnector.downloadAsset).toHaveBeenCalled();

    // 3. Recorded access_mode = 'full_download' on indexing_jobs
    const updateJobCalls = mockDb.query.mock.calls.filter(
      (c: any[]) => c[0].includes('UPDATE indexing_jobs') && c[0].includes('access_mode'),
    );
    expect(updateJobCalls.length).toBeGreaterThan(0);
    expect(updateJobCalls[0][1]).toContain('full_download');
  });
});
