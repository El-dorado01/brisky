import * as fs from 'fs';
import * as path from 'path';
import { IndexingProcessor } from './indexing.processor';
import { FactoryJobEnvelope } from './indexing.types';

describe('Scratch Isolation & Cooperative Cancellation Seam (Phase F1)', () => {
  let processor: IndexingProcessor;
  let mockDb: any;
  let mockFfmpeg: any;
  let mockGemini: any;
  let mockWhisper: any;
  let mockMerger: any;
  let mockConfig: any;
  let mockRegistry: any;
  let mockConnectors: any;

  const testStorage = path.join(__dirname, '../../../test-storage-f1');
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
      query: jest.fn().mockResolvedValue({ rows: [] }),
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
        cost: {
          estimatedUsd: 0,
          costPerSourceMinuteUsd: 0,
          framesAnalyzed: 0,
          sceneCount: 0,
          indexDurationMs: 100,
        },
      }),
    };
    mockConfig = {
      get: jest.fn((key: string, fallback: any) => {
        if (key === 'STORAGE_ROOT') return testStorage;
        return fallback;
      }),
    };
    mockRegistry = {
      get: jest.fn(),
    };
    mockConnectors = {
      getAuthContext: jest.fn(),
    };
    const mockUnitsService: any = {
      planUnits: jest.fn().mockResolvedValue([]),
      getCompletedUnitIds: jest.fn().mockResolvedValue(new Set()),
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

  it('isolates scratch directory by job_id when processing a typed FactoryJobEnvelope', async () => {
    const jobEnvelope: FactoryJobEnvelope = {
      job_id: 'job_isolated_999',
      job_type: 'index_asset',
      asset_id: 'asset_abc',
      user_id: 'user_1',
      source: {
        provider: 'upload',
        sourcePath: __filename, // use existing file so probe doesn't throw file not found
        originalFilename: 'test.mp4',
        checksum: 'unique_chk_123',
        fileSize: 1000,
      },
      priority: 'normal',
    };

    const mockJob: any = {
      id: 'bull_job_999',
      data: jobEnvelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    // Make checkCancelled simulate cancellation after stage 1 so we can inspect scratch
    // Mock DB queries:
    mockDb.query.mockImplementation(async (sql: string, params: any[]) => {
      // Return cancel_requested = true on cancellation check
      if (sql.includes('cancel_requested')) {
        return { rows: [{ cancel_requested: true, status: 'active' }] };
      }
      return { rows: [] };
    });

    await processor.process(mockJob);

    // Verify DB was updated to cancelled
    const cancelCall = mockDb.query.mock.calls.find(
      (call: any[]) => call[0]?.includes('UPDATE indexing_jobs') && call[0]?.includes("status = 'cancelled'"),
    );
    expect(cancelCall).toBeDefined();

    // Verify scratch for job_isolated_999 was cleaned up
    const expectedScratch = path.join(testScratchRoot, 'job_isolated_999');
    expect(fs.existsSync(expectedScratch)).toBe(false);
  });
});
