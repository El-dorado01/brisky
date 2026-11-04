import { IndexingProcessor } from './indexing.processor';
describe('queued embedding dependencies',()=>{
  const envelope:any={asset_id:'asset',user_id:'owner',processing_config:{unitId:'embed_scene_1'}};
  function make(audioStatus?:string,videoStatus='completed'){
    const processor:any=Object.create(IndexingProcessor.prototype);
    processor.unitsService={getUnit:jest.fn(async(_asset:string,id:string)=>{
      if(id==='embed_scene_1')return {status:'waiting',start_s:0,end_s:5,metadata:{sceneId:1}};
      if(id==='scene_1')return {status:'completed'};
      if(id==='audio_transcribe')return audioStatus?{status:audioStatus}:null;
      if(id==='gemini_video')return {status:videoStatus,metadata:{analysis:{segments:[{start_time:0,end_time:5,description:'A person opens a red notebook',visual_objects:['red notebook'],actions:['opens notebook']},{start_time:6,end_time:8,description:'Unrelated later scene'}]}}};
      return null;
    }),markUnitCompleted:jest.fn()};
    processor.delayJob=jest.fn(async()=>{throw Error('WAIT_FOR_DEPENDENCY');});
    processor.completeUnitJob=jest.fn();
    processor.db={query:jest.fn(async(sql:string)=>({rows:sql.includes('SELECT title')?[{title:'Desk',description:'A desk',visual_objects:['desk'],actions:[],sources:['visual']}]:sql.includes('SELECT raw_data')?[{raw_data:{text:'Open the notebook'}}]:[]}))};
    processor.mergerService={generateEmbeddingForText:jest.fn(async()=>({values:Array(384).fill(0)}))};
    return processor;
  }
  it.each([['active','completed'],['completed','waiting']])('waits for audio %s / video %s without generating a vector',async(audio,video)=>{
    const processor=make(audio,video);await expect(processor.executeEmbed({id:'job'},envelope)).rejects.toThrow('WAIT_FOR_DEPENDENCY');expect(processor.mergerService.generateEmbeddingForText).not.toHaveBeenCalled();expect(processor.unitsService.markUnitCompleted).not.toHaveBeenCalled();
  });
  it('merges only overlapping video evidence and completed speech, passing the owner to embedding selection',async()=>{
    const processor=make('completed');await processor.executeEmbed({id:'job'},envelope);
    const [text,owner]=processor.mergerService.generateEmbeddingForText.mock.calls[0];expect(owner).toBe('owner');expect(text).toContain('red notebook');expect(text).toContain('Open the notebook');expect(text).not.toContain('Unrelated');
    const update=processor.db.query.mock.calls.find(([sql]:[string])=>sql.includes('UPDATE media_segments'));expect(update[1][7]).toEqual(['visual','video','transcript']);expect(processor.unitsService.markUnitCompleted).toHaveBeenCalled();
  });
  it('serializes parsed keyframe arrays when cloning an existing index',async()=>{
    const processor:any=Object.create(IndexingProcessor.prototype),frames=[{timestamp:2,path:'keyframes/donor/frame.jpg'}];
    processor.db={query:jest.fn(async(sql:string)=>({rows:sql.includes('SELECT start_time')?[{start_time:0,end_time:4,keyframe_paths:frames,embedding_dim:384}]:[]}))};
    await processor.cloneExistingAsset('donor','recipient','owner');
    const inserted=processor.db.query.mock.calls.find(([sql]:[string])=>sql.includes('INSERT INTO media_segments'));
    expect(typeof inserted[1][12]).toBe('string');expect(JSON.parse(inserted[1][12])).toEqual(frames);
  });
  it('stores the actual frame provider/model instead of schema Google defaults',async()=>{
    const processor:any=Object.create(IndexingProcessor.prototype);processor.db={query:jest.fn(async()=>({rows:[]}))};processor.locator=(value:string)=>value;
    await processor.persistSceneCheckpoint('asset','owner',{sceneId:1,startTime:0,endTime:5,keyframePath:'frame.jpg',keyframes:[]},[{timestamp:2,description:'Desk',objects:[],activity:[],onScreenText:[],scene:'Office',provider:'baseten',model:'sponsor-model'}]);
    const inserted=processor.db.query.mock.calls.find(([sql]:[string])=>sql.includes('INSERT INTO media_segments'));
    expect(inserted[1].slice(-2)).toEqual(['baseten','sponsor-model']);
  });
});
