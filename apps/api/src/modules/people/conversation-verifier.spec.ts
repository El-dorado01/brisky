import { ConfigService } from '@nestjs/config';
import { ConversationVerifierService, wantsConversation } from './conversation-verifier.service';
import { SearchResponse } from '../media/media.types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MediaService } from '../media/media.service';
import { peopleSearchOptions } from './people-search';

const owner='11111111-1111-4111-8111-111111111111';
const p='22222222-2222-4222-8222-222222222222',q='33333333-3333-4333-8333-333333333333';
const response=():SearchResponse=>({results:[{assetId:'source',segmentId:'identity:source:4:9',startTime:4,endTime:9,title:'People',description:'',transcriptSnippet:'',score:1,matchType:'identity',winningPath:'identity',thumbnailUrl:'',stage2Verified:false}],
  hasExactMatch:false,queryIntent:'visual',identitySearch:{status:'resolved',evidenceScope:'manual_appearance_overlap',queryConditionsVerified:false,hasMore:false,
    references:[{reference:'me',personId:p,candidates:[{id:p,name:'Me'}]},{reference:'my uncle',personId:q,candidates:[{id:q,name:'Uncle'}]}]}});
describe('conversation evidence orchestration',()=>{
  let root:string,db:any,ai:any,ffmpeg:any,prepare:jest.Mock,service:ConversationVerifierService;
  const anchors=()=>[{id:'tag-a',person_id:p,name:'Me',frame_s:1,start_s:1,end_s:8,box:[0,0,0.3,0.3],duration:20,tag_version:'v1',person_version:'v1'},
    {id:'tag-b',person_id:q,name:'Uncle',frame_s:6,start_s:6,end_s:9,box:[0.5,0,0.3,0.3],duration:20,tag_version:'v1',person_version:'v1'}];
  beforeEach(()=>{
    root=fs.mkdtempSync(path.join(os.tmpdir(),'brisky-conversation-orchestration-'));
    db={query:jest.fn(async(sql:string)=>({rows:sql.includes('DISTINCT ON')?anchors():[{id:'cue-a',start:4,end:5,text:'Hello'},{id:'cue-b',start:6,end:7,text:'Hi'}]}))};
    ai={isConfigured:()=>true,verifyConversation:jest.fn().mockResolvedValue({status:'uncertain',scope:'conversation_between_tagged_people',turns:[],explanation:'Cannot link audible speech to participants'})};
    ffmpeg={probeMetadata:jest.fn().mockResolvedValue({hasAudio:true,duration:11}),extractInspectionFrame:jest.fn(async(_clip:string,file:string)=>{fs.writeFileSync(file,'synthetic-frame');})};
    prepare=jest.fn(async()=>{const clipPath=path.join(root,'clip.mp4');fs.writeFileSync(clipPath,'synthetic-clip');return {kind:'original',clipPath,frames:[],cleanup:jest.fn()};});
    service=new ConversationVerifierService(db,ai,ffmpeg,new ConfigService());
  });
  afterEach(()=>{
    expect(path.dirname(path.resolve(root))).toBe(path.resolve(os.tmpdir()));expect(path.basename(root)).toMatch(/^brisky-conversation-orchestration-/);
    fs.rmSync(root,{recursive:true,force:true});
  });
  it('keeps uncertain manual matches and assembles participant anchors and source cues',async()=>{
    const result=await service.verify(response(),owner,prepare);
    expect(result.results[0].conversationVerification?.status).toBe('uncertain');
    expect(result.hasExactMatch).toBe(false);expect(result.results[0].stage2Verified).toBe(false);
    expect(prepare.mock.calls[0][0]).toMatchObject({startTime:0,endTime:11});
    expect(ffmpeg.extractInspectionFrame.mock.calls.map((args:any[])=>args[2])).toEqual([1,6]);
    expect(ai.verifyConversation.mock.calls[0][0]).toMatchObject({start:0,end:11,candidateStart:4,candidateEnd:9,hasAudio:true});
    expect((await prepare.mock.results[0].value).cleanup).toHaveBeenCalledTimes(1);
  });
  it('does not inspect unresolved identities, one person or an unconfigured model',async()=>{
    const unresolved=response();unresolved.identitySearch!.status='needs_clarification';
    await service.verify(unresolved,owner,prepare);
    const single=response();single.identitySearch!.references.pop();await service.verify(single,owner,prepare);
    ai.isConfigured=()=>false;await service.verify(response(),owner,prepare);
    expect(prepare).not.toHaveBeenCalled();expect(ai.verifyConversation).not.toHaveBeenCalled();
  });
  it('refuses missing cues and anchors outside inspection bounds',async()=>{
    db.query.mockImplementation(async(sql:string)=>({rows:sql.includes('DISTINCT ON')?anchors():[]}));
    expect((await service.verify(response(),owner,prepare)).results[0].conversationVerification?.status).toBe('insufficient_evidence');
    expect(prepare).not.toHaveBeenCalled();
  });
  it('rejects previews and silent/misaligned clips without model calls',async()=>{
    prepare.mockResolvedValueOnce({kind:'preview',clipPath:'unused',frames:[],cleanup:jest.fn()});
    await service.verify(response(),owner,prepare);
    ffmpeg.probeMetadata.mockResolvedValue({hasAudio:false,duration:11});
    await service.verify(response(),owner,prepare);
    ffmpeg.probeMetadata.mockResolvedValue({hasAudio:true,duration:100});
    await service.verify(response(),owner,prepare);
    expect(ai.verifyConversation).not.toHaveBeenCalled();
  });
  it('discards a conclusion if tags are rejected or renamed while the request runs',async()=>{
    let reads=0;
    db.query.mockImplementation(async(sql:string)=>({rows:sql.includes('DISTINCT ON')?(++reads===1?anchors():[]):[{id:'a',start:4,end:5,text:'Hello'},{id:'b',start:6,end:7,text:'Hi'}]}));
    ai.verifyConversation.mockResolvedValue({status:'supported',turns:[],explanation:'Old evidence'});
    const result=await service.verify(response(),owner,prepare);
    expect(result.results[0].conversationVerification).toMatchObject({status:'insufficient_evidence',explanation:expect.stringContaining('changed')});
  });
  it('stops spending attempts after budget admission fails and bounds candidate inspection',async()=>{
    const many=response();many.results=Array.from({length:5},(_,i)=>({...many.results[0],segmentId:`candidate-${i}`}));
    ai.verifyConversation.mockResolvedValue({status:'error',turns:[],scope:'conversation_between_tagged_people',issue:'budget',explanation:'Paused'});
    const result=await service.verify(many,owner,prepare);
    expect(ai.verifyConversation).toHaveBeenCalledTimes(1);expect(result.results).toHaveLength(5);
    ai.verifyConversation.mockClear();ai.verifyConversation.mockResolvedValue({status:'uncertain',scope:'conversation_between_tagged_people',turns:[],explanation:'Uncertain'});
    await service.verify(many,owner,prepare);expect(ai.verifyConversation).toHaveBeenCalledTimes(3);
  });
  it('preserves manual results when preparation throws',async()=>{
    prepare.mockRejectedValue(new Error('private source path'));
    const result=await service.verify(response(),owner,prepare);
    expect(result.results).toHaveLength(1);expect(JSON.stringify(result)).not.toContain('private source path');
  });
  it('validates a provider positive again at the application boundary',async()=>{
    ai.verifyConversation.mockResolvedValue({status:'supported',scope:'conversation_between_tagged_people',explanation:'Together',turns:[]});
    expect((await service.verify(response(),owner,prepare)).results[0].conversationVerification).toMatchObject({status:'error',issue:'invalid_response'});
  });
});

describe('conversation entry-point policy',()=>{
  it('recognizes conversation intent without treating all people queries as conversation',()=>{
    expect(wantsConversation('where I was talking to my uncle')).toBe(true);
    expect(wantsConversation('me with my uncle')).toBe(false);
  });
  it('rejects nested fields that could override the validated query or owner',()=>{
    for(const value of [{query:'override'},{assetId:'override'},{limit:999},{owner},null,[]]) expect(()=>peopleSearchOptions(value)).toThrow();
  });
  it.each(['retrieve','verify'])('only verifies the explicit verify phase (%s)',async phase=>{
    const service=Object.create(MediaService.prototype) as any;
    service.configService={get:(_key:string,fallback:any)=>fallback};service.peopleSearchService={search:jest.fn().mockResolvedValue(response())};
    service.conversationVerifier={verify:jest.fn().mockImplementation(async(r:any)=>r)};
    await service.searchDetailed('where I was talking to my uncle',undefined,15,owner,phase);
    expect(service.conversationVerifier.verify).toHaveBeenCalledTimes(phase==='verify'?1:0);
  });
});
