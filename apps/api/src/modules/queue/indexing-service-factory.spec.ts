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
      dispatch: jest.fn(async (env: any) => env.job_id || 'factory_job_999'),
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
    let dispatchedBeforeInsert = false;
    mockDb.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('INSERT INTO indexing_jobs') && mockFactory.dispatch.mock.calls.length > 0) {
        dispatchedBeforeInsert = true;
      }
      return { rows: [] };
    });

    const jobId = await service.enqueueAsset({
      assetId: 'asset_delegated_1',
      userId: 'user_1',
      sourcePath: '',
      originalFilename: 'lecture.mp4',
      fileSize: 1000,
      checksum: 'chk_123',
      priority: 'batch',
    });

    expect(jobId).toBeTruthy();
    expect(dispatchedBeforeInsert).toBe(false);
    expect(mockFactory.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        asset_id: 'asset_delegated_1',
        user_id: 'user_1',
        priority: 'batch',
        job_id: jobId,
      }),
    );
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO indexing_jobs'),
      expect.arrayContaining([jobId, 'asset_delegated_1', 'user_1']),
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

  it('reconciles orphaned BullMQ active jobs against PostgreSQL records on startup', async () => {
    // 1. SELECT indexing_jobs WHERE status = 'active'
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    // 2. SELECT media_assets WHERE status = 'processing'
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const mockOrphanJob = {
      id: 'bull_orphan_5',
      moveToCompleted: jest.fn().mockResolvedValue(true),
      remove: jest.fn().mockResolvedValue(true),
    };
    mockQueue.getActive = jest.fn().mockResolvedValue([mockOrphanJob]);

    // 3. SELECT indexing_jobs WHERE bull_job_id = $1 (already completed in Postgres)
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'job_row_5', status: 'completed' }],
    });

    const result = await service.reconcileStalledJobs();

    expect(mockOrphanJob.moveToCompleted).toHaveBeenCalledWith('Reconciled on startup', '0', false);
    expect(result.reconciledJobs).toBe(1);
  });

  it('does not fail processing assets that still have a live factory job', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'asset_live', original_filename: 'lecture.mp4' }],
      })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    mockQueue.getActive = jest.fn().mockResolvedValue([]);

    const result = await service.reconcileStalledJobs();

    expect(result.reconciledAssets).toBe(0);
    const failAsset = mockDb.query.mock.calls.find(
      (c: any[]) =>
        typeof c[0] === 'string' &&
        c[0].includes("status = 'failed'") &&
        c[0].includes('media_assets'),
    );
    expect(failAsset).toBeUndefined();
  });
});

describe('IndexingService F2 failed-unit retry', () => {
  it('re-enqueues only failed units and leaves completed work in place', async () => {
    const mockQueue: any = { getWorkers: jest.fn().mockResolvedValue([]) };
    const mockDb: any = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('FROM media_assets')) {
          return {
            rows: [
              {
                id: 'asset_retry',
                original_path: '',
                original_filename: 'lecture.mp4',
                checksum: 'chk',
                file_size: 10,
                source_type: 'google_drive',
                connector_account_id: 'acc_1',
                external_file_id: 'drive_1',
              },
            ],
          };
        }
        return { rows: [] };
      }),
    };
    const mockConfig: any = {
      get: jest.fn((key: string, def?: any) => (key === 'GEMINI_MODEL' ? 'gemini-2.5-flash' : def)),
    };
    const mockFactory: any = {
      provider: 'bullmq',
      dispatch: jest.fn(async (env: any) => env.job_id || 'job_x'),
      cancel: jest.fn(),
      getStatus: jest.fn(),
      getCapacity: jest.fn(),
    };
    const mockUnits: any = {
      getFailedUnits: jest.fn().mockResolvedValue([
        {
          unit_id: 'scene_12',
          unit_type: 'analyze_frames',
          start_s: 120,
          end_s: 130,
          status: 'failed',
        },
      ]),
      resetFailedUnits: jest.fn().mockResolvedValue(undefined),
      resetAssetUnits: jest.fn().mockResolvedValue(undefined),
    };

    const service = new IndexingService(mockQueue, mockDb, mockConfig, undefined, mockFactory, mockUnits);

    await service.retryAsset('asset_retry', 'user_1');

    expect(mockUnits.resetFailedUnits).toHaveBeenCalledWith('asset_retry');
    expect(mockUnits.resetAssetUnits).not.toHaveBeenCalled();
    expect(mockFactory.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        job_type: 'analyze_frames',
        processing_config: expect.objectContaining({ unitId: 'scene_12' }),
      }),
    );
    expect(mockFactory.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ job_type: 'finalize_asset' }),
    );
    expect(mockFactory.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ job_type: 'plan_asset' }),
    );
  });
});
