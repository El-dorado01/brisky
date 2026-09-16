import { IndexingProcessor } from './indexing.processor';
import { FactoryJobEnvelope } from './indexing.types';

describe('Demand-Driven Proxy Seam (Phase F3)', () => {
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
          return { rows: [{ id: 'asset_demand_1', status: 'processing', availability: 'available' }] };
        }
        if (sql.includes('FROM indexing_jobs WHERE')) {
          return { rows: [{ cancel_requested: false, status: 'active' }] };
        }
        return { rows: [] };
      }),
    };
    mockFfmpeg = {
      probeMetadata: jest.fn().mockResolvedValue({
        duration: 20,
        width: 1920,
        height: 1080,
        fps: 30,
        codec: 'prores', // non-web-safe codec
        hasAudio: true,
      }),
      detectScenesAndExtractFrames: jest.fn().mockResolvedValue([
        { sceneId: 0, startTime: 0, endTime: 20, representativeTimestamp: 5, keyframePath: '', keyframes: [] },
      ]),
      generateThumbnail: jest.fn().mockResolvedValue('/thumb.jpg'),
      extractAudio: jest.fn().mockResolvedValue(true),
      generateProxy: jest.fn().mockResolvedValue('/proxy.mp4'),
    };
    mockGemini = {
      analyzeFrames: jest.fn().mockResolvedValue({ observations: [], usage: null }),
      analyzeVideo: jest.fn().mockResolvedValue({ analysis: {}, usage: null }),
      transcribeAudio: jest.fn().mockResolvedValue({ transcript: [], usage: null }),
      getPrimaryModel: jest.fn().mockReturnValue('gemini-2.5-flash'),
    };
    mockWhisper = {
      isAvailable: jest.fn().mockReturnValue(false),
    };
    mockMerger = {
      mergeAndPersist: jest.fn().mockResolvedValue({
        cost: { estimatedUsd: 0, costPerSourceMinuteUsd: 0, framesAnalyzed: 0, sceneCount: 1, indexDurationMs: 100 },
      }),
    };
    mockConfig = {
      get: jest.fn((key: string, fallback: any) => fallback),
    };
    mockRegistry = {
      get: jest.fn(),
    };
    mockConnectors = {
      getAuthContext: jest.fn(),
    };
    mockUnitsService = {
      planUnits: jest.fn().mockResolvedValue([]),
      getCompletedUnitIds: jest.fn().mockResolvedValue(new Set()),
      getCompletedUnits: jest.fn().mockResolvedValue(new Map()),
      hasFailedUnits: jest.fn().mockResolvedValue(false),
      markUnitCompleted: jest.fn().mockResolvedValue(undefined),
      markUnitFailed: jest.fn().mockResolvedValue(undefined),
    };

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

  it('does not eagerly generate a 720p proxy during index_asset and sets proxy_status to none', async () => {
    const jobEnvelope: FactoryJobEnvelope = {
      job_id: 'job_demand_1',
      job_type: 'index_asset',
      asset_id: 'asset_demand_1',
      user_id: 'user_1',
      source: {
        provider: 'upload',
        sourcePath: __filename,
        originalFilename: 'heavy_prores.mov',
        checksum: 'chk_demand_1',
        fileSize: 1000,
      },
      priority: 'normal',
    };

    const mockJob: any = {
      id: 'bull_demand_1',
      data: jobEnvelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await processor.process(mockJob);

    // 1. Fast thumbnail was generated (needed for search cards)
    expect(mockFfmpeg.generateThumbnail).toHaveBeenCalled();

    // 2. Audio was extracted for transcription
    expect(mockFfmpeg.extractAudio).toHaveBeenCalled();

    // 3. 720p proxy was NOT eagerly encoded
    expect(mockFfmpeg.generateProxy).not.toHaveBeenCalled();

    // 4. Final asset update set proxy_status = 'none' (not 'ready')
    const assetUpdateCalls = mockDb.query.mock.calls.filter((c: any[]) =>
      c[0]?.includes('UPDATE media_assets') && c[0]?.includes('status = $1'),
    );
    expect(assetUpdateCalls.length).toBeGreaterThan(0);
    const finalUpdate = assetUpdateCalls[assetUpdateCalls.length - 1];
    expect(finalUpdate[1]).toContain('none');
  });

  it('marks proxy_status = skipped if source is an upload that is already web-safe MP4', async () => {
    mockFfmpeg.probeMetadata.mockResolvedValueOnce({
      duration: 15,
      width: 1280,
      height: 720,
      fps: 30,
      codec: 'h264',
      hasAudio: true,
    });

    const jobEnvelope: FactoryJobEnvelope = {
      job_id: 'job_demand_2',
      job_type: 'index_asset',
      asset_id: 'asset_demand_1',
      user_id: 'user_1',
      source: {
        provider: 'upload',
        sourcePath: __filename,
        originalFilename: 'web_safe.mp4',
        checksum: 'chk_demand_2',
        fileSize: 1000,
      },
      priority: 'normal',
    };

    const mockJob: any = {
      id: 'bull_demand_2',
      data: jobEnvelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await processor.process(mockJob);

    expect(mockFfmpeg.generateProxy).not.toHaveBeenCalled();

    const assetUpdateCalls = mockDb.query.mock.calls.filter((c: any[]) =>
      c[0]?.includes('UPDATE media_assets') && c[0]?.includes('status = $1'),
    );
    const finalUpdate = assetUpdateCalls[assetUpdateCalls.length - 1];
    expect(finalUpdate[1]).toContain('skipped');
  });
});
