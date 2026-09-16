import * as fs from 'fs';
import * as path from 'path';
import { IndexingProcessor } from './indexing.processor';
import { FactoryJobEnvelope } from './indexing.types';

describe('Bounded Scratch Management & Master Purge (Phase F4)', () => {
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

  const testStorage = path.join(__dirname, '../../../test-storage-f4-scratch');
  const testScratchRoot = path.join(testStorage, 'scratch');

  beforeAll(() => {
    fs.mkdirSync(testScratchRoot, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(testStorage, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('FROM media_assets WHERE id =')) {
          return { rows: [{ id: 'asset_f4_1', status: 'processing', file_size: 1024 }] };
        }
        if (sql.includes('FROM indexing_jobs WHERE')) {
          return { rows: [{ cancel_requested: false, status: 'active' }] };
        }
        return { rows: [] };
      }),
    };
    mockFfmpeg = {
      probeMetadata: jest.fn().mockResolvedValue({
        duration: 10,
        width: 1920,
        height: 1080,
        fps: 30,
        codec: 'h264',
        hasAudio: true,
      }),
      detectScenesAndExtractFrames: jest.fn().mockResolvedValue([]),
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
        metadata: {},
        scenes: [],
        visualObservations: [],
        transcriptCues: [],
        segments: [],
        cost: { indexDurationMs: 100 },
      }),
    };
    mockRegistry = {
      get: jest.fn().mockReturnValue({
        downloadAsset: jest.fn().mockImplementation(async (_auth, _remoteId, destPath) => {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.writeFileSync(destPath, Buffer.alloc(1024, 0));
        }),
      }),
    };
    mockConnectors = {
      getAuthContext: jest.fn().mockResolvedValue({}),
    };
    mockUnitsService = {
      planUnits: jest.fn().mockResolvedValue([]),
      getCompletedUnits: jest.fn().mockResolvedValue([]),
      hasFailedUnits: jest.fn().mockResolvedValue(false),
      markUnitCompleted: jest.fn().mockResolvedValue(undefined),
      markUnitFailed: jest.fn().mockResolvedValue(undefined),
      isUnitCompleted: jest.fn().mockResolvedValue(false),
    };
  });

  it('fails with scratch_exhausted if incoming master exceeds WORKER_FULL_DOWNLOAD_MAX_MB', async () => {
    mockConfig = {
      get: jest.fn((key: string, fallback: any) => {
        if (key === 'STORAGE_ROOT') return testStorage;
        if (key === 'WORKER_SCRATCH_MAX_MB') return 1;
        if (key === 'WORKER_FULL_DOWNLOAD_MAX_MB') return 1;
        return fallback;
      }),
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

    const envelope: FactoryJobEnvelope = {
      job_id: 'job_scratch_exceeded',
      job_type: 'index_asset',
      priority: 'normal',
      asset_id: 'asset_giant',
      user_id: 'user_1',
      source: {
        provider: 'google_drive',
        remoteId: 'giant_drive_file',
        connectorAccountId: 'acc_1',
        originalFilename: 'giant.mp4',
        fileSize: 10 * 1024 * 1024, // 10 MB > 1 MB cap
      },
    };

    const mockJob: any = {
      id: 'bull_scratch_exceeded',
      data: envelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await expect(processor.process(mockJob)).rejects.toThrow(/WORKER_FULL_DOWNLOAD_MAX_MB/);
  });

  it('does not apply WORKER_SCRATCH_MAX_MB to a full-file Drive download', async () => {
    mockConfig = {
      get: jest.fn((key: string, fallback: any) => {
        if (key === 'STORAGE_ROOT') return testStorage;
        if (key === 'WORKER_SCRATCH_MAX_MB') return 1;
        return fallback;
      }),
    };

    mockRegistry.get.mockReturnValue({
      downloadAsset: jest.fn().mockImplementation(async (_auth, _remoteId, destPath) => {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, Buffer.alloc(1024, 0));
      }),
    });

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

    const envelope: FactoryJobEnvelope = {
      job_id: 'job_scratch_not_full_cap',
      job_type: 'index_asset',
      priority: 'normal',
      asset_id: 'asset_f4_1',
      user_id: 'user_1',
      source: {
        provider: 'google_drive',
        remoteId: 'drive_file',
        connectorAccountId: 'acc_1',
        originalFilename: 'lecture.mp4',
        fileSize: 10 * 1024 * 1024,
      },
    };

    const mockJob: any = {
      id: 'bull_scratch_not_full_cap',
      data: envelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await expect(processor.process(mockJob)).resolves.toBeUndefined();
  });

  it('runs Gemini video analysis while the master is on disk, then purges it', async () => {
    mockConfig = {
      get: jest.fn((key: string, fallback: any) => {
        if (key === 'STORAGE_ROOT') return testStorage;
        if (key === 'WORKER_SCRATCH_MAX_MB') return 512;
        return fallback;
      }),
    };

    let masterPathInScratch = '';
    mockRegistry.get.mockReturnValue({
      downloadAsset: jest.fn().mockImplementation(async (_auth, _remoteId, destPath) => {
        masterPathInScratch = destPath;
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, 'mock-master-video-bytes');
      }),
    });

    let masterExistedDuringGeminiVideo = false;
    mockGemini.analyzeVideo.mockImplementation(async () => {
      masterExistedDuringGeminiVideo = fs.existsSync(masterPathInScratch);
      return { analysis: {}, usage: null };
    });

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

    const envelope: FactoryJobEnvelope = {
      job_id: 'job_master_purge',
      job_type: 'index_asset',
      priority: 'normal',
      asset_id: 'asset_f4_1',
      user_id: 'user_1',
      source: {
        provider: 'google_drive',
        remoteId: 'drive_file_purge',
        connectorAccountId: 'acc_1',
        originalFilename: 'lecture.mp4',
        fileSize: 1024,
      },
    };

    const mockJob: any = {
      id: 'bull_master_purge',
      data: envelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await processor.process(mockJob);

    expect(masterPathInScratch).toBeTruthy();
    expect(masterExistedDuringGeminiVideo).toBe(true);
    expect(fs.existsSync(masterPathInScratch)).toBe(false);
    expect(mockGemini.analyzeVideo).toHaveBeenCalled();
  });
});
