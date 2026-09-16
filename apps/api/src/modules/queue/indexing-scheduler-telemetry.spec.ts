import { IndexingService } from './indexing.service';
import { FactorySchedulerService } from './factory-scheduler.service';

describe('IndexingService Scheduler Telemetry (Phase F5 Seam 3)', () => {
  let service: IndexingService;
  let mockQueue: any;
  let mockDb: any;
  let mockConfig: any;
  let mockScheduler: jest.Mocked<FactorySchedulerService>;

  beforeEach(() => {
    mockQueue = {
      getWaitingCount: jest.fn().mockResolvedValue(3),
      getActiveCount: jest.fn().mockResolvedValue(1),
      getWorkers: jest.fn().mockResolvedValue([{ id: 'worker_1' }]),
    };

    mockDb = {
      query: jest.fn().mockImplementation((query: string) => {
        if (query.includes('FROM media_assets')) {
          if (query.includes('GROUP BY status')) {
            return Promise.resolve({
              rows: [
                { status: 'indexed', count: '12' },
                { status: 'processing', count: '1' },
              ],
            });
          }
          return Promise.resolve({
            rows: [
              {
                id: 'asset_1',
                original_filename: 'video.mp4',
                stage: 'processing',
                progress: 45,
              },
            ],
          });
        }
        if (query.includes('FROM indexing_jobs')) {
          return Promise.resolve({
            rows: [
              {
                id: 'job_1',
                asset_id: 'asset_1',
                status: 'waiting',
                waiting_reason: 'user_slot',
                stage: 'waiting (user_slot)',
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    mockConfig = {
      get: jest.fn().mockReturnValue('./storage'),
    };

    mockScheduler = {
      getCapacitySnapshot: jest.fn().mockResolvedValue({
        globalMaxSlots: 2,
        defaultUserSlots: 1,
        interactiveReservedSlots: 1,
        activeSlots: 1,
        userActiveSlots: 1,
        waitingForSlot: 3,
        waitingReasons: {
          user_slot: 2,
          global_capacity: 1,
        },
      }),
    } as any;

    service = new IndexingService(
      mockQueue,
      mockDb,
      mockConfig,
      mockScheduler,
    );
  });

  it('getStats returns extended scheduler capacity telemetry', async () => {
    const stats = await service.getStats('user_1');

    expect(stats.indexed).toBe(12);
    expect(stats.globalMaxSlots).toBe(2);
    expect(stats.defaultUserSlots).toBe(1);
    expect(stats.activeSlots).toBe(1);
    expect(stats.waitingForSlot).toBe(3);
    expect(stats.waitingReasons).toEqual({
      user_slot: 2,
      global_capacity: 1,
    });
    expect(mockScheduler.getCapacitySnapshot).toHaveBeenCalledWith('user_1');
  });

  it('getRecentJobs returns jobs with waiting_reason', async () => {
    const jobs = await service.getRecentJobs('user_1');

    expect(jobs).toHaveLength(1);
    expect(jobs[0].waiting_reason).toBe('user_slot');
    expect(jobs[0].stage).toBe('waiting (user_slot)');
  });
});
