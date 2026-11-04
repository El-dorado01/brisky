import { ConversationEvidence, conversationPayload, parseConversation, validConversationEvidence } from './conversation-evidence';
import { ConfigService } from '@nestjs/config';
import { GoogleAiProvider } from './providers/google-ai.provider';
import { MetaAiProvider } from './providers/meta-ai.provider';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const conversationFixture = (): ConversationEvidence=>({clipPath:'clip.mp4',start:100,end:110,candidateStart:102,candidateEnd:108,hasAudio:true,
  anchors:[{anchorId:'a',personId:'p',name:'Me',frameTime:101,framePath:'a.jpg',start:100,end:110,box:[0,0,0.3,0.4]},
    {anchorId:'b',personId:'q',name:'Uncle Dave',frameTime:102,framePath:'b.jpg',start:100,end:110,box:[0.5,0,0.3,0.4]}],
  cues:[{id:'c',start:103,end:104,text:'Hello'},{id:'d',start:105,end:106,text:'Hi'}]});
export const supportedConversation = ()=>({status:'supported',explanation:'Two labelled participants exchange audible replies while facing each other',turns:[
  {personId:'p',anchorId:'a',cueId:'c',start:3,end:4,observation:'First labelled person visibly speaks to the other',addressesOtherParticipant:true},
  {personId:'q',anchorId:'b',cueId:'d',start:5,end:6,observation:'Other labelled person visibly replies to the first',addressesOtherParticipant:true}]});

describe('grounded conversation contract',()=>{
  it('converts clip-relative turns into source times exactly once',()=>{
    expect(parseConversation(supportedConversation(),conversationFixture()).turns.map(t=>t.start)).toEqual([103,105]);
  });
  it.each(['uncertain','not_supported','insufficient_evidence'])('retains the scoped nonpositive outcome %s',status=>{
    expect(parseConversation({status,explanation:'Not established in this clip',turns:[]},conversationFixture()).status).toBe(status);
  });
  it.each([
    {personId:'other'},{anchorId:'invented'},{cueId:'invented'},{start:4.5},{end:10},{start:-1},
    {start:NaN},{observation:''},{addressesOtherParticipant:false},
  ])('rejects unsupported turns %j',patch=>{
    const value=supportedConversation(); Object.assign(value.turns[0],patch);
    expect(()=>parseConversation(value,conversationFixture())).toThrow();
  });
  it('does not accept one speaker or one cue as a reciprocal conversation',()=>{
    const one=supportedConversation(); one.turns=one.turns.slice(0,1);
    expect(()=>parseConversation(one,conversationFixture())).toThrow();
    const same=supportedConversation(); Object.assign(same.turns[1],{personId:'p',anchorId:'a'});
    expect(()=>parseConversation(same,conversationFixture())).toThrow();
    const repeated=supportedConversation(); repeated.turns[1].cueId='c';
    expect(()=>parseConversation(repeated,conversationFixture())).toThrow();
  });
  it('requires audio, distinct identities and valid labelled face boxes',()=>{
    for (const mutate of [(e:ConversationEvidence)=>{e.hasAudio=false;},(e:ConversationEvidence)=>{e.anchors[1].personId='p';},
      (e:ConversationEvidence)=>{e.anchors[0].box=[0,0,2,1];},(e:ConversationEvidence)=>{e.anchors[0].frameTime=120;},
      (e:ConversationEvidence)=>{e.cues=[];}]) {
      const evidence=conversationFixture();mutate(evidence);expect(validConversationEvidence(evidence)).toBe(false);
    }
  });
  it('rejects a turn outside its confirmed appearance interval',()=>{
    const evidence=conversationFixture();evidence.anchors[0].end=102;
    expect(()=>parseConversation(supportedConversation(),evidence)).toThrow();
  });
});

