import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MetaAiProvider } from './meta-ai.provider';
import { metaSchemas, parseMetaFrames, parseMetaQuery, parseMetaTranscript, parseMetaVerification, parseMetaVideo, rawMetaQuery } from './meta-contract';
import { withSearchDeadline, SearchDeadlineError } from '../../../common/search-deadline';

describe('dormant Meta adapter (offline transport fixtures only)', () => {
  let root: string, file: string, fetcher: jest.Mock;
  let ffmpeg: any, embeddings: any;
  const goodQuery = {cleanSearchPhrase:'red car',coreSubject:'car',targetEntity:'car',aspect:'red',aliases:[],isCompound:false,
    subQueries:[{topic:'red car',searchPhrase:'red car'}]};
  const verification = {outcome:'matched',confidence:0.9,matchedTimestamp:5.125,explanation:'Red car in supplied frame'};
  const config = (settings: Record<string, unknown> = {}) => new ConfigService({META_API_KEY:'meta-fixture-key',
    META_MODEL:'fixture-primary',META_VIDEO_MODEL:'fixture-video',META_AUDIO_MODEL:'fixture-audio',
    STORAGE_ROOT:root,AI_USAGE_LEDGER_PATH:file,AI_BUDGET_USD:5,
    AI_MODEL_PRICING_JSON:JSON.stringify(Object.fromEntries(['fixture-primary','fixture-fallback','fixture-video','fixture-audio'].map(model=>[
      `meta/${model}`,{reservationUsd:0.1,inputUsdPerMillion:1,outputUsdPerMillion:2}]))),...settings});
  const response = (value: unknown, extra: any = {}) => new Response(JSON.stringify({model:'fixture-snapshot',
    choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:20},...extra}),
    {status:200,headers:{'Content-Type':'application/json'}});
  const make = (settings: Record<string, unknown> = {}) => new MetaAiProvider(config(settings),ffmpeg,embeddings,fetcher);
  const fixture = (name: string) => { const file = path.join(root,name); fs.writeFileSync(file,'synthetic-not-real-media'); return file; };
  const journal = () => fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').map(l=>JSON.parse(l)):[];
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(),'brisky-meta-fixture-')); file=path.join(root,'ledger.jsonl');
    fetcher=jest.fn();
    ffmpeg={probeMetadata:jest.fn().mockResolvedValue({duration:10}),splitAudioIntoChunks:jest.fn()};
    embeddings={getEmbeddingModel:jest.fn().mockReturnValue('existing-google-embedding'),generateEmbedding:jest.fn().mockResolvedValue({values:[1,2,3],usage:{provider:'google'}})};
  });
  afterEach(() => {
    expect(path.dirname(path.resolve(root))).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(root)).toMatch(/^brisky-meta-fixture-/);
    fs.rmSync(root,{recursive:true,force:true});
  });

  it('builds documented requests without leaking legacy keys or enabling storage', async () => {
    fetcher.mockResolvedValueOnce(response(goodQuery));
    expect((await make({AI_API_KEY:'never-meta',GEMINI_API_KEY:'never-meta-either'}).understandQuery('Find a red car')).targetEntity).toBe('car');
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.meta.ai/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer meta-fixture-key');
    expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body)).toMatchObject({model:'fixture-primary',stream:false,store:false,max_completion_tokens:4096,
      response_format:{type:'json_schema',json_schema:{strict:true}}});
    expect(options.body).not.toContain('never-meta');
    expect(journal()[0]).toMatchObject({event:'reserved',attempt:{provider:'meta',stage:'query_understanding'}});
    expect(journal()[1]).toMatchObject({event:'settled',status:'success',inputTokens:100,outputTokens:20});
    expect(fs.readFileSync(file,'utf8')).not.toContain('Find a red car');
  });
  it('does not call transport without a budget or model pricing', async () => {
    expect(await make({AI_BUDGET_USD:0}).understandQuery('raw query')).toEqual(rawMetaQuery('raw query'));
    expect(await make({AI_MODEL_PRICING_JSON:'{}'}).understandQuery('raw query')).toEqual(rawMetaQuery('raw query'));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires Meta-specific model IDs and dedicated credentials', async () => {
    expect(make({META_MODEL:'',AI_MODEL:'gemini-selected'}).isConfigured()).toBe(false);
    expect(make({META_API_KEY:'',MODEL_API_KEY:'',AI_API_KEY:'google-only'}).isConfigured()).toBe(false);
    expect(await make({META_API_KEY:'',MODEL_API_KEY:''}).understandQuery('raw')).toEqual(rawMetaQuery('raw'));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('retains the existing embedding space and attributes its actual provider', async () => {
    const service=make();
    expect(service.getEmbeddingModel()).toBe('existing-google-embedding');
    expect((await service.generateEmbedding('text')).usage.provider).toBe('google');
    expect(embeddings.generateEmbedding).toHaveBeenCalledWith('text');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('decomposes using the same one-call understanding contract', async () => {
    fetcher.mockResolvedValueOnce(response(goodQuery));
    expect(await make().decomposeQuery('red car')).toEqual({isCompound:false,subQueries:goodQuery.subQueries});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('meters every explicitly configured transient fallback', async () => {
    fetcher.mockResolvedValueOnce(new Response('',{status:429})).mockResolvedValueOnce(response(goodQuery));
    await make({META_FALLBACK_MODELS:'fixture-fallback'}).understandQuery('red car');
    expect(fetcher).toHaveBeenCalledTimes(2);
    const entries=journal();
    expect(entries.filter(e=>e.event==='reserved').map(e=>e.attempt.model)).toEqual(['fixture-primary','fixture-fallback']);
    expect(entries[0].attempt.requestId).toBe(entries[2].attempt.requestId);
    expect(entries[1]).toMatchObject({status:'error',estimatedUsd:null});
  });
  it('does not retry authorization errors or malformed model output', async () => {
    fetcher.mockResolvedValueOnce(new Response('',{status:401}));
    await make({META_FALLBACK_MODELS:'fixture-fallback'}).understandQuery('raw');
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockClear(); fetcher.mockResolvedValueOnce(response({bad:true}));
    expect(await make({META_FALLBACK_MODELS:'fixture-fallback'}).understandQuery('raw')).toEqual(rawMetaQuery('raw'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('blocks an unpriced fallback before dispatch and keeps earlier reservation', async () => {
    fetcher.mockResolvedValueOnce(new Response('',{status:503}));
    await make({META_FALLBACK_MODELS:'unpriced-fallback'}).understandQuery('raw');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(journal().filter(e=>e.event==='reserved')).toHaveLength(1);
  });
  it('verifies only an attached source timestamp and preserves fractional precision', async () => {
    fetcher.mockResolvedValueOnce(response(verification));
    const result=await make().verifyCandidate([{timestamp:5.125,path:fixture('frame.jpg')}],'red car');
    expect(result).toMatchObject({status:'evaluated',matched:true,matchedTimestamp:5.125,usage:{provider:'meta',model:'fixture-primary'}});
    const parts=JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content;
    expect(parts[1].text).toContain('5.125');
    expect(parts[2]).toMatchObject({type:'image_url',image_url:{detail:'high'}});
  });
  it.each([7,5.13,null])('does not confirm invented or missing frame timestamp %s', async matchedTimestamp => {
    fetcher.mockResolvedValueOnce(response({...verification,matchedTimestamp}));
    expect(await make().verifyCandidate([{timestamp:5.125,path:fixture('frame.jpg')}],'red car')).toMatchObject({status:'error',issue:'invalid_response',matched:false});
  });
  it('does not treat ambiguous evidence or absent files as a negative finding', async () => {
    fetcher.mockResolvedValueOnce(response({...verification,outcome:'uncertain',matchedTimestamp:null}));
    expect(await make().verifyCandidate([{timestamp:5.125,path:fixture('frame.jpg')}],'red car')).toMatchObject({status:'insufficient_evidence',matched:false});
    expect(await make().verifyCandidate([{timestamp:1,path:path.join(root,'absent.jpg')}],'red car')).toMatchObject({status:'insufficient_evidence'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('analyzes frames in complete batches with exact source timestamps', async () => {
    const frame=fixture('frame.png');
    const rows=[{frameId:0,timestamp:1.125,objects:['car'],scene:'road',activity:[],onScreenText:['EXIT'],description:'A car'},
      {frameId:1,timestamp:2.5,objects:[],scene:'road',activity:[],onScreenText:[],description:'An empty road'}];
    fetcher.mockResolvedValueOnce(response({observations:rows}));
    const result=await make().analyzeFrames([{sceneId:1,startTime:0,endTime:3,representativeTimestamp:1.125,
      keyframePath:frame,keyframes:[{timestamp:1.125,path:frame},{timestamp:2.5,path:frame}]}]);
    expect(result.observations.map(o=>o.timestamp)).toEqual([1.125,2.5]);
    expect(result.observations[0]).toMatchObject({provider:'meta',modelVersion:'fixture-snapshot',onScreenText:['EXIT']});
  });
  it('analyzes native video without relabelling sparse frames as full video', async () => {
    fetcher.mockResolvedValueOnce(response({video_summary:'A car passes',key_themes:['travel'],segments:[{
      start_time:0,end_time:10,title:'Car',description:'A car passes',visual_objects:['car'],actions:['driving'],dialogue:''}]}));
    const result=await make().analyzeVideo(fixture('video.mp4'));
    expect(result.usage).toMatchObject({provider:'meta',model:'fixture-video',stage:'video_analysis'});
    expect(JSON.parse(fetcher.mock.calls[0][1].body).max_completion_tokens).toBe(8192);
    const content=JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content;
    expect(content[1].type).toBe('video_url');
    expect(content[1].video_url.url).toMatch(/^data:video\/mp4;base64,/);
  });
  it('converts native clip time to source time exactly once', async () => {
    fetcher.mockResolvedValueOnce(response({...verification,matchedTimestamp:2.125}));
    expect(await make().verifyClip(fixture('clip.mp4'),'sequence',100,110)).toMatchObject({matched:true,matchedTimestamp:102.125});
  });
  it('splits video, retains source timestamps, aggregates usage and removes only its temporary windows', async()=>{
    const source=fixture('long.mp4'),durations=new Map<string,number>();
    ffmpeg.probeMetadata.mockImplementation(async(p:string)=>({duration:durations.get(p)??10}));
    ffmpeg.prepareAnalysisWindow=jest.fn(async(_source:string,p:string,start:number,end:number)=>{
      fs.writeFileSync(p,'generated-window');durations.set(p,end-start);return p;
    });
    const row=(end:number)=>({video_summary:'window',key_themes:['test'],segments:[{
      start_time:0,end_time:end,title:'Event',description:'Visible event',visual_objects:[],actions:[],dialogue:''}]});
    fetcher.mockResolvedValueOnce(response(row(6))).mockResolvedValueOnce(response(row(4)));
    const result=await make({AI_VIDEO_CHUNK_SECONDS:6}).analyzeVideo(source);
    expect(result.analysis.segments.map(s=>[s.start_time,s.end_time])).toEqual([[0,6],[6,10]]);
    expect(result.usage.inputTokens).toBe(200);expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fs.existsSync(source)).toBe(true);
    expect(fs.readdirSync(path.join(root,'scratch'))).toEqual([]);
  });
  it('rejects an incomplete prepared window without sending it or reporting complete coverage',async()=>{
    const source=fixture('source.mp4');
    ffmpeg.prepareAnalysisWindow=jest.fn(async(_s:string,p:string)=>{fs.writeFileSync(p,'window');return p;});
    ffmpeg.probeMetadata.mockResolvedValue({duration:10});
    await expect(make({AI_VIDEO_CHUNK_SECONDS:6}).analyzeVideo(source)).rejects.toThrow('duration');
    expect(fetcher).not.toHaveBeenCalled();expect(fs.existsSync(source)).toBe(true);
    expect(fs.readdirSync(path.join(root,'scratch'))).toEqual([]);
  });
  it('rejects inconsistent clip bounds and unavailable modality configuration', async () => {
    expect(await make().verifyClip(fixture('clip.mp4'),'sequence',100,120)).toMatchObject({status:'insufficient_evidence'});
    expect(await make({META_VIDEO_MODEL:''}).verifyClip(fixture('clip2.mp4'),'sequence',100,110)).toMatchObject({status:'error',matched:false});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('chunks audio, preserves source offsets, and cleans scratch files', async () => {
    const source=fixture('audio.wav');
    ffmpeg.probeMetadata.mockResolvedValue({duration:5});
    ffmpeg.splitAudioIntoChunks.mockImplementation(async (_input: string, folder: string) => {
      const first=path.join(folder,'chunk_000.mp3'),second=path.join(folder,'chunk_001.mp3');
      fs.writeFileSync(first,'synthetic-audio'); fs.writeFileSync(second,'synthetic-audio');
      return [{path:first,offset:0},{path:second,offset:90}];
    });
    fetcher.mockResolvedValueOnce(response({cues:[{start_time:1,end_time:2,text:'Hello'}]}))
      .mockResolvedValueOnce(response({cues:[{start_time:0.5,end_time:1.5,text:'Again'}]}));
    const result=await make().transcribeAudio(source);
    expect(result.transcript).toEqual([{start_time:1,end_time:2,text:'Hello'},{start_time:90.5,end_time:91.5,text:'Again'}]);
    expect(result.usage).toMatchObject({provider:'meta',model:'fixture-audio',inputTokens:200,outputTokens:40});
    expect(JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content[1]).toMatchObject({type:'input_audio',input_audio:{format:'mp3'}});
    expect(fs.readdirSync(path.join(root,'scratch'))).toEqual([]);
  });
  it('does not return a completed transcript when one chunk has malformed timing', async () => {
    const audio=fixture('audio.mp3');
    ffmpeg.splitAudioIntoChunks.mockResolvedValue([{path:audio,offset:0}]);
    fetcher.mockResolvedValueOnce(response({cues:[{start_time:0,end_time:20,text:'Out of bounds'}]}));
    await expect(make().transcribeAudio(audio)).rejects.toThrow('invalid');
    expect(fs.readdirSync(path.join(root,'scratch'))).toEqual([]);
  });
  it.each([{choices:[{finish_reason:'length',message:{content:JSON.stringify(verification)}}]},
    {choices:[{finish_reason:'stop',message:{refusal:'refused',content:JSON.stringify(verification)}}]},
    {choices:[{finish_reason:'stop',message:{content:'not json'}}]}])('rejects incomplete, refused or invalid output %j', async extra => {
    fetcher.mockResolvedValueOnce(response(verification,extra));
    expect(await make().verifyCandidate([{timestamp:5.125,path:fixture('frame.jpg')}],'query')).toMatchObject({status:'error',issue:'invalid_response',matched:false});
  });
  it('records unknown usage without pretending its cost is measured', async () => {
    fetcher.mockResolvedValueOnce(response(verification,{usage:undefined}));
    const result=await make().verifyCandidate([{timestamp:5.125,path:fixture('frame.jpg')}],'query');
    expect(result.usage?.usageSource).toBe('unknown');
    expect(journal()[1].estimatedUsd).toBeNull();
  });
  it('does not leak provider error bodies or local exceptions into returned evidence', async () => {
    fetcher.mockRejectedValueOnce(new Error('secret-key-and-private-path'));
    const result=await make().verifyCandidate([{timestamp:5.125,path:fixture('frame.jpg')}],'query');
    expect(JSON.stringify(result)).not.toContain('secret-key');
    expect(result.matched).toBe(false);
  });
  it('blocks oversized files and request payloads before dispatch', async () => {
    const frames=[{timestamp:5.125,path:fixture('frame.jpg')}];
    expect((await make({META_MAX_MEDIA_BYTES:1}).verifyCandidate(frames,'query')).matched).toBe(false);
    expect((await make({META_MAX_REQUEST_BYTES:10}).verifyCandidate(frames,'query')).matched).toBe(false);
    expect(fetcher).not.toHaveBeenCalled(); expect(journal()).toEqual([]);
  });
  it('admits inline files above the former 32 MiB default but stops at the documented Meta file limit', () => {
    const image=fixture('large-frame.jpg');
    const fd=fs.openSync(image,'r+');
    try { fs.ftruncateSync(fd,34*1024*1024); } finally { fs.closeSync(fd); }
    expect((make() as any).bytes(image,{'.jpg':'image/jpeg'}).data.length).toBe(4*Math.ceil(34*1024*1024/3));
    const larger=fs.openSync(image,'r+');
    try { fs.ftruncateSync(larger,50_000_001); } finally { fs.closeSync(larger); }
    expect(()=>(make() as any).bytes(image,{'.jpg':'image/jpeg'})).toThrow('file bound');
    expect(fetcher).not.toHaveBeenCalled();expect(journal()).toEqual([]);
  });
  it('blocks budget exhaustion before verification', async () => {
    const result=await make({AI_BUDGET_USD:0}).verifyCandidate([{timestamp:1,path:fixture('frame.jpg')}],'query');
    expect(result).toMatchObject({status:'error',issue:'budget',matched:false});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('cancels timed-out requests without hidden retries and retains reservations', async () => {
    fetcher.mockImplementation((_url: string, options: any)=>new Promise((_resolve,reject)=>{
      options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
    }));
    await expect(withSearchDeadline(10,()=>make().verifyCandidate([{timestamp:1,path:fixture('frame.jpg')}],'query'))).rejects.toBeInstanceOf(SearchDeadlineError);
    await new Promise(resolve=>setTimeout(resolve,30));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(journal()[0].attempt.reservedUsd).toBe(0.1);
    expect(journal()[1].status).toBe('error');
  });
  it('bounds the response body instead of parsing unbounded provider output', async () => {
    fetcher.mockResolvedValueOnce(new Response('x'.repeat(2*1024*1024+1),{status:200}));
    expect(await make().verifyCandidate([{timestamp:1,path:fixture('frame.jpg')}],'query')).toMatchObject({status:'error',issue:'invalid_response'});
  });
  it('never dispatches a queued search after that search is cancelled', async () => {
    let release!: (value: Response)=>void, started!: ()=>void;
    const began=new Promise<void>(resolve=>{started=resolve;});
    fetcher.mockImplementationOnce(()=>new Promise<Response>(resolve=>{release=resolve;started();}));
    const service=make();
    const first=service.understandQuery('red car');
    await began;
    await expect(withSearchDeadline(10,()=>service.verifyCandidate([{timestamp:1,path:fixture('frame.jpg')}],'queued'))).rejects.toBeInstanceOf(SearchDeadlineError);
    release(response(goodQuery)); await first;
    await new Promise(resolve=>setTimeout(resolve,20));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(journal().filter(e=>e.event==='reserved')).toHaveLength(1);
  });
});

describe('Meta structured evidence validators', () => {
  it('rejects missing, duplicated or invented frame observations', () => {
    expect(()=>parseMetaFrames({observations:[]},[{timestamp:1}],'model')).toThrow();
    expect(()=>parseMetaFrames({observations:[{frameId:0,timestamp:2}]},[{timestamp:1}],'model')).toThrow();
  });
  it('rejects incomplete video coverage, overlapping segments and invented duration', () => {
    const row={start_time:0,end_time:5,title:'t',description:'d',visual_objects:[],actions:[],dialogue:''};
    for (const segments of [[],[row],[{...row,end_time:11}],[row,{...row,start_time:4,end_time:10}]]) {
      expect(()=>parseMetaVideo({video_summary:'s',key_themes:[],segments},10)).toThrow();
    }
  });
  it('rejects invalid transcript times instead of clamping them', () => {
    expect(()=>parseMetaTranscript({cues:[{start_time:-1,end_time:2,text:'x'}]},10,90)).toThrow();
    expect(()=>parseMetaTranscript({cues:[{start_time:1,end_time:11,text:'x'}]},10,90)).toThrow();
  });
  it('rejects contradictory query decomposition', () => {
    expect(()=>parseMetaQuery({cleanSearchPhrase:'x',coreSubject:'x',targetEntity:null,aspect:null,aliases:[],isCompound:true,
      subQueries:[{topic:'x',searchPhrase:'x'}]},'x')).toThrow();
  });
  it('requires nonmatches to carry null timestamps and finite confidence', () => {
    expect(()=>parseMetaVerification({outcome:'not_matched',confidence:0.9,matchedTimestamp:2,explanation:'x'},()=>true)).toThrow();
    expect(()=>parseMetaVerification({outcome:'matched',confidence:NaN,matchedTimestamp:2,explanation:'x'},()=>true)).toThrow();
    expect(metaSchemas.verification.required).toContain('outcome');
  });
});
