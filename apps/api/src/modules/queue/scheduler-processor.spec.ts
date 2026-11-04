import { DelayedError } from 'bullmq';
import { IndexingProcessor } from './indexing.processor';
import { FactorySchedulerService } from './factory-scheduler.service';
import { FactoryJobEnvelope } from './indexing.types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('IndexingProcessor Scheduler Admission (Phase F5 Seam 2)', () => {
  let processor: IndexingProcessor;
  let mockDb: any;
  let mockScheduler: jest.Mocked<FactorySchedulerService>;
  let mockConfig: any;
  let storage: string;

  beforeEach(() => {
    storage = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-scheduler-'));
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
      heartbeat: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'STORAGE_ROOT') return storage;
        if (key === 'WORKER_SCRATCH_MAX_MB') return 512;
        if (key === 'WORKER_FULL_DOWNLOAD_MAX_MB') return 16384;
        return defaultValue;
      }),
    };

    processor = new IndexingProcessor(
      mockDb,
      {} as any, // ffmpegPipeline
      {} as any, // aiService
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

  afterEach(() => { fs.rmSync(storage, { recursive: true, force: true }); });
  it('defers finalization prerequisites before claiming any scheduler or asset slot',async()=>{
    (processor as any).unitsService={pendingSiblingUnits:jest.fn().mockResolvedValue(2)};
    const job:any={id:'deferred',data:{asset_id:'asset',user_id:'owner',job_type:'finalize_asset',source:{provider:'upload'},priority:'normal'},moveToDelayed:jest.fn().mockResolvedValue(undefined)};
    await expect(processor.process(job)).rejects.toBeInstanceOf(DelayedError);
    expect(mockScheduler.claimSlot).not.toHaveBeenCalled();expect(job.moveToDelayed).toHaveBeenCalled();
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
      'plan_asset',
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

  it('delays a distinct clip request when its source asset is busy instead of silently completing it', async () => {
    mockScheduler.claimSlot.mockResolvedValueOnce({ canRun: true });
    (processor as any).claimAssetLock = jest.fn().mockResolvedValue(false);
    const job: any = { id: 'clip-busy', token: 'token', moveToDelayed: jest.fn(), data: {
      job_type: 'extract_clip', asset_id: 'asset', user_id: 'owner', priority: 'interactive', source: { provider: 'upload' } } };
    await expect(processor.process(job)).rejects.toThrow(DelayedError);
    expect(job.moveToDelayed).toHaveBeenCalled();
    expect(mockScheduler.releaseSlot).toHaveBeenCalledWith('clip-busy');
  });

  it('keeps a failed clip eligible for its remaining automatic queue attempts', async () => {
    mockScheduler.claimSlot.mockResolvedValueOnce({ canRun: true });
    (processor as any).executeExtractClip = jest.fn().mockRejectedValue(new Error('transient decode failure'));
    const job: any = { id: 'clip-retry', attemptsMade: 0, opts: { attempts: 3 }, data: {
      job_type: 'extract_clip', asset_id: 'asset', user_id: 'owner', priority: 'interactive', source: { provider: 'upload' } } };
    await expect(processor.process(job)).rejects.toThrow('transient decode failure');
    expect(mockDb.query.mock.calls.some(([sql, args]: any[]) => sql.includes('NOT cancel_requested') && args[1] === 'waiting' && args[2] === 'retrying')).toBe(true);
  });

  it('finishes a cancelled operation delivery without consuming a worker slot', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ status: 'cancelled', cancel_requested: false }] });
    await processor.process({ id: 'cancelled-clip', data: { job_type: 'extract_clip', asset_id: 'asset', user_id: 'owner',
      priority: 'interactive', source: { provider: 'upload' }, processing_config: { clipOperationId: 'operation' } } } as any);
    expect(mockScheduler.claimSlot).not.toHaveBeenCalled();
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
      'plan_asset',
    );
    expect((processor as any).executeProcessing).toHaveBeenCalledWith(mockJob, expect.anything());
  });
});
