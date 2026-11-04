import { recordFactoryStep,summarizeFactoryRuns,factoryStage } from './factory-telemetry';
import { DelayedError } from 'bullmq';
describe('Factory recorded stages',()=>{
  const env={user_id:'owner',asset_id:'asset'} as any,job={id:'job',attemptsMade:1} as any;
  it('records fast completions and failures without losing them between polls',async()=>{
    const db={query:jest.fn().mockResolvedValue({rowCount:1})};
    await expect(recordFactoryStep(db as any,job,env,'scene_detection',async()=>42)).resolves.toBe(42);
    expect(db.query.mock.calls[0][1]).toEqual(expect.arrayContaining(['owner','asset','scenes','scene_detection',2]));
    expect(db.query.mock.calls[1][1][1]).toBe('completed');
    await expect(recordFactoryStep(db as any,job,env,'analyze_frames',async()=>{throw Error('failed');})).rejects.toThrow('failed');
    expect(db.query.mock.calls[3][1][1]).toBe('failed');
  });
  it('keeps deferred jobs out of failure metrics and tolerates telemetry write failure',async()=>{
    const db={query:jest.fn().mockResolvedValue({rowCount:1})};
    await expect(recordFactoryStep(db as any,job,env,'embed',async()=>{throw new DelayedError();})).rejects.toBeInstanceOf(DelayedError);
    expect(db.query.mock.calls[1][1][1]).toBe('deferred');
    db.query.mockRejectedValue(Error('metrics unavailable'));
    await expect(recordFactoryStep(db as any,job,env,'embed',async()=>42)).resolves.toBe(42);
  });
  it('counts distinct files while measuring recorded runs and exposes completion history',()=>{
    const rows=[{id:'1',asset_id:'a',stage:'scenes',name:'video',status:'completed',duration_ms:1000,finished_at:'time'},
      {id:'2',asset_id:'a',stage:'scenes',name:'video',status:'completed',duration_ms:3000,finished_at:'time'},
      {id:'3',asset_id:'b',stage:'scenes',name:'other',status:'failed',finished_at:'time'},
      {id:'4',asset_id:'c',stage:'scenes',name:'live',status:'running',progress:14,started_at:'time'}];
    const scenes=summarizeFactoryRuns(rows).find(s=>s.id==='scenes')!;
    expect(scenes).toMatchObject({doneToday:1,failedToday:1,completedRuns:2,avgDurationMs:2000});
    expect(scenes.successRate).toBeCloseTo(200/3);expect(scenes.files[0].name).toBe('live');expect(scenes.activity).toHaveLength(3);
    expect(scenes.activity.find(a=>a.assetId==='a')?.steps).toHaveLength(2);
    expect(factoryStage('ffmpeg_outputs')).toBe('fetch');expect(factoryStage('gemini_video')).toBe('understand');
  });
  it('does not report intermediate scratch cleanup as finished pipeline work',()=>{
    const rows=[{id:'1',asset_id:'a',asset_status:'processing',stage:'purge',status:'completed'},
      {id:'2',asset_id:'b',asset_status:'indexed',stage:'purge',status:'completed'}];
    const purge=summarizeFactoryRuns(rows).find(s=>s.id==='purge')!;
    expect(purge.doneToday).toBe(1);expect(purge.activity.map(a=>a.assetId)).toEqual(['b']);
  });
});
