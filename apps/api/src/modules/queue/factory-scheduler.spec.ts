import { FactorySchedulerService } from './factory-scheduler.service';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';
import { priorityToBullNumber } from './indexing.types';

describe('FactorySchedulerService (Phase F5)', () => {
  let scheduler: FactorySchedulerService;
  let mockDb: jest.Mocked<DatabaseService>;
  let mockConfig: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    } as any;

    mockConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'GLOBAL_MAX_ACTIVE_JOBS') return 2;
        if (key === 'DEFAULT_USER_SLOTS') return 1;
        if (key === 'INTERACTIVE_RESERVED_SLOTS') return 1;
        return defaultValue;
      }),
    } as any;

    scheduler = new FactorySchedulerService(mockDb, mockConfig);
  });

  describe('priorityToBullNumber', () => {
    it('ensures interactive strictly preempts normal and batch', () => {
      const interactivePri = priorityToBullNumber('interactive');
      const normalPriSmall = priorityToBullNumber('normal', 10);
      const normalPriLarge = priorityToBullNumber('normal', 2000);
      const batchPriSmall = priorityToBullNumber('batch', 10);
      const batchPriLarge = priorityToBullNumber('batch', 2000);

      expect(interactivePri).toBe(1);
      expect(normalPriSmall).toBe(5);
      expect(normalPriLarge).toBeGreaterThanOrEqual(5);
      expect(normalPriLarge).toBeLessThan(10);
      expect(batchPriSmall).toBe(10);
      expect(batchPriLarge).toBeGreaterThanOrEqual(10);

      expect(interactivePri).toBeLessThan(normalPriSmall);
      expect(normalPriLarge).toBeLessThan(batchPriSmall);
    });
  });

  describe('checkSlotAvailability', () => {
    it('allows a normal job when global and user capacity are available', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] } as any);

      const decision = await scheduler.checkSlotAvailability('user_1', 'normal');
      expect(decision).toEqual({ canRun: true });
    });

    it('throttles with user_slot when user active count reaches DEFAULT_USER_SLOTS', async () => {
      // 1 active job for user_1
      mockDb.query.mockResolvedValueOnce({
        rows: [{ user_id: 'user_1', count: '1' }],
      } as any);

      const decision = await scheduler.checkSlotAvailability('user_1', 'normal');
      expect(decision).toEqual({
        canRun: false,
        waitingReason: 'user_slot',
      });
    });

    it('allows an interactive job when user has reached DEFAULT_USER_SLOTS via reserved headroom', async () => {
      // 1 active job for user_1 (reaches DEFAULT_USER_SLOTS = 1, but below DEFAULT_USER_SLOTS + INTERACTIVE_RESERVED_SLOTS = 2)
      mockDb.query.mockResolvedValueOnce({
        rows: [{ user_id: 'user_1', count: '1' }],
      } as any);

      const decision = await scheduler.checkSlotAvailability('user_1', 'interactive');
      expect(decision).toEqual({ canRun: true });
    });

    it('throttles with global_capacity when total active count reaches GLOBAL_MAX_ACTIVE_JOBS', async () => {
      // 2 active jobs from different users
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { user_id: 'user_2', count: '1' },
          { user_id: 'user_3', count: '1' },
        ],
      } as any);

      const decision = await scheduler.checkSlotAvailability('user_1', 'normal');
      expect(decision).toEqual({
        canRun: false,
        waitingReason: 'global_capacity',
      });
    });

    it('reserves interactive capacity by blocking batch jobs when only reserved slots remain', async () => {
      // 1 active job globally (user_2). Max is 2, reserved interactive is 1.
      mockDb.query.mockResolvedValueOnce({
        rows: [{ user_id: 'user_2', count: '1' }],
      } as any);

      // Batch job should be blocked
      const batchDecision = await scheduler.checkSlotAvailability('user_1', 'batch');
      expect(batchDecision).toEqual({
        canRun: false,
        waitingReason: 'global_capacity',
      });

      // Interactive job should be allowed
      mockDb.query.mockResolvedValueOnce({
        rows: [{ user_id: 'user_2', count: '1' }],
      } as any);

      const interactiveDecision = await scheduler.checkSlotAvailability('user_1', 'interactive');
      expect(interactiveDecision).toEqual({ canRun: true });
    });
  });

  describe('claimSlot', () => {
    it('marks the job active inside an advisory lock when capacity is free', async () => {
      const client = {
        query: jest.fn(async (sql: string) => {
          if (sql.includes('GROUP BY user_id')) return { rows: [] };
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      (mockDb as any).getClient = jest.fn().mockResolvedValue(client);

      const decision = await scheduler.claimSlot('bull_1', 'asset_1', 'user_1', 'normal');
      expect(decision).toEqual({ canRun: true });
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining("pg_advisory_xact_lock"),
      );
      const update = client.query.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes("UPDATE indexing_jobs"),
      );
      expect(update).toBeDefined();
      expect((update as any)?.[1]).toEqual(['bull_1', 'asset_1']);
      expect(client.release).toHaveBeenCalled();
    });

    it('does not mark active when global capacity is already full', async () => {
      const client = {
        query: jest.fn(async (sql: string) => {
          if (sql.includes('GROUP BY user_id')) {
            return {
              rows: [
                { user_id: 'user_2', count: '1' },
                { user_id: 'user_3', count: '1' },
              ],
            };
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      (mockDb as any).getClient = jest.fn().mockResolvedValue(client);

      const decision = await scheduler.claimSlot('bull_2', 'asset_2', 'user_1', 'normal');
      expect(decision).toEqual({ canRun: false, waitingReason: 'global_capacity' });
      const update = client.query.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes("UPDATE indexing_jobs"),
      );
      expect(update).toBeUndefined();
    });
  });

  describe('releaseSlot', () => {
    it('resets job to waiting status by default', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] } as any);
      await scheduler.releaseSlot('bull_123');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'waiting'"),
        ['bull_123'],
      );
    });

    it('marks job as failed when markFailed is true', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] } as any);
      await scheduler.releaseSlot('bull_123', true, 'Worker crash');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'failed'"),
        ['bull_123', 'Worker crash'],
      );
    });
  });

  describe('recordWaitingReason', () => {
    it('updates indexing_jobs with waiting_reason and descriptive stage', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] } as any);

      await scheduler.recordWaitingReason('bull_123', 'asset_456', 'user_slot');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE indexing_jobs'),
        expect.arrayContaining(['user_slot', 'waiting (user_slot)', 'bull_123', 'asset_456']),
      );
    });
  });

  describe('getCapacitySnapshot', () => {
    it('calculates accurate slot and waiting telemetry', async () => {
      mockDb.query
        // 1. Active jobs query
        .mockResolvedValueOnce({
          rows: [{ user_id: 'user_1', count: '1' }],
        } as any)
        // 2. Waiting reasons query
        .mockResolvedValueOnce({
          rows: [
            { waiting_reason: 'user_slot', count: '2' },
            { waiting_reason: 'global_capacity', count: '1' },
          ],
        } as any);

      const snapshot = await scheduler.getCapacitySnapshot('user_1');

      expect(snapshot.globalMaxSlots).toBe(2);
      expect(snapshot.defaultUserSlots).toBe(1);
      expect(snapshot.activeSlots).toBe(1);
      expect(snapshot.userActiveSlots).toBe(1);
      expect(snapshot.waitingForSlot).toBe(3);
      expect(snapshot.waitingReasons).toEqual({
        user_slot: 2,
        global_capacity: 1,
      });
    });
  });
});
