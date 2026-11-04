import { Readable } from 'stream';
import { MediaReadSession } from '../connector/media-connector.interface';
import { openSeekableMediaSource, SeekableMediaSource } from './seekable-media-source';
import { reserveCloudBytes, withSearchProgress } from '../../common/search-progress';

describe('bounded seekable decoder source', () => {
  const data = Buffer.from('abcdefghijklmnopqrstuvwxyz');
  let source: SeekableMediaSource | undefined;
  let session: MediaReadSession;
  beforeEach(() => {
    session = { size: data.length, version: 'v1', validate: jest.fn().mockResolvedValue(undefined),
      read: jest.fn(async (start: number, length: number) => ({ status: 206,
        contentRange: `bytes ${start}-${start + length - 1}/${data.length}`,
        stream: Readable.from([data.subarray(start, start + length)]) })) };
  });
  afterEach(async () => { await source?.close(); source = undefined; });
  it('fetches a small source once and reuses it for repeated decoder seeks', async () => {
    source = await openSeekableMediaSource(session, { maxBytes: 26, blockBytes: 4, smallFileCacheBytes: 26 });
    const calls = (session.read as jest.Mock).mock.calls.length;
    expect(calls).toBe(7);
    for (let i = 0; i < 3; i++) {
      expect(await (await fetch(source.url, { headers: { Range: 'bytes=10-16' } })).text()).toBe('klmnopq');
    }
    expect(session.read).toHaveBeenCalledTimes(calls);
    expect(source.bytesRead).toBe(26);
    session.validate = jest.fn().mockRejectedValue(new Error('source changed'));
    await expect(source.validate()).rejects.toThrow('source changed');
  });
  it('keeps ranged reads when the source exceeds the small-file threshold', async () => {
    source = await openSeekableMediaSource(session, { maxBytes: 20, smallFileCacheBytes: 10 });
    expect(session.read).not.toHaveBeenCalled();
    expect(await (await fetch(source.url, { headers: { Range: 'bytes=0-3' } })).text()).toBe('abcd');
    expect(source.bytesRead).toBe(4);
  });
  it('rejects a truncated small-file cache before exposing a decoder URL', async () => {
    session.read = jest.fn(async () => ({ status: 206, contentRange: 'bytes 0-25/26', stream: Readable.from(['bad']) }));
    await expect(openSeekableMediaSource(session, { maxBytes: 26, smallFileCacheBytes: 26 })).rejects.toThrow('truncated');
  });
  it('serves exact decoder-requested ranges through bounded blocks without staging a full file', async () => {
    const reserve = jest.fn(() => true);
    source = await openSeekableMediaSource(session, { maxBytes: 20, blockBytes: 4, reserve });
    const response = await fetch(source.url, { headers: { Range: 'bytes=10-16' } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 10-16/26');
    expect(await response.text()).toBe('klmnopq');
    expect(session.read).toHaveBeenNthCalledWith(1, 10, 4, expect.any(AbortSignal));
    expect(session.read).toHaveBeenNthCalledWith(2, 14, 3, expect.any(AbortSignal));
    expect(reserve.mock.calls).toEqual([[4], [3]]);
    expect(source.bytesRead).toBe(7);
    await source.validate();
    expect(session.validate).toHaveBeenCalledTimes(1);
  });
  it.each(['status', 'offset', 'truncated', 'oversized'])('rejects a %s range response before accepting evidence', async (kind) => {
    session.read = jest.fn(async () => ({ status: kind === 'status' ? 200 : 206,
      contentRange: kind === 'offset' ? 'bytes 1-4/26' : 'bytes 0-3/26',
      stream: Readable.from([Buffer.alloc(kind === 'truncated' ? 2 : kind === 'oversized' ? 8 : 4)]) }));
    source = await openSeekableMediaSource(session, { maxBytes: 10, blockBytes: 4 });
    await expect((async () => { const response = await fetch(source!.url, { headers: { Range: 'bytes=0-3' } });
      await response.arrayBuffer(); })()).rejects.toThrow();
    await expect(source.validate()).rejects.toThrow(/invalid byte range|truncated|exceeded/);
  });
  it('refuses requests beyond the shared transfer allowance', async () => {
    source = await openSeekableMediaSource(session, { maxBytes: 4, blockBytes: 4 });
    const first = await fetch(source.url, { headers: { Range: 'bytes=0-3' } });
    expect(await first.text()).toBe('abcd');
    await expect((async () => { const response = await fetch(source!.url, { headers: { Range: 'bytes=4-7' } });
      await response.arrayBuffer(); })()).rejects.toThrow();
    await expect(source.validate()).rejects.toThrow('budget exhausted');
    expect(session.read).toHaveBeenCalledTimes(1);
  });
  it('charges HTTP reader activity to its originating search context', async () => {
    await withSearchProgress(false, () => {}, async () => {
      source = await openSeekableMediaSource(session, { maxBytes: 20, blockBytes: 4,
        reserve: (bytes) => reserveCloudBytes(bytes, 4) });
      const response = await fetch(source.url, { headers: { Range: 'bytes=0-3' } });
      expect(await response.text()).toBe('abcd');
      expect(reserveCloudBytes(1, 4)).toBe(false);
    });
  });
  it('does not fetch data for HEAD, unknown tokens or invalid ranges', async () => {
    source = await openSeekableMediaSource(session, { maxBytes: 10 });
    expect((await fetch(source.url, { method: 'HEAD' })).headers.get('content-length')).toBe('26');
    expect((await fetch(source.url + '/other')).status).toBe(404);
    expect((await fetch(source.url, { headers: { Range: 'bytes=500-600' } })).status).toBe(416);
    expect(session.read).not.toHaveBeenCalled();
  });
  it('rejects a source version change after decoding', async () => {
    session.validate = jest.fn().mockRejectedValue(new Error('source changed'));
    source = await openSeekableMediaSource(session, { maxBytes: 10 });
    await expect(source.validate()).rejects.toThrow('source changed');
  });
  it('destroys a late stream after cancellation and closes the listener', async () => {
    const controller = new AbortController();
    let finish!: () => void;
    const ready = new Promise<void>((resolve) => { finish = resolve; });
    let stream!: Readable;
    session.read = jest.fn(async () => {
      await ready;
      stream = Readable.from([Buffer.from('abcd')]);
      return { status: 206, contentRange: 'bytes 0-3/26', stream };
    });
    source = await openSeekableMediaSource(session, { maxBytes: 10, signal: controller.signal });
    const request = fetch(source.url, { headers: { Range: 'bytes=0-3' } }).then((response) => response.arrayBuffer());
    const rejection = expect(request).rejects.toThrow();
    while (!(session.read as jest.Mock).mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    finish();
    await rejection;
    await source.close();
    expect(stream.destroyed).toBe(true);
  });
});
