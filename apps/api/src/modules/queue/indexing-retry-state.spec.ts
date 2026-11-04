import { IndexingProcessor } from './indexing.processor';
import { DelayedError } from 'bullmq';
describe('Worker retry state matches BullMQ lifecycle',()=>{
  const make=(error:Error)=>{
    const p:any=Object.create(IndexingProcessor.prototype);
    p.logger={error:jest.fn(),log:jest.fn()};p.db={query:jest.fn().mockResolvedValue({rows:[],rowCount:0})};p.unitsService={};
    p.scheduler={claimSlot:jest.fn().mockResolvedValue({canRun:true}),releaseSlot:jest.fn().mockResolvedValue(undefined)};
    p.claimAssetLock=jest.fn().mockResolvedValue(true);p.releaseAssetLock=jest.fn().mockResolvedValue(undefined);
    p.executeAnalyzeFrames=jest.fn().mockRejectedValue(error);return p;
  };
  const data={job_type:'analyze_frames',asset_id:'asset',user_id:'owner',source:{provider:'upload'},priority:'normal'};
  it('restores waiting state for a retryable failure, including a failed unit row',async()=>{
    const p=make(Error('decode failed'));await expect(p.processScoped({id:'job',data,attemptsMade:0,opts:{attempts:3}})).rejects.toThrow('decode failed');
    expect(p.scheduler.releaseSlot).toHaveBeenCalledWith('job',false,'decode failed');
    expect(p.db.query).toHaveBeenCalledWith(expect.stringContaining("status='waiting',stage='retrying'"),['job','owner']);
  });
  it('marks terminal failures and preserves the error',async()=>{
    const p=make(Error('decode failed'));await expect(p.processScoped({id:'job',data,attemptsMade:2,opts:{attempts:3}})).rejects.toThrow();
    expect(p.scheduler.releaseSlot).toHaveBeenCalledWith('job',true,'decode failed');
    expect(p.db.query.mock.calls.some(([sql]:[string])=>sql.includes("stage='retrying'"))).toBe(false);
  });
  it('does not label cooperative dependency delays as failures',async()=>{
    const p=make(new DelayedError());await expect(p.processScoped({id:'job',data,attemptsMade:0,opts:{attempts:3}})).rejects.toBeInstanceOf(DelayedError);
    expect(p.scheduler.releaseSlot).toHaveBeenCalledWith('job');expect(p.logger.error).not.toHaveBeenCalled();
  });
});
