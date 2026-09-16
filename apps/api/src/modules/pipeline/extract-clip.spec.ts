import { IndexingProcessor } from '../queue/indexing.processor';
import { FactoryJobEnvelope } from '../queue/indexing.types';

describe('Clip Extraction Seam (Phase F3)', () => {
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
          return { rows: [{ id: 'asset_master_1', status: 'indexed', availability: 'available' }] };
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

  it('processes extract_clip job, cuts subclip with ffmpeg, and links derived_from relationship in DB', async () => {
    const envelope: FactoryJobEnvelope = {
      job_id: 'job_clip_1',
      job_type: 'extract_clip',
      asset_id: 'asset_master_1',
      user_id: 'user_1',
      source: {
        provider: 'upload',
        sourcePath: __filename,
        originalFilename: 'interview.mp4',
        checksum: 'chk_master_1',
        fileSize: 1000,
      },
      segment: {
        start_s: 10.5,
        end_s: 25.0,
      },
      priority: 'interactive',
    };

    const mockJob: any = {
      id: 'bull_clip_1',
      data: envelope,
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await processor.process(mockJob);

    // 1. Cut subclip via ffmpeg with exact boundaries
    expect(mockFfmpeg.extractClip).toHaveBeenCalledWith(
      __filename,
      expect.stringContaining('.mp4'),
      10.5,
      25.0,
    );

    // 2. Extracted clip thumbnail generated
    expect(mockFfmpeg.generateThumbnail).toHaveBeenCalledWith(
      expect.stringContaining('.mp4'),
      expect.stringContaining('.jpg'),
    );

    // 3. Inserted derived asset record with parent link
    const assetInsert = mockDb.query.mock.calls.find((c: any[]) =>
      c[0]?.includes('INSERT INTO media_assets') && c[0]?.includes('parent_asset_id'),
    );
    expect(assetInsert).toBeDefined();
    expect(assetInsert[1]).toContain('asset_master_1');
    expect(assetInsert[0]).toContain('derived_from');

    // 4. Registered lineage in asset_relationships table
    const relationshipInsert = mockDb.query.mock.calls.find((c: any[]) =>
      c[0]?.includes('INSERT INTO asset_relationships'),
    );
    expect(relationshipInsert).toBeDefined();
    expect(relationshipInsert[1]).toContain('asset_master_1');
    expect(relationshipInsert[0]).toContain('derived_from');
  });
});
