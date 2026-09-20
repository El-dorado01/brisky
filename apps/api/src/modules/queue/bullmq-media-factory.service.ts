import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MediaFactory, FactoryCapacity, FactoryJobStatus } from './media-factory.interface';
import { FactoryJobEnvelope, priorityToBullNumber } from './indexing.types';
import { FactorySchedulerService } from './factory-scheduler.service';

@Injectable()
export class BullmqMediaFactory implements MediaFactory {
  private readonly logger = new Logger(BullmqMediaFactory.name);
  readonly provider = 'bullmq';

  constructor(
    @InjectQueue('indexing-queue') private readonly queue: Queue<any>,
    @Optional() private readonly scheduler?: FactorySchedulerService,
  ) {}

  async dispatch(envelope: FactoryJobEnvelope): Promise<string> {
    const fileSizeMb = Math.round((envelope.source.fileSize || 0) / (1024 * 1024));
    const bullPriority = priorityToBullNumber(envelope.priority, fileSizeMb);

    // Only deduplicate waiting jobs of the same type and segment window
    try {
      const existingJobs = await this.queue.getJobs(['waiting', 'delayed']).catch(() => []);
      const segmentKey = (data: any): string => {
        const seg = data?.segment;
        if (!seg) return '';
        return `${seg.start_s}:${seg.end_s}`;
      };
      const incomingSeg = segmentKey(envelope);

      for (const exJob of existingJobs) {
        const exData = exJob.data as any;
        const exAssetId = exData?.asset_id || exData?.assetId;
        const exType = exData?.job_type || 'index_asset';
        if (
          exAssetId === envelope.asset_id &&
          exType === envelope.job_type &&
          segmentKey(exData) === incomingSeg
        ) {
          this.logger.log(
            `Removing redundant waiting ${exType} job ${exJob.id} for asset ${envelope.asset_id}`,
          );
          await exJob.remove().catch(() => undefined);
        }
      }
    } catch {
      // Non-fatal if query fails
    }

    const job = await this.queue.add(envelope.job_type, envelope, {
      jobId: envelope.job_id || undefined,
      priority: bullPriority,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 4000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    });

    return job.id || '';
  }

  async cancel(jobId: string): Promise<boolean> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return false;
      }
      const state = typeof job.getState === 'function' ? await job.getState().catch(() => 'unknown') : 'unknown';
      if (state === 'active') {
        // Active jobs cannot be forcibly unlinked from Redis queue; cooperative cancellation handles active workers
        return true;
      }
      await job.remove().catch(() => undefined);
      return true;
    } catch (err) {
      this.logger.warn(`Failed to cancel BullMQ job ${jobId}: ${err}`);
      return false;
    }
  }

  async getStatus(jobId: string): Promise<FactoryJobStatus> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return { id: jobId, state: 'unknown' };
      }
      const rawState = await job.getState();
      const state = (rawState as any) || 'unknown';
      return {
        id: jobId,
        state,
        progress: typeof job.progress === 'number' ? job.progress : undefined,
        error: job.failedReason || undefined,
      };
    } catch (err) {
      this.logger.warn(`Failed to retrieve BullMQ job ${jobId} status: ${err}`);
      return { id: jobId, state: 'unknown' };
    }
  }

  async getCapacity(userId?: string): Promise<FactoryCapacity> {
    const workers = await this.queue.getWorkers().catch(() => []);
    const snapshot = this.scheduler
      ? await this.scheduler.getCapacitySnapshot(userId)
      : {
          globalMaxSlots: 2,
          defaultUserSlots: 1,
          activeSlots: 0,
          userActiveSlots: 0,
          waitingForSlot: 0,
          interactiveReservedSlots: 1,
          waitingReasons: { user_slot: 0, global_capacity: 0 },
        };

    return {
      activeWorkers: workers.length,
      globalMaxSlots: snapshot.globalMaxSlots,
      defaultUserSlots: snapshot.defaultUserSlots,
      activeSlots: snapshot.activeSlots,
      availableSlots: Math.max(0, snapshot.globalMaxSlots - snapshot.activeSlots),
      interactiveReservedSlots: snapshot.interactiveReservedSlots,
      waitingForSlot: snapshot.waitingForSlot,
      waitingReasons: snapshot.waitingReasons,
    };
  }
}
