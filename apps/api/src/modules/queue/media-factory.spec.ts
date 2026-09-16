import { BullmqMediaFactory } from './bullmq-media-factory.service';
import { FactoryJobEnvelope } from './indexing.types';

describe('BullmqMediaFactory (Phase F7 Seam 1)', () => {
  let factory: BullmqMediaFactory;
  let mockQueue: any;
  let mockScheduler: any;

  beforeEach(() => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'bull_job_123' }),
      getJob: jest.fn(),
      getJobs: jest.fn().mockResolvedValue([]),
      getWorkers: jest.fn().mockResolvedValue([{ id: 'worker_1' }]),
    };

    mockScheduler = {
      getCapacitySnapshot: jest.fn().mockResolvedValue({
        globalMaxSlots: 4,
        defaultUserSlots: 2,
        activeSlots: 1,
        userActiveSlots: 1,
        waitingForSlot: 0,
        interactiveReservedSlots: 1,
        waitingReasons: { user_slot: 0, global_capacity: 0 },
      }),
    };

    factory = new BullmqMediaFactory(mockQueue, mockScheduler);
  });

  describe('dispatch', () => {
    it('enqueues job to BullMQ with mapped priority and returns job id', async () => {
      const envelope: FactoryJobEnvelope = {
        asset_id: 'asset_f7_1',
        user_id: 'user_1',
        job_type: 'index_asset',
        priority: 'interactive',
        source: {
          provider: 'google_drive',
          sourcePath: '',
          originalFilename: 'test.mp4',
          fileSize: 10 * 1024 * 1024,
        },
      };

      const jobId = await factory.dispatch(envelope);

      expect(jobId).toBe('bull_job_123');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'index_asset',
        envelope,
        expect.objectContaining({
          priority: 1, // interactive priority in BullMQ
          attempts: 3,
        }),
      );
    });

    it('deduplicates identical waiting jobs of the same type and segment', async () => {
      const existingJob = {
        id: 'old_job_1',
        data: {
          asset_id: 'asset_f7_1',
          job_type: 'index_asset',
        },
        remove: jest.fn().mockResolvedValue(undefined),
      };
      mockQueue.getJobs.mockResolvedValueOnce([existingJob]);

      const envelope: FactoryJobEnvelope = {
        asset_id: 'asset_f7_1',
        user_id: 'user_1',
        job_type: 'index_asset',
        priority: 'normal',
        source: {
          provider: 'google_drive',
          sourcePath: '',
          fileSize: 50 * 1024 * 1024,
        },
      };

      await factory.dispatch(envelope);

      expect(existingJob.remove).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('removes waiting job and returns true', async () => {
      const mockJob = {
        id: 'job_to_cancel',
        remove: jest.fn().mockResolvedValue(undefined),
      };
      mockQueue.getJob.mockResolvedValueOnce(mockJob);

      const result = await factory.cancel('job_to_cancel');

      expect(result).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('returns false if job does not exist in queue', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null);

      const result = await factory.cancel('nonexistent_job');

      expect(result).toBe(false);
    });

    it('does not force remove active job but returns true for cooperative cancellation', async () => {
      const mockJob = {
        id: 'job_active_cancel',
        getState: jest.fn().mockResolvedValue('active'),
        remove: jest.fn(),
      };
      mockQueue.getJob.mockResolvedValueOnce(mockJob);

      const result = await factory.cancel('job_active_cancel');

      expect(result).toBe(true);
      expect(mockJob.remove).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns formatted job state and progress', async () => {
      const mockJob = {
        id: 'job_active',
        getState: jest.fn().mockResolvedValue('active'),
        progress: 45,
      };
      mockQueue.getJob.mockResolvedValueOnce(mockJob);

      const status = await factory.getStatus('job_active');

      expect(status).toEqual({
        id: 'job_active',
        state: 'active',
        progress: 45,
      });
    });

    it('returns unknown state when job is not found', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null);

      const status = await factory.getStatus('missing_job');

      expect(status).toEqual({
        id: 'missing_job',
        state: 'unknown',
      });
    });
  });

  describe('getCapacity', () => {
    it('aggregates active workers and scheduler capacity snapshot', async () => {
      const capacity = await factory.getCapacity('user_1');

      expect(capacity).toEqual({
        activeWorkers: 1,
        globalMaxSlots: 4,
        defaultUserSlots: 2,
        activeSlots: 1,
        availableSlots: 3,
        interactiveReservedSlots: 1,
        waitingForSlot: 0,
        waitingReasons: { user_slot: 0, global_capacity: 0 },
      });
      expect(mockScheduler.getCapacitySnapshot).toHaveBeenCalledWith('user_1');
    });
  });
});
