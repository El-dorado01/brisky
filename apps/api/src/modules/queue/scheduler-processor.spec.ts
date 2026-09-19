import { DelayedError } from 'bullmq';
import { IndexingProcessor } from './indexing.processor';
import { FactorySchedulerService } from './factory-scheduler.service';
import { FactoryJobEnvelope } from './indexing.types';

describe('IndexingProcessor Scheduler Admission (Phase F5 Seam 2)', () => {
  let processor: IndexingProcessor;
  let mockDb: any;
  let mockScheduler: jest.Mocked<FactorySchedulerService>;
  let mockConfig: any;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO asset_processing_locks')) {
          return { rows: [{ asset_id: 'locked' }] };
        }
        return { rows: [] };
      }),
    };

    mockScheduler = {
      claimSlot: jest.fn(),
      recordWaitingReason: jest.fn().mockResolvedValue(undefined),
      clearWaitingReason: jest.fn().mockResolvedValue(undefined),
      releaseSlot: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'STORAGE_ROOT') return './test-storage-f5';
        if (key === 'WORKER_SCRATCH_MAX_MB') return 512;
        if (key === 'WORKER_FULL_DOWNLOAD_MAX_MB') return 16384;
        return defaultValue;
      }),
    };

    processor = new IndexingProcessor(
      mockDb,
      {} as any, // ffmpegPipeline
      {} as any, // geminiService
      {} as any, // whisperService
      {} as any, // mergerService
      mockConfig,
      {} as any, // connectorRegistry
      {} as any, // connectorsService
      {} as any, // unitsService
      undefined, // proxyCacheService
      mockScheduler,
    );
  });

  it('delays job and throws DelayedError when slot is unavailable', async () => {
    mockScheduler.claimSlot.mockResolvedValueOnce({
      canRun: false,
      waitingReason: 'user_slot',
    });

    const mockJob: any = {
      id: 'bull_job_wait_1',
      token: 'token_123',
      data: {
        job_type: 'index_asset',
        asset_id: 'asset_wait_1',
        user_id: 'user_test_1',
        priority: 'batch',
        source: { provider: 'google_drive', originalFilename: 'big_video.mp4' },
      } as FactoryJobEnvelope,
      moveToDelayed: jest.fn().mockResolvedValue(undefined),
    };

    await expect(processor.process(mockJob)).rejects.toThrow(DelayedError);

    expect(mockScheduler.claimSlot).toHaveBeenCalledWith(
      'bull_job_wait_1',
      'asset_wait_1',
      'user_test_1',
      'batch',
    );
    expect(mockScheduler.recordWaitingReason).toHaveBeenCalledWith(
      'bull_job_wait_1',
      'asset_wait_1',
      'user_slot',
    );
    expect(mockJob.moveToDelayed).toHaveBeenCalledWith(
      expect.any(Number),
      'token_123',
    );
  });

  it('clears waiting reason and proceeds when slot is available', async () => {
    mockScheduler.claimSlot.mockResolvedValueOnce({
      canRun: true,
    });

    // Mock executeProcessing to resolve
    (processor as any).executeProcessing = jest.fn().mockResolvedValue(undefined);

    const mockJob: any = {
      id: 'bull_job_run_1',
      token: 'token_123',
      data: {
        job_type: 'index_asset',
        asset_id: 'asset_run_1',
        user_id: 'user_test_1',
        priority: 'interactive',
        source: { provider: 'google_drive', originalFilename: 'preview.mp4' },
      } as FactoryJobEnvelope,
    };

    await processor.process(mockJob);

    expect(mockScheduler.claimSlot).toHaveBeenCalledWith(
      'bull_job_run_1',
      'asset_run_1',
      'user_test_1',
      'interactive',
    );
    expect((processor as any).executeProcessing).toHaveBeenCalledWith(mockJob, expect.anything());
  });
});
