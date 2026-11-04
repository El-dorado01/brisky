import { IndexingProcessor } from './indexing.processor';
import { AiUsageLedger } from '../pipeline/ai-usage-ledger';

describe('streamed scene recovery', () => {
  it('keeps a retryable unit pending so finalization cannot release its budget early',async()=>{
    const worker:any={unitsService:{markUnitFailed:jest.fn().mockResolvedValue(undefined)},db:{query:jest.fn().mockResolvedValue({rows:[]})}};
    await (IndexingProcessor.prototype as any).failUnitJob.call(worker,{id:'job',attemptsMade:0,opts:{attempts:3}},
      {asset_id:'asset'},'scene_1',new Error('connection reset'));
    expect(worker.db.query.mock.calls[0][0]).toContain("status='waiting'");
    expect(worker.db.query.mock.calls[1][1]).toEqual(['connection reset','job','waiting','retrying']);
  });
  it('does not release a shared file plan when one terminal sibling fails',async()=>{
    const release=jest.spyOn(AiUsageLedger.prototype,'releasePlan');
    try {
      const settings:any={INDEX_BUDGET_PLAN_ENABLED:'true',INDEX_ALLOWED_CONNECTOR_ACCOUNT_IDS:'account'};
      const worker:any={configService:{get:(key:string,defaultValue:any)=>settings[key]??defaultValue},fullDownloadMaxBytes:100,
        processScoped:jest.fn().mockRejectedValue(new Error('Meta disconnected'))};
      const job:any={attemptsMade:2,opts:{attempts:3},data:{job_type:'analyze_frames',asset_id:'asset',user_id:'owner',
        source:{provider:'google_drive',connectorAccountId:'account',fileSize:10},priority:'normal'}};
      await expect(IndexingProcessor.prototype.process.call(worker,job)).rejects.toThrow('Meta disconnected');
      expect(release).not.toHaveBeenCalled();
    } finally { release.mockRestore(); }
  });
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
