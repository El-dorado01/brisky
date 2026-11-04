import { assertSearchActive, searchDelay, searchSignal, withSearchDeadline } from './search-deadline';

describe('search deadlines', () => {
  it('propagates an external client abort into nested work', async () => {
    const controller = new AbortController();
    const work = withSearchDeadline(10000,
      () => withSearchDeadline(10000, () => searchDelay(10000)), controller.signal);
    controller.abort();
    await expect(work).rejects.toThrow('Search deadline');
  });
  it('aborts detached continuations after the deadline', async () => {
    let expired!: () => void;
    const later = new Promise<void>((resolve) => { expired = resolve; });
    let blocked = false;
    await expect(withSearchDeadline(10, async () => {
      await later;
      try { assertSearchActive(); } catch { blocked = true; }
    })).rejects.toThrow('Search deadline');
    expired();
    await new Promise((resolve) => setImmediate(resolve));
    expect(blocked).toBe(true);
    expect(searchSignal()).toBeUndefined();
  });
  it('cancels retry delays when a parent search expires', async () => {
    const started = Date.now();
    await expect(withSearchDeadline(10, () => withSearchDeadline(10000, () => searchDelay(10000)))).rejects.toThrow('Search deadline');
    expect(Date.now() - started).toBeLessThan(2000);
  });
  it('keeps independent search contexts isolated', async () => {
    const [short, long] = await Promise.allSettled([
      withSearchDeadline(10, () => searchDelay(1000)),
      withSearchDeadline(1000, async () => { await searchDelay(30); assertSearchActive(); return 'ok'; }),
    ]);
    expect(short.status).toBe('rejected');
    expect(long).toEqual({ status: 'fulfilled', value: 'ok' });
  });
});
