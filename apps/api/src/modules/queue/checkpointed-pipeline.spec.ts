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
  let mockIndexingService: any;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('FROM media_assets WHERE id =')) {
          return { rows: [{ id: 'asset_f2', status: 'processing', availability: 'available' }] };
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
      generateEmbeddingForText: jest.fn().mockResolvedValue({ values: [0.1, 0.2], usage: {} }),
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
      getCompletedUnitIds: jest.fn().mockResolvedValue(new Set(['scene_0'])),
      getCompletedUnits: jest.fn().mockResolvedValue(new Map([['scene_0', {}]])),
      getUnits: jest.fn().mockResolvedValue([
        { unit_id: 'audio_transcribe', unit_type: 'transcribe', status: 'waiting', start_s: null, end_s: null },
        { unit_id: 'scene_0', unit_type: 'analyze_frames', status: 'completed', start_s: 0, end_s: 10 },
        { unit_id: 'embed_scene_0', unit_type: 'embed', status: 'waiting', start_s: 0, end_s: 10 },
        { unit_id: 'scene_1', unit_type: 'analyze_frames', status: 'waiting', start_s: 10, end_s: 20 },
        { unit_id: 'embed_scene_1', unit_type: 'embed', status: 'waiting', start_s: 10, end_s: 20 },
        { unit_id: 'gemini_video', unit_type: 'gemini_video', status: 'waiting', start_s: null, end_s: null },
        { unit_id: 'finalize', unit_type: 'finalize_asset', status: 'waiting', start_s: null, end_s: null },
      ]),
      getUnit: jest.fn().mockImplementation(async (_asset: string, unitId: string) => {
        if (unitId === 'scene_0') {
          return {
            unit_id: 'scene_0',
            status: 'completed',
            metadata: { sceneId: 0, startTime: 0, endTime: 10, keyframes: [] },
          };
        }
        if (unitId === 'scene_1') {
          return {
            unit_id: 'scene_1',
            status: 'waiting',
            metadata: { sceneId: 1, startTime: 10, endTime: 20, keyframes: [] },
          };
        }
        return { unit_id: unitId, status: 'waiting', metadata: {} };
      }),
      hasFailedUnits: jest.fn().mockResolvedValue(false),
      markUnitCompleted: jest.fn().mockResolvedValue(undefined),
      markUnitFailed: jest.fn().mockResolvedValue(undefined),
      resetAssetUnits: jest.fn().mockResolvedValue(undefined),
    };
    mockIndexingService = {
      enqueueAsset: jest.fn().mockResolvedValue('child_job'),
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
      undefined,
      undefined,
      mockIndexingService,
    );
  });

  it('plans units and enqueues child jobs except already-completed scenes', async () => {
    const jobEnvelope: FactoryJobEnvelope = {
      job_id: 'job_f2_test',
      job_type: 'plan_asset',
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
      id: 'bull_f2_1',
      data: jobEnvelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await processor.process(mockJob);

    expect(mockUnitsService.planUnits).toHaveBeenCalled();
    expect(mockGemini.analyzeFrames).not.toHaveBeenCalled();
    expect(mockIndexingService.enqueueAsset).toHaveBeenCalledWith(
      expect.objectContaining({ job_type: 'transcribe', processing_config: expect.objectContaining({ unitId: 'audio_transcribe' }) }),
    );
    expect(mockIndexingService.enqueueAsset).toHaveBeenCalledWith(
      expect.objectContaining({ job_type: 'analyze_frames', processing_config: expect.objectContaining({ unitId: 'scene_1' }) }),
    );
    expect(mockIndexingService.enqueueAsset).not.toHaveBeenCalledWith(
      expect.objectContaining({ processing_config: expect.objectContaining({ unitId: 'scene_0' }) }),
    );
    expect(mockIndexingService.enqueueAsset).toHaveBeenCalledWith(
      expect.objectContaining({ job_type: 'finalize_asset' }),
    );
  });

  it('does not re-run analyze_frames for a completed scene unit', async () => {
    const jobEnvelope: FactoryJobEnvelope = {
      job_id: 'job_f2_scene0',
      job_type: 'analyze_frames',
      asset_id: 'asset_f2',
      user_id: 'user_1',
      source: { provider: 'upload', sourcePath: __filename, originalFilename: 'test.mp4' },
      segment: { start_s: 0, end_s: 10 },
      priority: 'normal',
      processing_config: { unitId: 'scene_0' },
    };

    const mockJob: any = {
      id: 'bull_f2_scene0',
      data: jobEnvelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await processor.process(mockJob);

    expect(mockGemini.analyzeFrames).not.toHaveBeenCalled();
  });

  it('runs analyze_frames for an incomplete scene and checkpoints it', async () => {
    const jobEnvelope: FactoryJobEnvelope = {
      job_id: 'job_f2_scene1',
      job_type: 'analyze_frames',
      asset_id: 'asset_f2',
      user_id: 'user_1',
      source: { provider: 'upload', sourcePath: __filename, originalFilename: 'test.mp4' },
      segment: { start_s: 10, end_s: 20 },
      priority: 'normal',
      processing_config: { unitId: 'scene_1' },
    };

    const mockJob: any = {
      id: 'bull_f2_scene1',
      data: jobEnvelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await processor.process(mockJob);

    expect(mockGemini.analyzeFrames).toHaveBeenCalled();
    expect(mockUnitsService.markUnitCompleted).toHaveBeenCalledWith(
      'asset_f2',
      'scene_1',
      expect.anything(),
    );
  });
});
