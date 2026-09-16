import { FactoryJobEnvelope } from './indexing.types';

export interface FactoryCapacity {
  activeWorkers: number;
  globalMaxSlots: number;
  defaultUserSlots: number;
  activeSlots: number;
  availableSlots: number;
  interactiveReservedSlots: number;
  waitingForSlot?: number;
  waitingReasons?: {
    user_slot: number;
    global_capacity: number;
  };
}

export interface FactoryJobStatus {
  id: string;
  state: 'waiting' | 'delayed' | 'active' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  progress?: number;
  error?: string;
}

export interface MediaFactory {
  readonly provider: string;
  dispatch(envelope: FactoryJobEnvelope): Promise<string>;
  cancel(jobId: string): Promise<boolean>;
  getStatus(jobId: string): Promise<FactoryJobStatus>;
  getCapacity(userId?: string): Promise<FactoryCapacity>;
}

export const MEDIA_FACTORY = 'MEDIA_FACTORY';
