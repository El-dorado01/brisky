import { IndexingService } from './indexing.service';
import { FactoryJobEnvelope } from './indexing.types';

describe('durable clip operations', () => {
  const input = (owner = 'owner'): FactoryJobEnvelope => ({ job_type: 'extract_clip', asset_id: 'asset', user_id: owner,
    priority: 'interactive', source: { provider: 'upload' }, segment: { start_s: 0, end_s: 5 } });
  function fixture() {
    const operations: any[] = [];
    const jobs = new Map<string, any>();
    let committed = false;
    const client = { release: jest.fn(), query: jest.fn(async (sql: string, args: any[] = []) => {
      if (sql === 'BEGIN') committed = false;
      if (sql === 'COMMIT') committed = true;
      if (sql.includes('INSERT INTO clip_operations')) {
        if (operations.some((o) => o.user_id === args[1] && o.key_hash === args[3])) return { rows: [] };
        const operation = { id: args[0], user_id: args[1], key_hash: args[3], request_hash: args[4], bull_job_id: args[5],
          output_asset_id: args[6], envelope: JSON.parse(args[7]), dispatch_pending: true };
        operations.push(operation); return { rows: [operation] };
      }
      if (sql.includes('SELECT * FROM clip_operations')) return { rows: operations.filter((o) => o.user_id === args[0] && o.key_hash === args[1]) };
      if (sql.includes('INSERT INTO indexing_jobs')) {
        if (!jobs.has(args[0])) jobs.set(args[0], { bull_job_id: args[0], asset_id: args[1], user_id: args[2], status: 'waiting', clip_operation_id: args[5] });
      }
      return { rows: [] };
    }) };
    const db = { getClient: async () => client, query: jest.fn(async (sql: string, args: any[] = []) => {
      if (sql.includes('SELECT j.id')) return { rows: [...jobs.values()].filter((j) => j.bull_job_id === args[0] && j.user_id === args[1]).map((j) =>
        ({ ...j, dispatch_pending: operations.find((o) => o.id === j.clip_operation_id)?.dispatch_pending })) };
      if (sql.includes('RETURNING o.envelope')) return { rows: operations.filter((o) => o.id === args[0] && o.dispatch_pending).map((o) => ({ envelope: o.envelope })) };
      if (sql.includes('SET dispatch_pending=FALSE')) operations.find((o) => o.id === args[0]).dispatch_pending = false;
      return { rows: [] };
    }) };
    const queue = { getJob: jest.fn().mockResolvedValue(null) };
    const factory = { dispatch: jest.fn(async (envelope: FactoryJobEnvelope) => {
      expect(committed).toBe(true); return envelope.job_id!;
    }) };
    const service = new IndexingService(queue as any, db as any, { get: (_key: string, fallback: unknown) => fallback } as any, undefined, factory as any);
    return { service, client, db, queue, factory, operations, jobs };
  }
  it('replays the same key without another dispatch and rejects changed parameters', async () => {
    const f = fixture();
    const first = await f.service.enqueueClip(input(), 'request-1');
    const second = await f.service.enqueueClip(input(), 'request-1');
    expect(second.job_id).toBe(first.job_id);
    expect(second.reused).toBe(true);
    expect(f.factory.dispatch).toHaveBeenCalledTimes(1);
    await expect(f.service.enqueueClip({ ...input(), segment: { start_s: 0, end_s: 6 } }, 'request-1')).rejects.toMatchObject({ status: 409 });
    expect(f.client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(f.operations).toHaveLength(1);
  });
  it('isolates keys and job lookup by owner', async () => {
    const f = fixture();
    const first = await f.service.enqueueClip(input(), 'same-key');
    const other = await f.service.enqueueClip(input('other'), 'same-key');
    expect(other.job_id).not.toBe(first.job_id);
    await expect(f.service.getJob(first.job_id, 'other')).rejects.toMatchObject({ status: 404 });
    await expect(f.service.getJob(first.job_id, '')).rejects.toMatchObject({ status: 401 });
  });
  it('retains a queue-outage operation and recovers without creating another job row', async () => {
    const f = fixture();
    f.factory.dispatch.mockRejectedValueOnce(new Error('queue offline'));
    const first = await f.service.enqueueClip(input(), 'outage');
    expect(first.status).toBe('dispatch_pending');
    const second = await f.service.enqueueClip(input(), 'outage');
    expect(second.job_id).toBe(first.job_id);
    expect(second.status).toBe('queued');
    expect(f.jobs.size).toBe(1);
  });
  it('recovers an ambiguous queue acknowledgement by finding the retained queue identity', async () => {
    const f = fixture();
    f.factory.dispatch.mockRejectedValueOnce(new Error('ack lost after delivery'));
    const first = await f.service.enqueueClip(input(), 'ambiguous');
    f.queue.getJob.mockResolvedValue({ getState: async () => 'waiting' });
    await f.service.enqueueClip(input(), 'ambiguous');
    expect(f.factory.dispatch).toHaveBeenCalledTimes(1);
    expect(f.jobs.get(first.job_id).status).toBe('waiting');
  });
});

describe('atomic clip publication', () => {
  function fixture() {
    const operation = { completed: false, output_asset_id: 'clip-result', bull_job_id: 'clip-job' };
    const client = { release: jest.fn(), query: jest.fn(async (sql: string) => {
      if (sql.startsWith('SELECT completed')) return { rows: [operation] };
      if (sql.startsWith('SELECT cancel_requested')) return { rows: [{ status: 'active', cancel_requested: false }] };
      if (sql.includes('SET completed=TRUE')) operation.completed = true;
      return { rows: [] };
    }) };
    const service = new IndexingService({} as any, { getClient: async () => client } as any,
      { get: (_key: string, fallback: unknown) => fallback } as any);
    return { service, client };
  }
  it('rolls back publication on a lineage failure rather than marking the operation completed', async () => {
    const { service, client } = fixture();
    await expect(service.publishClip('operation', 'owner', 'clip-result', 'clip-job', async () => { throw new Error('lineage failed'); })).rejects.toThrow('lineage failed');
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => sql.includes('SET completed=TRUE'))).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });
  it('publishes output once and skips repeated publication callbacks', async () => {
    const { service, client } = fixture();
    const work = jest.fn().mockResolvedValue(undefined);
    await service.publishClip('operation', 'owner', 'clip-result', 'clip-job', work);
    await service.publishClip('operation', 'owner', 'clip-result', 'clip-job', work);
    expect(work).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    await expect(service.publishClip('operation', 'owner', 'different-output', 'clip-job', work)).rejects.toThrow('identity mismatch');
  });
});
