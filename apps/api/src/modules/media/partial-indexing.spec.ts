import { MediaService } from './media.service';

describe('Partial Indexing Search Seam (Phase F2)', () => {
  let mediaService: MediaService;
  let mockDb: any;
  let mockConfig: any;
  let mockGemini: any;
  let mockLocalEmbedding: any;
  let mockIndexingService: any;
  let mockUploadConnector: any;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    mockConfig = {
      get: jest.fn().mockReturnValue('gemini-2.5-flash'),
    };
    mockGemini = {
      generateEmbedding: jest.fn().mockResolvedValue([]),
      isConfigured: jest.fn().mockReturnValue(false),
    };
    mockLocalEmbedding = {
      isAvailable: jest.fn().mockReturnValue(false),
    };
    mockIndexingService = {
      enqueueAsset: jest.fn().mockResolvedValue('job_123'),
    };
    mockUploadConnector = {
      deleteSource: jest.fn().mockResolvedValue(true),
    };

    mediaService = new MediaService(
      mockConfig,
      mockDb,
      mockIndexingService,
      mockGemini,
      mockLocalEmbedding,
      mockUploadConnector,
    );
  });

  it('allows assets with status partially_indexed to be searched via search()', async () => {
    mockDb.query.mockImplementation(async (sql: string) => {
      if (sql.includes('indexed_segments')) {
        return {
          rows: [
            {
              id: 'seg_1',
              asset_id: 'asset_partial',
              start_time: 0,
              end_time: 5,
              title: 'Partial segment',
              description: 'Visible scene before tail error',
              original_filename: 'interview.mp4',
              lex_score: 1.0,
              lex_rank: 1,
              vec_score: 0.8,
              vec_rank: 1,
              rrf_score: 0.03,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await mediaService.search('interview', 'user_1');

    // Verify search query allowed partially_indexed
    const searchCall = mockDb.query.mock.calls.find((call: any[]) =>
      call[0]?.includes('indexed_segments'),
    );
    expect(searchCall).toBeDefined();
    expect(searchCall[0]).toContain("a.status IN ('indexed', 'partially_indexed')");
  });

  it('allows assets with status partially_indexed to be searched via transcript observation path', async () => {
    mockDb.query.mockImplementation(async (sql: string) => {
      return { rows: [] };
    });

    await mediaService.search('speech words', 'user_1');

    const transcriptCall = mockDb.query.mock.calls.find((call: any[]) =>
      call[0]?.includes("o.observation_type = 'transcript'"),
    );
    expect(transcriptCall).toBeDefined();
    expect(transcriptCall[0]).toContain("a.status IN ('indexed', 'partially_indexed')");
  });
});
