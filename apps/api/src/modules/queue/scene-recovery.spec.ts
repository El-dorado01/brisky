import { IndexingProcessor } from './indexing.processor';

describe('streamed scene recovery', () => {
  const recover = (extract: any, download: any, streamed = true) =>
    (IndexingProcessor.prototype as any).recoverStreamedScenes.call(
      { logger: { warn: jest.fn() } }, extract, download, streamed);
  it.each(['Streamed scene detection did not complete successfully', 'Required keyframe missing for scene 1 at 6s', 'ffprobe metadata probe timed out after 15000ms'])(
    'downloads and retries once after %s', async message => {
      let local = false;
      const extract = jest.fn(async () => { if (!local) throw new Error(message); return ['frame']; });
      const download = jest.fn(async () => { local = true; });
      await expect(recover(extract, download)).resolves.toEqual(['frame']);
      expect(extract).toHaveBeenCalledTimes(2);
      expect(download).toHaveBeenCalledTimes(1);
    });
  it.each([false, true])('preserves unrelated failures (streamed=%s)', async streamed => {
    const download = jest.fn();
    await expect(recover(async () => { throw new Error('Scene preparation cancelled'); }, download, streamed)).rejects.toThrow('cancelled');
    expect(download).not.toHaveBeenCalled();
  });
  it('does not download for local extraction errors', async () => {
    const download = jest.fn();
    await expect(recover(async () => { throw new Error('Required keyframe missing'); }, download, false)).rejects.toThrow('keyframe');
    expect(download).not.toHaveBeenCalled();
  });
  it('propagates size/version/download guard failures without another extraction', async () => {
    const extract = jest.fn().mockRejectedValue(new Error('Required keyframe missing'));
    await expect(recover(extract, async () => { throw new Error('Source changed'); })).rejects.toThrow('Source changed');
    expect(extract).toHaveBeenCalledTimes(1);
  });
  it('does not loop when local decoding also fails', async () => {
    const extract = jest.fn().mockRejectedValue(new Error('Required keyframe missing'));
    const download = jest.fn().mockResolvedValue(undefined);
    await expect(recover(extract, download)).rejects.toThrow('keyframe');
    expect(download).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledTimes(2);
  });
});
