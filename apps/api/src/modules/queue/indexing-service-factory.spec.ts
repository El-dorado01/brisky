import { IndexingService } from './indexing.service';
import { MediaFactory } from './media-factory.interface';

describe('IndexingService with MediaFactory (Phase F7 Seam 1)', () => {
  let service: IndexingService;
  let mockQueue: any;
  let mockDb: any;
  let mockConfig: any;
  let mockFactory: jest.Mocked<MediaFactory>;

  beforeEach(() => {
    mockQueue = {
      getWaitingCount: jest.fn().mockResolvedValue(0),
      getActiveCount: jest.fn().mockResolvedValue(0),
      getWorkers: jest.fn().mockResolvedValue([]),
    };

    mockDb = {
      query: jest.fn(),
    };

    mockConfig = {
      get: jest.fn((key: string, def?: any) => {
        if (key === 'GEMINI_MODEL') return 'gemini-2.5-flash';
        if (key === 'STORAGE_ROOT') return './test-storage';
        return def;
      }),
    };

    mockFactory = {
      provider: 'bullmq',
      dispatch: jest.fn().mockResolvedValue('factory_job_999'),
      cancel: jest.fn().mockResolvedValue(true),
      getStatus: jest.fn().mockResolvedValue({ id: 'factory_job_999', state: 'active' }),
      getCapacity: jest.fn().mockResolvedValue({
        activeWorkers: 2,
        globalMaxSlots: 4,
        defaultUserSlots: 2,
        activeSlots: 1,
        availableSlots: 3,
        interactiveReservedSlots: 1,
      }),
    };

    service = new IndexingService(
      mockQueue,
      mockDb,
      mockConfig,
      undefined,
      mockFactory,
    );
  });

  it('delegates job dispatch to MediaFactory.dispatch and records to database', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // insert into indexing_jobs

    const jobId = await service.enqueueAsset({
      assetId: 'asset_delegated_1',
      userId: 'user_1',
      sourcePath: '',
      originalFilename: 'lecture.mp4',
      fileSize: 1000,
      checksum: 'chk_123',
      priority: 'batch',
    });

    expect(jobId).toBe('factory_job_999');
    expect(mockFactory.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        asset_id: 'asset_delegated_1',
        user_id: 'user_1',
        priority: 'batch',
      }),
    );
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO indexing_jobs'),
      expect.arrayContaining(['factory_job_999', 'asset_delegated_1', 'user_1']),
    );
  });

  it('delegates job cancellation to MediaFactory.cancel', async () => {
    mockDb.query
      // 1. SELECT indexing_jobs
      .mockResolvedValueOnce({
        rows: [{ id: 'job_row_1', bull_job_id: 'bull_job_1', asset_id: 'asset_1', status: 'waiting' }],
      })
      // 2. UPDATE indexing_jobs SET status = 'cancelled'
      .mockResolvedValueOnce({ rows: [] })
      // 3. UPDATE media_assets SET status = 'failed'
      .mockResolvedValueOnce({ rows: [] });

    const res = await service.cancelJob('job_row_1', 'user_1');

    expect(res.cancelled).toBe(true);
    expect(mockFactory.cancel).toHaveBeenCalledWith('bull_job_1');
  });

  it('uses MediaFactory.getCapacity in getStats', async () => {
    // 1. SELECT media_assets count by status
    mockDb.query.mockResolvedValueOnce({ rows: [{ status: 'indexed', count: '5' }] });
    // 2. SELECT active media_assets
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const stats = await service.getStats('user_1');

    expect(mockFactory.getCapacity).toHaveBeenCalledWith('user_1');
    expect(stats.activeWorkers).toBe(2);
    expect(stats.globalMaxSlots).toBe(4);
    expect(stats.defaultUserSlots).toBe(2);
    expect(stats.activeSlots).toBe(1);
  });
});
