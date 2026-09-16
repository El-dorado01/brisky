import { IndexingProcessor } from './indexing.processor';
import { FactoryJobEnvelope } from './indexing.types';

describe('On-Demand Proxy Generation Seam (Phase F3)', () => {
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
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('FROM media_assets WHERE id =')) {
          return { rows: [{ id: 'asset_proxy_1', status: 'indexed', availability: 'available', proxy_status: 'none' }] };
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
      generateThumbnail: jest.fn(),
      extractAudio: jest.fn(),
      generateProxy: jest.fn().mockResolvedValue('/proxy.mp4'),
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
      getAuthContext: jest.fn(),
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

  it('processes generate_proxy job, calls ffmpeg to encode proxy, and sets proxy_status to ready', async () => {
    const envelope: FactoryJobEnvelope = {
      job_id: 'job_gen_proxy_1',
      job_type: 'generate_proxy',
      asset_id: 'asset_proxy_1',
      user_id: 'user_1',
      source: {
        provider: 'upload',
        sourcePath: __filename, // existing local file
        originalFilename: 'test.mp4',
        checksum: 'chk_p1',
        fileSize: 1000,
      },
      priority: 'interactive',
    };

    const mockJob: any = {
      id: 'bull_gen_1',
      data: envelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await processor.process(mockJob);

    // 1. Encoded proxy with ffmpeg
    expect(mockFfmpeg.generateProxy).toHaveBeenCalledWith(
      __filename,
      expect.stringContaining('asset_proxy_1.mp4'),
    );

    // 2. Updated media_assets proxy_status to ready
    const readyUpdate = mockDb.query.mock.calls.find((c: any[]) =>
      c[0]?.includes('UPDATE media_assets') && c[0]?.includes("proxy_status = 'ready'"),
    );
    expect(readyUpdate).toBeDefined();
    expect(readyUpdate[1]).toContain('asset_proxy_1');
  });

  it('triggers generate_proxy with interactive priority when getStreamInfo is called and proxy is none', async () => {
    const mockIndexingService: any = {
      enqueueAsset: jest.fn().mockResolvedValue('bull_job_auto_1'),
    };
    const mockDbService: any = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: 'asset_proxy_stream',
            user_id: 'user_1',
            status: 'indexed',
            proxy_status: 'none',
            original_path: '/non_existent.mov',
            original_filename: 'interview.mov',
            source_type: 'google_drive',
            external_file_id: 'drive_file_123',
            connector_account_id: 'acc_1',
            checksum: 'chk_123',
            file_size: 5000,
          },
        ],
      }),
    };

    const { MediaService } = await import('../media/media.service');
    const mediaService = new MediaService(
      mockConfig,
      mockDbService,
      mockIndexingService,
      mockGemini as any,
      mockMerger as any,
      {} as any,
    );

    const streamInfo = await mediaService.getStreamInfo('asset_proxy_stream', 'user_1');

    // 1. Returns preparing status
    expect(streamInfo.status).toBe('preparing');

    // 2. Enqueued generate_proxy job with interactive priority
    expect(mockIndexingService.enqueueAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        job_type: 'generate_proxy',
        priority: 'interactive',
        asset_id: 'asset_proxy_stream',
      }),
    );
  });
});
