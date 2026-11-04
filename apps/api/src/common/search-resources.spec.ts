import { SearchResources } from './search-resources';
import { acquireSearchResource, reserveCloudBytes, withSearchProgress } from './search-progress';

describe('request-owned search resources', () => {
  it('deduplicates concurrent and later acquisitions and reserves download bytes once', async () => {
    const cleanup = jest.fn();
    const create = jest.fn(async () => {
      expect(reserveCloudBytes(16, 16)).toBe(true);
      return { path: 'source', cleanup };
    });
    await withSearchProgress(false, () => {}, async () => {
      const [first, second] = await Promise.all([
        acquireSearchResource('owner:asset', create), acquireSearchResource('owner:asset', create),
      ]);
      expect(first!.value).toBe(second!.value);
      first!.release(); second!.release();
      const later = await acquireSearchResource('owner:asset', create);
      later!.release();
      expect(cleanup).not.toHaveBeenCalled();
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it('keeps resources alive until outstanding inspections release after request closure', async () => {
    const resources = new SearchResources();
    const cleanup = jest.fn();
    const lease = await resources.acquire('source', async () => ({ cleanup }));
    resources.close();
    expect(cleanup).not.toHaveBeenCalled();
    lease!.release(); lease!.release();
    expect(cleanup).toHaveBeenCalledTimes(1);
    await expect(resources.acquire('source', async () => ({ cleanup }))).rejects.toThrow('Search deadline');
  });
  it('cleans a download that finishes after its request closes', async () => {
    const resources = new SearchResources();
    const cleanup = jest.fn();
    let finish!: (value: { cleanup: () => void }) => void;
    const pending = resources.acquire('source', () => new Promise<{ cleanup: () => void }>((resolve) => { finish = resolve; }));
    await Promise.resolve();
    resources.close();
    finish({ cleanup });
    await expect(pending).rejects.toThrow('Search deadline');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it('does not repeatedly download a failed source within the same request', async () => {
    const resources = new SearchResources();
    const create = jest.fn().mockRejectedValue(new Error('cloud unavailable'));
    await expect(resources.acquire('source', create)).rejects.toThrow('cloud unavailable');
    await expect(resources.acquire('source', create)).rejects.toThrow('cloud unavailable');
    resources.close();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('isolates separate searches and owner keys', async () => {
    const create = jest.fn(async () => ({ cleanup: jest.fn() }));
    for (let i = 0; i < 2; i++) await withSearchProgress(false, () => {}, async () => {
      (await acquireSearchResource('alice:asset', create))!.release();
      (await acquireSearchResource('bob:asset', create))!.release();
    });
    expect(create).toHaveBeenCalledTimes(4);
    expect(await acquireSearchResource('outside-request', create)).toBeNull();
    expect(create).toHaveBeenCalledTimes(4);
  });
});
