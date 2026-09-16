import { IndexingService } from './indexing.service';

describe('Enqueue does not clobber unrelated jobs (F1 repair)', () => {
  let service: IndexingService;
  let mockDb: any;
  let mockQueue: any;
  let mockConfig: any;
  let waitingJobs: any[];

  beforeEach(() => {
    waitingJobs = [];
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    mockQueue = {
      getJobs: jest.fn().mockImplementation(async () => waitingJobs),
      add: jest.fn().mockResolvedValue({ id: 'new_bull_1' }),
      getWorkers: jest.fn().mockResolvedValue([]),
    };
    mockConfig = {
      get: jest.fn().mockReturnValue('gemini-2.5-flash'),
    };
    service = new IndexingService(mockQueue as any, mockDb, mockConfig as any);
  });

  it('does not remove a waiting index_asset when enqueueing generate_proxy for the same asset', async () => {
    const indexJob = {
      id: 'wait_index',
      data: { job_type: 'index_asset', asset_id: 'asset_1' },
      remove: jest.fn().mockResolvedValue(undefined),
    };
    waitingJobs = [indexJob];

    await service.enqueueAsset({
      job_type: 'generate_proxy',
      asset_id: 'asset_1',
      user_id: 'user_1',
      source: { provider: 'google_drive' },
      priority: 'interactive',
    });

    expect(indexJob.remove).not.toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalledWith(
      'generate_proxy',
      expect.objectContaining({ job_type: 'generate_proxy' }),
      expect.anything(),
    );
  });

  it('does replace a waiting generate_proxy with a newer generate_proxy for the same asset', async () => {
    const proxyJob = {
      id: 'wait_proxy',
      data: { job_type: 'generate_proxy', asset_id: 'asset_1' },
      remove: jest.fn().mockResolvedValue(undefined),
    };
    waitingJobs = [proxyJob];

    await service.enqueueAsset({
      job_type: 'generate_proxy',
      asset_id: 'asset_1',
      user_id: 'user_1',
      source: { provider: 'google_drive' },
      priority: 'interactive',
    });

    expect(proxyJob.remove).toHaveBeenCalled();
  });
});
