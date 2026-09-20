import * as fs from 'fs';
import * as path from 'path';
import { IndexingProcessor } from './indexing.processor';
import { FactoryJobEnvelope } from './indexing.types';

describe('Transcribe-Only Execution & Master Purge (Phase F4 §587)', () => {
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

  const testStorage = path.join(__dirname, '../../../test-storage-f4-transcribe');
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
          return { rows: [{ id: 'asset_transcribe_1', status: 'processing', file_size: 2048 }] };
        }
        if (sql.includes('FROM indexing_jobs WHERE')) {
          return { rows: [{ cancel_requested: false, status: 'active' }] };
        }
        if (sql.includes('INSERT INTO asset_processing_locks')) {
          return { rows: [{ asset_id: 'locked' }] };
        }
        return { rows: [] };
      }),
    };
    mockFfmpeg = {
      extractAudio: jest.fn().mockImplementation(async (_videoPath: string, audioPath: string) => {
        fs.mkdirSync(path.dirname(audioPath), { recursive: true });
        fs.writeFileSync(audioPath, 'mock-extracted-audio');
        return true;
      }),
      probeMetadata: jest.fn(),
      detectScenesAndExtractFrames: jest.fn(),
      generateThumbnail: jest.fn(),
      generateProxy: jest.fn(),
      extractClip: jest.fn(),
    };
    mockGemini = {
      transcribeAudio: jest.fn().mockResolvedValue({
        transcript: [{ text: 'Hello world', start: 0, end: 5 }],
        usage: null,
      }),
      analyzeFrames: jest.fn(),
      analyzeVideo: jest.fn(),
      getPrimaryModel: jest.fn().mockReturnValue('gemini-2.5-flash'),
    };
    mockWhisper = {
      isAvailable: jest.fn().mockReturnValue(false),
    };
    mockMerger = {};
    mockConfig = {
      get: jest.fn((key: string, fallback: any) => {
        if (key === 'STORAGE_ROOT') return testStorage;
        if (key === 'WORKER_SCRATCH_MAX_MB') return 512;
        return fallback;
      }),
    };
    mockRegistry = {
      get: jest.fn().mockReturnValue({
        downloadAsset: jest.fn().mockImplementation(async (_auth, _remoteId, destPath) => {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.writeFileSync(destPath, 'mock-full-master-bytes');
        }),
      }),
    };
    mockConnectors = {
      getAuthContext: jest.fn().mockResolvedValue({}),
    };
    mockUnitsService = {
      getUnit: jest.fn().mockResolvedValue({ status: 'waiting' }),
      markUnitCompleted: jest.fn().mockResolvedValue(undefined),
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

  it('executes transcribe job, purges master tape before AI transcription, and persists access_mode', async () => {
    let masterExistedDuringTranscription = true;
    mockGemini.transcribeAudio.mockImplementation(async (audioPath: string) => {
      // Find master video in scratch and check if it already got purged
      const dir = path.dirname(audioPath);
      const scratchFiles = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
      masterExistedDuringTranscription = scratchFiles.some((f) => f.startsWith('source'));
      return { transcript: [{ text: 'Transcription result' }], usage: null };
    });

    const envelope: FactoryJobEnvelope = {
      job_id: 'job_transcribe_test',
      job_type: 'transcribe',
      priority: 'normal',
      asset_id: 'asset_transcribe_1',
      user_id: 'user_1',
      source: {
        provider: 'google_drive',
        remoteId: 'remote_lecture_tape',
        connectorAccountId: 'acc_1',
        originalFilename: 'heavy_lecture.mp4',
        fileSize: 50 * 1024 * 1024,
      },
    };

    const mockJob: any = {
      id: 'bull_transcribe_test',
      data: envelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await processor.process(mockJob);

    // 1. Audio was extracted
    expect(mockFfmpeg.extractAudio).toHaveBeenCalled();

    // 2. Master video was ALREADY purged when transcription ran
    expect(masterExistedDuringTranscription).toBe(false);

    // 3. Neither scene detection nor visual analysis were run (transcribe-only efficiency)
    expect(mockFfmpeg.detectScenesAndExtractFrames).not.toHaveBeenCalled();

    // 4. access_mode = 'full_download' and bytes_read were recorded
    const updateJobCalls = mockDb.query.mock.calls.filter(
      (c: any[]) => c[0].includes('UPDATE indexing_jobs') && c[0].includes('access_mode'),
    );
    expect(updateJobCalls.length).toBeGreaterThan(0);
    expect(updateJobCalls[0][1]).toContain('full_download');

    // 5. Transcript is persisted as intelligence, not discarded
    const obsInsert = mockDb.query.mock.calls.find(
      (c: any[]) =>
        typeof c[0] === 'string' &&
        c[0].includes('INSERT INTO media_observations') &&
        c[0].includes("'transcript'"),
    );
    expect(obsInsert).toBeDefined();
  });
});

