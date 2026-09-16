import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { JobPriority, WaitingReason } from './indexing.types';

export interface SlotDecision {
  canRun: boolean;
  waitingReason?: WaitingReason;
}

export interface CapacitySnapshot {
  globalMaxSlots: number;
  defaultUserSlots: number;
  interactiveReservedSlots: number;
  activeSlots: number;
  userActiveSlots: number;
  waitingForSlot: number;
  waitingReasons: {
    user_slot: number;
    global_capacity: number;
  };
}

@Injectable()
export class FactorySchedulerService {
  private readonly logger = new Logger(FactorySchedulerService.name);
  readonly globalMaxActiveJobs: number;
  readonly defaultUserSlots: number;
  readonly interactiveReservedSlots: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.globalMaxActiveJobs = Number(
      this.configService.get('GLOBAL_MAX_ACTIVE_JOBS', 2),
    );
    this.defaultUserSlots = Number(
      this.configService.get('DEFAULT_USER_SLOTS', 1),
    );
    this.interactiveReservedSlots = Number(
      this.configService.get('INTERACTIVE_RESERVED_SLOTS', 1),
    );
  }

  evaluateCounts(
    rows: Array<{ user_id: string; count: string | number }>,
    userId: string,
    priority: JobPriority = 'normal',
  ): SlotDecision {
    let globalActive = 0;
    let userActive = 0;

    for (const row of rows) {
      const c = parseInt(String(row.count), 10) || 0;
      globalActive += c;
      if (row.user_id === userId) {
        userActive += c;
      }
    }

    const effectiveUserSlots =
      priority === 'interactive'
        ? this.defaultUserSlots + this.interactiveReservedSlots
        : this.defaultUserSlots;

    if (userActive >= effectiveUserSlots) {
      return { canRun: false, waitingReason: 'user_slot' };
    }

    if (globalActive >= this.globalMaxActiveJobs) {
      return { canRun: false, waitingReason: 'global_capacity' };
    }

    if (priority === 'batch') {
      const batchCapacityLimit = Math.max(
        0,
        this.globalMaxActiveJobs - this.interactiveReservedSlots,
      );
      if (globalActive >= batchCapacityLimit) {
        return { canRun: false, waitingReason: 'global_capacity' };
      }
    }

    return { canRun: true };
  }

  async checkSlotAvailability(
    userId: string,
    priority: JobPriority = 'normal',
  ): Promise<SlotDecision> {
    const activeRes = await this.db.query<{ user_id: string; count: string }>(
      `SELECT user_id, COUNT(*)::int AS count
       FROM indexing_jobs
       WHERE status = 'active'
       GROUP BY user_id`,
    );
    return this.evaluateCounts(activeRes.rows, userId, priority);
  }

  /**
   * Atomically claim a processing slot: advisory lock, re-check counts, then
   * mark the job active. Two worker containers cannot both pass the same slot.
   */
  async claimSlot(
    bullJobId: string,
    assetId: string,
    userId: string,
    priority: JobPriority = 'normal',
  ): Promise<SlotDecision> {
    if (typeof this.db.getClient !== 'function') {
      const peek = await this.checkSlotAvailability(userId, priority);
      if (!peek.canRun) return peek;
      await this.db.query(
        `UPDATE indexing_jobs
         SET status = 'active', stage = 'active', waiting_reason = NULL,
             started_at = COALESCE(started_at, NOW()), updated_at = NOW()
         WHERE bull_job_id = $1`,
        [bullJobId],
      );
      return { canRun: true };
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('brisky-factory-slots'))`);
      const activeRes = await client.query<{ user_id: string; count: string }>(
        `SELECT user_id, COUNT(*)::int AS count
         FROM indexing_jobs
         WHERE status = 'active'
         GROUP BY user_id`,
      );
      const decision = this.evaluateCounts(activeRes.rows, userId, priority);
      if (!decision.canRun) {
        await client.query('COMMIT');
        return decision;
      }

      await client.query(
        `UPDATE indexing_jobs
         SET status = 'active', stage = 'active', waiting_reason = NULL,
             started_at = COALESCE(started_at, NOW()), updated_at = NOW()
         WHERE bull_job_id = $1 OR asset_id = $2`,
        [bullJobId, assetId],
      );
      await client.query('COMMIT');
      this.logger.debug(
        `Claimed factory slot for job ${bullJobId} (asset ${assetId}, user ${userId}, ${priority})`,
      );
      return { canRun: true };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async releaseSlot(bullJobId: string, markFailed = false, errorMsg?: string): Promise<void> {
    if (markFailed) {
      await this.db.query(
        `UPDATE indexing_jobs
         SET status = 'failed', stage = 'failed', error = COALESCE($2, error), finished_at = NOW(), updated_at = NOW()
         WHERE bull_job_id = $1 AND status = 'active'`,
        [bullJobId, errorMsg || 'Worker process failed unexpectedly'],
      );
    } else {
      await this.db.query(
        `UPDATE indexing_jobs
         SET status = 'waiting', stage = 'queued', updated_at = NOW()
         WHERE bull_job_id = $1 AND status = 'active'`,
        [bullJobId],
      );
    }
  }

  async recordWaitingReason(
    bullJobId: string,
    assetId: string,
    reason: WaitingReason,
  ): Promise<void> {
    await this.db.query(
      `UPDATE indexing_jobs
       SET waiting_reason = $1, stage = $2, updated_at = NOW()
       WHERE (bull_job_id = $3 OR asset_id = $4)
         AND status = 'waiting'`,
      [reason, `waiting (${reason})`, bullJobId, assetId],
    );
  }

  async clearWaitingReason(bullJobId: string, assetId: string): Promise<void> {
    await this.db.query(
      `UPDATE indexing_jobs
       SET waiting_reason = NULL, updated_at = NOW()
       WHERE (bull_job_id = $1 OR asset_id = $2)`,
      [bullJobId, assetId],
    );
  }

  async getCapacitySnapshot(userId?: string): Promise<CapacitySnapshot> {
    const activeRes = await this.db.query<{ user_id: string; count: string }>(
      `SELECT user_id, COUNT(*)::int AS count
       FROM indexing_jobs
       WHERE status = 'active'
       GROUP BY user_id`,
    );

    let globalActive = 0;
    let userActive = 0;
    for (const row of activeRes.rows) {
      const c = parseInt(row.count, 10) || 0;
      globalActive += c;
      if (userId && row.user_id === userId) {
        userActive += c;
      }
    }

    const userClause = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    const waitingRes = await this.db.query<{
      waiting_reason: string;
      count: string;
    }>(
      `SELECT waiting_reason, COUNT(*)::int AS count
       FROM indexing_jobs
       WHERE status = 'waiting' AND waiting_reason IS NOT NULL ${userClause}
       GROUP BY waiting_reason`,
      params,
    );

    let userSlotWaiters = 0;
    let globalCapWaiters = 0;

    for (const row of waitingRes.rows) {
      const c = parseInt(row.count, 10) || 0;
      if (row.waiting_reason === 'user_slot') userSlotWaiters += c;
      else if (row.waiting_reason === 'global_capacity') globalCapWaiters += c;
    }

    return {
      globalMaxSlots: this.globalMaxActiveJobs,
      defaultUserSlots: this.defaultUserSlots,
      interactiveReservedSlots: this.interactiveReservedSlots,
      activeSlots: globalActive,
      userActiveSlots: userActive,
      waitingForSlot: userSlotWaiters + globalCapWaiters,
      waitingReasons: {
        user_slot: userSlotWaiters,
        global_capacity: globalCapWaiters,
      },
    };
  }
}
