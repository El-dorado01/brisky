import { IndexingProcessor } from './indexing.processor';
import { FactoryJobEnvelope } from './indexing.types';

describe('Checkpointed Pipeline Seam (Phase F2)', () => {
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
          return { rows: [{ id: 'asset_f2', status: 'processing', availability: 'available' }] };
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
        codec: 'h264',
        hasAudio: true,
      }),
      detectScenesAndExtractFrames: jest.fn().mockResolvedValue([
        { sceneId: 0, startTime: 0, endTime: 10, representativeTimestamp: 5, keyframePath: '/f0.jpg', keyframes: [] },
        { sceneId: 1, startTime: 10, endTime: 20, representativeTimestamp: 15, keyframePath: '/f1.jpg', keyframes: [] },
      ]),
      generateThumbnail: jest.fn().mockResolvedValue('/thumb.jpg'),
      extractAudio: jest.fn().mockResolvedValue(true),
      generateProxy: jest.fn().mockResolvedValue('/proxy.mp4'),
    };
    mockGemini = {
      analyzeFrames: jest.fn().mockResolvedValue({
        observations: [{ timestamp: 15, description: 'Scene 1 observation' }],
        usage: null,
      }),
      analyzeVideo: jest.fn().mockResolvedValue({ analysis: { video_summary: '', key_themes: [], segments: [] }, usage: null }),
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
          framesAnalyzed: 1,
          sceneCount: 2,
          indexDurationMs: 150,
        },
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
      getCompletedUnitIds: jest.fn().mockResolvedValue(new Set(['scene_0'])), // scene_0 is already completed from prior run
      getCompletedUnits: jest.fn().mockResolvedValue(new Map([['scene_0', {}]])),
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

  it('plans units and skips already-completed scenes during frame analysis', async () => {
    const jobEnvelope: FactoryJobEnvelope = {
      job_id: 'job_f2_test',
      job_type: 'index_asset',
      asset_id: 'asset_f2',
      user_id: 'user_1',
      source: {
        provider: 'upload',
        sourcePath: __filename, // existing file
        originalFilename: 'test.mp4',
        checksum: 'chk_f2',
        fileSize: 1000,
      },
      priority: 'normal',
    };

    const mockJob: any = {
      id: 'bull_f2_1',
      data: jobEnvelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await processor.process(mockJob);

    // 1. planUnits was called
    expect(mockUnitsService.planUnits).toHaveBeenCalled();

    // 2. analyzeFrames was called ONLY with scene 1 (scene 0 was skipped because it was already completed)
    expect(mockGemini.analyzeFrames).toHaveBeenCalledWith([
      expect.objectContaining({ sceneId: 1 }),
    ]);

    // 3. Newly processed scene 1 was checkpointed as completed
    expect(mockUnitsService.markUnitCompleted).toHaveBeenCalledWith(
      'asset_f2',
      'scene_1',
      expect.anything(),
    );
  });

  it('recovers observations and transcript from completed unit checkpoints on restart', async () => {
    // Both audio and scene_0 were completed in a previous attempt
    mockUnitsService.getCompletedUnitIds.mockResolvedValue(new Set(['audio_transcribe', 'scene_0']));
    mockUnitsService.getCompletedUnits = jest.fn().mockResolvedValue(
      new Map([
        [
          'audio_transcribe',
          { transcript: [{ text: 'preserved transcript cue', start_time: 1, end_time: 4 }] },
        ],
        [
          'scene_0',
          { observations: [{ timestamp: 2, description: 'Preserved Scene 0 observation' }] },
        ],
      ]),
    );

    const jobEnvelope: FactoryJobEnvelope = {
      job_id: 'job_f2_resume',
      job_type: 'index_asset',
      asset_id: 'asset_f2',
      user_id: 'user_1',
      source: {
        provider: 'upload',
        sourcePath: __filename,
        originalFilename: 'test.mp4',
        checksum: 'chk_f2',
        fileSize: 1000,
      },
      priority: 'normal',
    };

    const mockJob: any = {
      id: 'bull_f2_2',
      data: jobEnvelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await processor.process(mockJob);

    // Audio should not have been re-transcribed
    expect(mockGemini.transcribeAudio).not.toHaveBeenCalled();

    // Scene 0 was not sent to Gemini analyzeFrames
    expect(mockGemini.analyzeFrames).toHaveBeenCalledWith([
      expect.objectContaining({ sceneId: 1 }),
    ]);

    // mergerService received both the recovered Scene 0 observation and new Scene 1 observation
    expect(mockMerger.mergeAndPersist).toHaveBeenCalledWith(
      expect.objectContaining({
        visual: expect.arrayContaining([
          expect.objectContaining({ description: 'Preserved Scene 0 observation' }),
          expect.objectContaining({ description: 'Scene 1 observation' }),
        ]),
        transcript: expect.arrayContaining([
          expect.objectContaining({ text: 'preserved transcript cue' }),
        ]),
      }),
    );
  });
});
