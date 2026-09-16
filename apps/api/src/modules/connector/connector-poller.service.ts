import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { ConnectorsService } from './connectors.service';

@Injectable()
export class ConnectorPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectorPollerService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly activeSyncs = new Set<string>();

  constructor(
    private readonly db: DatabaseService,
    private readonly connectorsService: ConnectorsService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    if (process.env.IS_WORKER === 'true') {
      this.logger.log('Skipping connector poller inside the worker process (API owns continuous sync)');
      return;
    }

    const enabled = this.configService.get<string>('ENABLE_CONNECTOR_POLLING', 'true') !== 'false';
    if (!enabled) {
      this.logger.log('Connector polling is disabled via ENABLE_CONNECTOR_POLLING=false');
      return;
    }

    const intervalSec = Number(this.configService.get<number>('CONNECTOR_POLL_INTERVAL_SEC', 120)) || 120;
    const intervalMs = Math.max(10, intervalSec) * 1000;

    this.logger.log(`Starting continuous connector poller (interval: ${intervalSec}s)`);
    this.timer = setInterval(() => {
      this.pollAllAccounts().catch((err) => {
        this.logger.error(`Poller error: ${err.message}`);
      });
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pollAllAccounts(): Promise<void> {
    const accounts = await this.db.query<{ id: string; user_id: string; provider: string }>(
      `SELECT id, user_id, provider FROM connector_accounts WHERE status = 'connected'`,
    );

    if (!accounts?.rows || accounts.rows.length === 0) {
      return;
    }

    const maxWaitingBatch = Number(this.configService.get('MAX_WAITING_BATCH_JOBS', 50)) || 50;
    const waitingQuery = this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM indexing_jobs WHERE status = 'waiting' AND priority = 'batch'`,
    );
    const waitingRes =
      waitingQuery && typeof waitingQuery.then === 'function'
        ? await waitingQuery.catch(() => ({ rows: [{ count: '0' }] }))
        : { rows: [{ count: '0' }] };
    const waitingCount = parseInt(waitingRes?.rows?.[0]?.count || '0', 10);
    if (waitingCount >= maxWaitingBatch) {
      this.logger.warn(
        `Poller skipping tick: backlog has ${waitingCount} waiting batch jobs (threshold: ${maxWaitingBatch}). Waiting for factory to drain.`,
      );
      return;
    }

    for (const account of accounts.rows) {
      if (this.activeSyncs.has(account.id)) {
        this.logger.debug(`Account ${account.id} sync already in progress, skipping poller tick`);
        continue;
      }

      this.activeSyncs.add(account.id);
      try {
        await this.connectorsService.syncAccountChanges(account.id, account.user_id);
      } catch (err: any) {
        this.logger.error(`Poller sync failed for account ${account.id}: ${err.message}`);
      } finally {
        this.activeSyncs.delete(account.id);
      }
    }
  }
}
