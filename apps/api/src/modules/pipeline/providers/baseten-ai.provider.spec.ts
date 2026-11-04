import { ConfigService } from '@nestjs/config';
import { BasetenAiProvider,BASETEN_HACKATHON_MODEL as model } from './baseten-ai.provider';
import { AiIntelligenceService } from '../ai-intelligence.service';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('Baseten sponsor adapter',()=>{
  let root:string,file:string,fetcher:jest.Mock;
  const context={phase:'plan' as const,history:[{role:'user' as const,content:'Hi'}],evidence:[],selectionNotes:[],searchStatus:'not_requested' as const};
  const answer={action:'reply',text:'Hi! What would you like to explore?',searchQuery:'',citedEvidenceIds:[]};
  const config=(patch:Record<string,unknown>={})=>new ConfigService({BASETEN_AI_API_KEY:'sponsor-fixture',AI_API_KEY:'google-never-baseten',META_API_KEY:'meta-never-baseten',
    AI_BUDGET_USD:3,AI_USAGE_LEDGER_PATH:file,AI_MODEL_PRICING_JSON:JSON.stringify({['baseten/'+model]:{reservationUsd:0.25,inputUsdPerMillion:1.25,outputUsdPerMillion:4.25}}),...patch});
  const make=(patch:Record<string,unknown>={},ffmpeg:any={})=>new BasetenAiProvider(config(patch),ffmpeg,{getEmbeddingModel:()=> 'existing-embedding',generateEmbedding:jest.fn()} as any,fetcher);
  beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'brisky-baseten-'));file=path.join(root,'ledger.jsonl');fetcher=jest.fn();});
  afterEach(()=>{expect(path.dirname(path.resolve(root))).toBe(path.resolve(os.tmpdir()));expect(path.basename(root)).toMatch(/^brisky-baseten-/);fs.rmSync(root,{recursive:true,force:true});});
  function response(){return new Response(JSON.stringify({model,choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer),reasoning_content:'PRIVATE REASONING MUST NOT APPEAR'}}],usage:{prompt_tokens:100,completion_tokens:300,completion_tokens_details:{reasoning_tokens:280}}}),{status:200});}
  it('pins the sponsor endpoint/model and isolates credentials and reasoning',async()=>{
    fetcher.mockResolvedValueOnce(response());const result=await make().spaceConversation(context);
    const [url,request]=fetcher.mock.calls[0],body=JSON.parse(request.body);
    expect(url).toBe('https://inference.baseten.co/v1/chat/completions');expect(request.headers.Authorization).toBe('Bearer sponsor-fixture');expect(request.redirect).toBe('error');
    expect(body).toMatchObject({model,stream:false,max_tokens:4096,reasoning_effort:'high',response_format:{type:'json_schema'}});
    expect(body).not.toHaveProperty('max_completion_tokens');expect(request.body).not.toContain('google-never-baseten');expect(request.body).not.toContain('meta-never-baseten');
    expect(result).toMatchObject({...answer,usage:{provider:'baseten',inputTokens:100,outputTokens:300,estimatedUsd:0.0014}});
    expect(JSON.stringify(result)).not.toContain('PRIVATE REASONING');expect(fs.readFileSync(file,'utf8')).not.toContain('PRIVATE REASONING');
  });
  it('fails closed with a missing sponsor key, incorrect model, absent pricing or budget',async()=>{
    expect(make({BASETEN_AI_API_KEY:''}).isConfigured()).toBe(false);
    expect(()=>make({BASETEN_MODEL:'meta-models/muse-spark-open'})).toThrow('Use exactly');
    await expect(make({AI_MODEL_PRICING_JSON:'{}'}).spaceConversation(context)).rejects.toThrow();
    await expect(make({AI_BUDGET_USD:0}).spaceConversation(context)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  });
  it('attributes frame observations and aggregate usage to Baseten',async()=>{
    const image=path.join(root,'frame.jpg');fs.writeFileSync(image,Buffer.from([255,216,255,217]));
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({model,choices:[{finish_reason:'stop',message:{content:JSON.stringify({observations:[{frameId:0,timestamp:7.5,objects:['rectangle'],scene:'graphic',activity:[],onScreenText:['BRISKY 47'],description:'Test graphic'}]})}}],usage:{prompt_tokens:100,completion_tokens:50}}),{status:200}));
    const result=await make().analyzeFrames([{sceneId:0,startTime:7,endTime:8,representativeTimestamp:7.5,keyframePath:image,keyframes:[{timestamp:7.5,path:image}]}] as any);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({provider:'baseten',model,timestamp:7.5});
    expect(result.usage).toMatchObject({provider:'baseten',model,stage:'frame_analysis'});
  });
  it('does not retry auth/payment errors or swap to another model',async()=>{
    fetcher.mockResolvedValueOnce(new Response('',{status:402}));await expect(make().spaceConversation(context)).rejects.toThrow('baseten HTTP 402');expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects truncated/reasoning-only output instead of publishing chain of thought',async()=>{
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:null,reasoning_content:'hidden'}}],usage:{prompt_tokens:100,completion_tokens:4096}}),{status:200}));
    await expect(make().spaceConversation(context)).rejects.toThrow();expect(fs.readFileSync(file,'utf8')).not.toContain('hidden');
  });
  it('does not send oversized inputs or unvalidated video/audio requests',async()=>{
    await expect(make().spaceConversation({...context,history:[{role:'user',content:'x'.repeat(140000)}]})).rejects.toThrow('byte bound');
    await expect(make().analyzeVideo('not-read.mp4')).rejects.toThrow('not enabled');await expect(make().transcribeAudio('not-read.wav')).rejects.toThrow('not enabled');expect(fetcher).not.toHaveBeenCalled();
  });
  it('selects Baseten only explicitly and preserves the embedding vector space',()=>{
    const facade=new AiIntelligenceService(config({AI_PROVIDER:'baseten',AI_EMBEDDING_MODEL:'existing-google-space'}),{} as any);
    expect(facade.getPrimaryModel()).toBe(model);expect(facade.getModelCascade()).toEqual([model]);expect(facade.getEmbeddingModel()).toBe('existing-google-space');
    const google=new AiIntelligenceService(config({AI_PROVIDER:'google',AI_MODEL:'unchanged-google-model'}),{} as any);expect(google.getPrimaryModel()).toBe('unchanged-google-model');
  });
  const video=(dialogue='')=>({video_summary:'Colored graphic',key_themes:['colors'],segments:[{start_time:0,end_time:2,title:'Graphic',description:'Red and blue rectangles',visual_objects:['rectangles'],actions:[],dialogue}]});
  const mediaResponse=(value:unknown)=>new Response(JSON.stringify({model,choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:50}}),{status:200});
  function conversation(){
    const clipPath=path.join(root,'clip.mp4'),framePath=path.join(root,'anchor.jpg');
    fs.writeFileSync(clipPath,'synthetic-video');fs.writeFileSync(framePath,'synthetic-frame');
    return {clipPath,start:100,end:110,candidateStart:102,candidateEnd:108,hasAudio:true,
      anchors:['p','q'].map((personId,i)=>({personId,anchorId:personId,name:'Fixture participant',frameTime:101+i,framePath,start:100,end:110,box:[0,0,.3,.4]})),
      cues:[{id:'c',start:103,end:104,text:'Hello'},{id:'d',start:105,end:106,text:'Hi'}]};
  }
  it('grounds contextual conversation in video, separate aligned audio and confirmed anchors',async()=>{
    let audioPath='';
    const ffmpeg={extractAudio:jest.fn(async(_source:string,dest:string)=>{audioPath=dest;fs.writeFileSync(dest,'synthetic-audio');return true;}),probeMetadata:jest.fn().mockResolvedValue({duration:10})};
    const turns=['p','q'].map((personId,i)=>({personId,anchorId:personId,cueId:i?'d':'c',start:3+i*2,end:4+i*2,observation:'Visible reciprocal speaking cue',addressesOtherParticipant:true}));
    fetcher.mockResolvedValueOnce(mediaResponse({status:'supported',explanation:'Reciprocal exchange',turns}));
    const result=await make({BASETEN_MEDIA_ENABLED:true},ffmpeg).verifyConversation(conversation());
    expect(result.status).toBe('supported');expect(result.turns.map(t=>t.start)).toEqual([103,105]);expect(result.usage?.provider).toBe('baseten');
    const parts=JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content;
    expect(parts.filter((p:any)=>p.type==='audio_url')).toHaveLength(1);expect(parts.filter((p:any)=>p.type==='video_url')).toHaveLength(1);expect(parts.filter((p:any)=>p.type==='image_url')).toHaveLength(2);
    expect(fetcher.mock.calls[0][1].body).not.toContain(root);expect(fs.existsSync(audioPath)).toBe(false);
  });
  it('abstains before egress for disabled media or misaligned audio and cleans failed requests',async()=>{
    const evidence=conversation();let audioPath='';
    const ffmpeg={extractAudio:jest.fn(async(_source:string,dest:string)=>{audioPath=dest;fs.writeFileSync(dest,'audio');return true;}),probeMetadata:jest.fn().mockResolvedValue({duration:8})};
    expect((await make({},ffmpeg).verifyConversation(evidence)).status).toBe('insufficient_evidence');expect(ffmpeg.extractAudio).not.toHaveBeenCalled();
    expect((await make({BASETEN_MEDIA_ENABLED:true},ffmpeg).verifyConversation(evidence)).issue).toBe('source');expect(fetcher).not.toHaveBeenCalled();expect(fs.existsSync(audioPath)).toBe(false);
    ffmpeg.probeMetadata.mockResolvedValue({duration:10});fetcher.mockResolvedValueOnce(mediaResponse({status:'supported',explanation:'Invented',turns:[]}));
    expect((await make({BASETEN_MEDIA_ENABLED:true},ffmpeg).verifyConversation(evidence)).issue).toBe('invalid_response');expect(fs.existsSync(audioPath)).toBe(false);
  });
  it('uses the sponsor model for opted-in visual-only video and rejects invented dialogue',async()=>{
    const source=path.join(root,'source.mp4');fs.writeFileSync(source,'fixture');
    const ffmpeg={probeMetadata:jest.fn().mockResolvedValue({duration:2})};
    fetcher.mockResolvedValueOnce(mediaResponse(video()));
    const result=await make({BASETEN_MEDIA_ENABLED:true},ffmpeg).analyzeVideo(source);
    expect(result.usage.provider).toBe('baseten');
    const body=JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.model).toBe(model);expect(body.messages[1].content[0].text).toContain('dialogue must be empty');
    expect(body.messages[1].content[1]).toMatchObject({type:'video_url',video_url:{url:expect.stringMatching(/^data:video\/mp4;base64,/)}});
    fetcher.mockResolvedValueOnce(mediaResponse(video('Unsupported speech')));
    await expect(make({BASETEN_MEDIA_ENABLED:true},ffmpeg).analyzeVideo(source)).rejects.toThrow('invented dialogue');
  });
  it('rejects analysis windows exceeding the provider duration limit before inference',async()=>{
    const source=path.join(root,'source.mp4');fs.writeFileSync(source,'fixture');
    await expect(make({BASETEN_MEDIA_ENABLED:true,AI_VIDEO_CHUNK_SECONDS:301},{probeMetadata:jest.fn().mockResolvedValue({duration:301})}).analyzeVideo(source)).rejects.toThrow('settings');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('admits media above the text cap and keeps serialized media bounds before reservation',async()=>{
    const source=path.join(root,'source.mp4');fs.writeFileSync(source,Buffer.alloc(150000));
    const ffmpeg={probeMetadata:jest.fn().mockResolvedValue({duration:2})};
    fetcher.mockResolvedValueOnce(mediaResponse(video()));
    await make({BASETEN_MEDIA_ENABLED:true},ffmpeg).analyzeVideo(source);
    expect(Buffer.byteLength(fetcher.mock.calls[0][1].body)).toBeGreaterThan(131072);
    const journal=fs.readFileSync(file,'utf8');
    await expect(make({BASETEN_MEDIA_ENABLED:true,BASETEN_MAX_MEDIA_REQUEST_BYTES:131072},ffmpeg).analyzeVideo(source)).rejects.toThrow('byte bound');
    expect(fetcher).toHaveBeenCalledTimes(1);expect(fs.readFileSync(file,'utf8')).toBe(journal);
    await expect(make({BASETEN_MEDIA_ENABLED:true,BASETEN_MAX_MEDIA_REQUEST_BYTES:104857601},ffmpeg).analyzeVideo(source)).rejects.toThrow('Invalid');
    await expect(make().spaceConversation({...context,history:[{role:'user',content:'x'.repeat(140000)}]})).rejects.toThrow('byte bound');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses documented Baseten audio URLs and offsets chunk-relative cues',async()=>{
    const audio=path.join(root,'audio.wav');fs.writeFileSync(audio,'fixture');
    const ffmpeg={probeMetadata:jest.fn().mockResolvedValue({duration:2}),splitAudioIntoChunks:jest.fn().mockResolvedValue([{path:audio,offset:8}])};
    fetcher.mockResolvedValueOnce(mediaResponse({cues:[{start_time:0.25,end_time:1.5,text:'Hello Brisky'}]}));
    const result=await make({BASETEN_MEDIA_ENABLED:true,STORAGE_ROOT:root},ffmpeg).transcribeAudio(audio);
    expect(result.transcript).toEqual([{start_time:8.25,end_time:9.5,text:'Hello Brisky'}]);
    expect(result.usage.provider).toBe('baseten');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content[1]).toEqual({type:'audio_url',audio_url:{url:'data:audio/wav;base64,'+Buffer.from('fixture').toString('base64')}});
  });
});