describe('conversation adapters (offline fixtures, no inference)',()=>{
  let root:string,evidence:ConversationEvidence;
  beforeEach(()=>{
    root=fs.mkdtempSync(path.join(os.tmpdir(),'brisky-conversation-'));
    evidence=conversationFixture();
    evidence.clipPath=path.join(root,'clip.mp4');fs.writeFileSync(evidence.clipPath,'synthetic-video');
    evidence.anchors.forEach((a,i)=>{a.framePath=path.join(root,`anchor-${i}.jpg`);fs.writeFileSync(a.framePath,'synthetic-image');});
  });
  afterEach(()=>{
    expect(path.dirname(path.resolve(root))).toBe(path.resolve(os.tmpdir()));expect(path.basename(root)).toMatch(/^brisky-conversation-/);
    fs.rmSync(root,{recursive:true,force:true});
  });
  const config=()=>new ConfigService({AI_API_KEY:'google-fixture-key',AI_MODEL:'fixture-model',AI_FALLBACK_MODELS:'',AI_FALLBACK_MODEL:'',
    META_API_KEY:'meta-fixture-key',META_MODEL:'fixture-model',META_VIDEO_MODEL:'fixture-model',AI_BUDGET_USD:1,
    AI_USAGE_LEDGER_PATH:path.join(root,'ledger.jsonl'),AI_MODEL_PRICING_JSON:JSON.stringify({
      'google/fixture-model':{reservationUsd:0.1,inputUsdPerMillion:1,outputUsdPerMillion:2},
      'meta/fixture-model':{reservationUsd:0.1,inputUsdPerMillion:1,outputUsdPerMillion:2}})});
  it('attaches original labelled images with exact boxes and video to Gemini',async()=>{
    const provider=new GoogleAiProvider(config(),{} as any) as any;
    const generate=jest.spyOn(provider,'generateContent').mockResolvedValue({text:JSON.stringify(supportedConversation()),model:'fixture-model',inputTokens:10,outputTokens:10,durationMs:1,usageKnown:true});
    expect((await provider.verifyConversation(evidence)).status).toBe('supported');
    const parts=(generate.mock.calls[0][1] as any)[0].parts;
    expect(parts[0].text).toContain('"box":[0,0,0.3,0.4]');
    expect(parts[0].text).not.toContain(root);
    expect(parts[1].inlineData.mimeType).toBe('video/mp4');
    expect(parts.filter((p:any)=>p.inlineData?.mimeType==='image/jpeg')).toHaveLength(2);
  });
  it('rejects ungrounded Gemini positives',async()=>{
    const provider=new GoogleAiProvider(config(),{} as any) as any;
    jest.spyOn(provider,'generateContent').mockResolvedValue({text:JSON.stringify({status:'supported',explanation:'Together',turns:[]}),model:'fixture-model',inputTokens:0,outputTokens:0,durationMs:1});
    expect(await provider.verifyConversation(evidence)).toMatchObject({status:'error',issue:'invalid_response',turns:[]});
  });
  it('keeps a dormant Meta conversation implementation with the same evidence contract',async()=>{
    const fetcher=jest.fn().mockResolvedValue(new Response(JSON.stringify({model:'fixture-model',choices:[{finish_reason:'stop',message:{content:JSON.stringify(supportedConversation())}}],usage:{prompt_tokens:10,completion_tokens:10}}),{status:200}));
    const provider=new MetaAiProvider(config(),{} as any,{} as any,fetcher);
    expect(await provider.verifyConversation(evidence)).toMatchObject({status:'supported',usage:{provider:'meta'}});
    const parts=JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content;
    expect(parts.filter((p:any)=>p.type==='image_url')).toHaveLength(2);
    expect(parts.some((p:any)=>p.type==='video_url')).toBe(true);
  });
  it('does not read or send media when Gemini budget admission is disabled',async()=>{
    const settings=config();settings.set('AI_BUDGET_USD',0);
    const provider=new GoogleAiProvider(settings,{} as any) as any;
    const generate=jest.spyOn(provider,'generateContent');
    expect(await provider.verifyConversation(evidence)).toMatchObject({status:'error',issue:'budget'});
    expect(generate).not.toHaveBeenCalled();
  });
  it('does not put filesystem paths in model prompts',()=>{
    expect(conversationPayload(evidence).prompt).not.toContain(root);
  });
});
