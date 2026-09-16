import { IndexingService } from './indexing.service';

describe('Job Cancellation Seam (Phase F1)', () => {
  let service: IndexingService;
  let mockDb: any;
  let mockQueue: any;
  let mockConfig: any;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    };
    mockQueue = {
      getJob: jest.fn(),
      getWorkers: jest.fn().mockResolvedValue([]),
    };
    mockConfig = {
      get: jest.fn().mockReturnValue('gemini-2.5-flash'),
    };
    service = new IndexingService(mockQueue as any, mockDb, mockConfig as any);
  });

  it('cancels a waiting job by removing from BullMQ and updating DB status to cancelled', async () => {
    const mockBullJob = {
      id: 'bull_123',
      remove: jest.fn().mockResolvedValue(undefined),
    };
    mockQueue.getJob.mockResolvedValueOnce(mockBullJob);

    // 1. Locate job
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'job_uuid_1',
          bull_job_id: 'bull_123',
          asset_id: 'asset_1',
          status: 'waiting',
        },
      ],
    });
    // 2. UPDATE indexing_jobs
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    // 3. UPDATE media_assets
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const result = await service.cancelJob('bull_123', 'user_1');

    expect(result.cancelled).toBe(true);
    expect(result.state).toBe('waiting_cancelled');
    expect(mockBullJob.remove).toHaveBeenCalled();

    const jobUpdate = mockDb.query.mock.calls.find(
      (call: any[]) =>
        call[0]?.includes('UPDATE indexing_jobs') && call[0]?.includes("status = 'cancelled'"),
    );
    expect(jobUpdate).toBeDefined();
  });

  it('sets cancel_requested flag when job is currently active', async () => {
    // 1. Locate job
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'job_uuid_2',
          bull_job_id: 'bull_456',
          asset_id: 'asset_2',
          status: 'active',
        },
      ],
    });
    // 2. UPDATE indexing_jobs SET cancel_requested = true
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const result = await service.cancelJob('asset_2', 'user_1');

    expect(result.cancelled).toBe(true);
    expect(result.state).toBe('active_cancel_requested');

    const jobUpdate = mockDb.query.mock.calls.find(
      (call: any[]) =>
        call[0]?.includes('UPDATE indexing_jobs') && call[0]?.includes('cancel_requested = true'),
    );
    expect(jobUpdate).toBeDefined();
  });

  it('returns cancelled: false if job is already finished or not found', async () => {
    // Not found
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const res1 = await service.cancelJob('non_existent', 'user_1');
    expect(res1.cancelled).toBe(false);
    expect(res1.state).toBe('not_found');

    // Already completed
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'job_uuid_3', status: 'completed' }],
    });
    const res2 = await service.cancelJob('job_uuid_3', 'user_1');
    expect(res2.cancelled).toBe(false);
    expect(res2.state).toBe('completed');
  });
});
