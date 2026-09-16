import { ConnectorPollerService } from './connector-poller.service';
import { ConnectorsService } from './connectors.service';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';

describe('ConnectorPollerService (Phase F6 Seam 3)', () => {
  let poller: ConnectorPollerService;
  let mockDb: any;
  let mockConnectorsService: any;
  let mockConfig: any;

  beforeEach(() => {
    jest.useFakeTimers();

    mockDb = {
      query: jest.fn(),
    };

    mockConnectorsService = {
      syncAccountChanges: jest.fn().mockResolvedValue({
        addedCount: 0,
        modifiedCount: 0,
        renamedCount: 0,
        deletedCount: 0,
      }),
    };

    mockConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'ENABLE_CONNECTOR_POLLING') return 'true';
        if (key === 'CONNECTOR_POLL_INTERVAL_SEC') return 120;
        return defaultValue;
      }),
    };

    poller = new ConnectorPollerService(mockDb, mockConnectorsService, mockConfig);
  });

  afterEach(() => {
    poller.onModuleDestroy();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('queries active connected accounts and triggers incremental sync for each', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { id: 'acc_1', user_id: 'user_1', provider: 'google_drive' },
        { id: 'acc_2', user_id: 'user_2', provider: 'google_drive' },
      ],
    });

    await poller.pollAllAccounts();

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE status = 'connected'"),
    );
    expect(mockConnectorsService.syncAccountChanges).toHaveBeenCalledWith('acc_1', 'user_1');
    expect(mockConnectorsService.syncAccountChanges).toHaveBeenCalledWith('acc_2', 'user_2');
  });

  it('prevents stampedes by skipping accounts currently being synced', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'acc_stuck', user_id: 'user_1', provider: 'google_drive' }],
    });

    // Simulate slow sync
    let resolveFirstSync: any;
    mockConnectorsService.syncAccountChanges.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirstSync = resolve; }),
    );

    const firstPollPromise = poller.pollAllAccounts();

    // Trigger second poll while first is still running
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'acc_stuck', user_id: 'user_1', provider: 'google_drive' }],
    });
    await poller.pollAllAccounts();

    // syncAccountChanges should only have been called ONCE for acc_stuck
    expect(mockConnectorsService.syncAccountChanges).toHaveBeenCalledTimes(1);

    resolveFirstSync({ addedCount: 0, modifiedCount: 0, renamedCount: 0, deletedCount: 0 });
    await firstPollPromise;
  });

  it('continues syncing other accounts if one account errors', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { id: 'acc_fail', user_id: 'user_1', provider: 'google_drive' },
        { id: 'acc_ok', user_id: 'user_2', provider: 'google_drive' },
      ],
    });

    mockConnectorsService.syncAccountChanges
      .mockRejectedValueOnce(new Error('Drive API rate limit'))
      .mockResolvedValueOnce({ addedCount: 1, modifiedCount: 0, renamedCount: 0, deletedCount: 0 });

    await poller.pollAllAccounts();

    expect(mockConnectorsService.syncAccountChanges).toHaveBeenCalledWith('acc_fail', 'user_1');
    expect(mockConnectorsService.syncAccountChanges).toHaveBeenCalledWith('acc_ok', 'user_2');
  });

  it('skips polling tick when waiting batch jobs exceed MAX_WAITING_BATCH_JOBS threshold', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: 'acc_1', user_id: 'user_1', provider: 'google_drive' }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: '60' }],
      });

    await poller.pollAllAccounts();

    expect(mockConnectorsService.syncAccountChanges).not.toHaveBeenCalled();
  });

  it('does not start polling interval if ENABLE_CONNECTOR_POLLING is false', () => {
    mockConfig.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'ENABLE_CONNECTOR_POLLING') return 'false';
      return defaultValue;
    });

    const disabledPoller = new ConnectorPollerService(mockDb, mockConnectorsService, mockConfig);
    disabledPoller.onModuleInit();

    expect(jest.getTimerCount()).toBe(0);
    disabledPoller.onModuleDestroy();
  });

  it('does not start a timer when running inside the worker process', () => {
    const previous = process.env.IS_WORKER;
    process.env.IS_WORKER = 'true';
    try {
      const workerPoller = new ConnectorPollerService(mockDb, mockConnectorsService, mockConfig);
      workerPoller.onModuleInit();
      expect(jest.getTimerCount()).toBe(0);
      workerPoller.onModuleDestroy();
    } finally {
      if (previous === undefined) delete process.env.IS_WORKER;
      else process.env.IS_WORKER = previous;
    }
  });

  it('starts polling interval and periodically invokes pollAllAccounts', () => {
    const pollSpy = jest.spyOn(poller, 'pollAllAccounts').mockImplementation(async () => {});

    poller.onModuleInit();
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(120000);
    expect(pollSpy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(120000);
    expect(pollSpy).toHaveBeenCalledTimes(2);
  });
});
