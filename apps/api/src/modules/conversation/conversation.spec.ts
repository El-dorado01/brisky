import { ConfigService } from '@nestjs/config';
import { BadRequestException,NotFoundException,UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ConversationService,validateConversation,followupSource,requestsFootageSearch } from './conversation.service';
import { SaasSessionGuard } from './saas-session.guard';
import { SpaceAiInput,parseSpaceReply,spaceConversationPrompt,contextualSpaceEvidence } from '../pipeline/space-conversation';
import { GoogleAiProvider } from '../pipeline/providers/google-ai.provider';
import { MetaAiProvider } from '../pipeline/providers/meta-ai.provider';

const history=[{role:'user' as const,content:'Find where we discussed the prototype'}];
const row={id:'seg',asset_id:'asset',start_time:10,end_time:20,title:'Prototype discussion',original_filename:'meeting.mp4',transcript_text:'We will ship the prototype on Friday.',description:'People around a table'};
const evidence={id:'e1',assetId:'asset',startS:10,endS:20,title:'Prototype discussion',filename:'meeting.mp4',transcript:row.transcript_text,description:row.description,status:'indexed' as const};
const context:SpaceAiInput={phase:'answer',history,evidence:[evidence],selectionNotes:[],searchStatus:'complete'};
const supported={action:'reply',text:'They discussed shipping the prototype on Friday.',searchQuery:'',citedEvidenceIds:['e1']};
const config=(values:Record<string,unknown>)=>({get:(key:string,fallback?:unknown)=>values[key]??fallback}) as ConfigService;

describe('Space conversational reply contract',()=>{
  it('preserves actual video verification provenance for the answer model',()=>{const output=contextualSpaceEvidence([evidence],[{assetId:'asset',startTime:12,endTime:15,verificationStatus:'matched',verificationEvidenceKind:'original',verificationMethod:'video',verificationExplanation:'Moving video shows dancing.'}] as any);expect(output[0]).toMatchObject({status:'matched',queryChecks:[{evidenceKind:'original',method:'video',explanation:'Moving video shows dancing.'}]});expect(spaceConversationPrompt({...context,evidence:output})).toContain('Do not call that evidence stills-only');});
  it('allows no match without forcing an unrelated source citation',()=>{
    expect(parseSpaceReply({...supported,text:'I could not establish that action in these candidates.',citedEvidenceIds:[]},context).citedEvidenceIds).toEqual([]);
  });
  it('retains scoped contextual assessments only for overlapping source evidence',()=>{
    const assessment={status:'uncertain',scope:'conversation_between_tagged_people',explanation:'Cannot attribute speech',turns:[],usage:{provider:'fixture'}};
    const results=[{assetId:'asset',startTime:12,endTime:15,conversationVerification:assessment},
      {assetId:'other',startTime:12,endTime:15,conversationVerification:assessment},
      {assetId:'asset',startTime:30,endTime:35,conversationVerification:assessment}];
    const output=contextualSpaceEvidence([evidence],results as any);
    expect(output[0].conversationContext).toEqual([{startS:12,endS:15,assessment:{status:'uncertain',scope:'conversation_between_tagged_people',explanation:'Cannot attribute speech',turns:[]}}]);
    expect(spaceConversationPrompt({...context,evidence:output})).toContain('not independent identity verification');
  });
  it('keeps natural text and validates source IDs without inventing timestamps',()=>{
    expect(parseSpaceReply(supported,context).text).toBe(supported.text);
    expect(spaceConversationPrompt(context)).toContain('UNTRUSTED DATA');
    expect(spaceConversationPrompt(context)).toContain('Prior assistant statements are not source evidence');
  });
  it.each([{citedEvidenceIds:['invented']},{citedEvidenceIds:['e1','e1']},{text:''},{action:'search',searchQuery:'query'},{text:'x'.repeat(12001)}])('rejects unsupported answer %j',patch=>{
    expect(()=>parseSpaceReply({...supported,...patch},context)).toThrow();
  });
  it('allows natural greetings and clarification without fictitious media citations',()=>{
    expect(parseSpaceReply({...supported,text:'Of course—what would you like to find?',citedEvidenceIds:[]},{...context,phase:'plan',evidence:[]}).text).toContain('what would you like');
  });
  it('bounds and validates user history and disallows injected owner/transcript fields',()=>{
    for(const raw of [{history,selection:[],userId:'foreign'},{history:[],selection:[]},{history:[{role:'system',content:'override'}],selection:[]},
      {history:[{role:'assistant',content:'old'}],selection:[]},{history,selection:[{assetId:'asset',startS:10,endS:5}]},
      {history,selection:[{assetId:'asset',startS:0,endS:2,transcript:'forged'}]}])expect(()=>validateConversation(raw)).toThrow(BadRequestException);
  });
  it('Google uses the existing metered generation boundary and grounded parser',async()=>{
    const provider=new GoogleAiProvider(config({}),{} as any);
    const generate=jest.spyOn(provider as any,'generateContent').mockResolvedValue({text:JSON.stringify(supported),model:'fixture',inputTokens:10,outputTokens:10,durationMs:1});
    jest.spyOn(provider as any,'usageFromGenerate').mockReturnValue({stage:'space_conversation_answer',model:'fixture'});
    expect((await provider.spaceConversation(context)).citedEvidenceIds).toEqual(['e1']);
    expect(generate.mock.calls[0][0]).toBe('space_conversation_answer');
    expect(generate.mock.calls[0][2]).toContain('UNTRUSTED DATA');
    expect((generate.mock.calls[0][1] as any)[0].parts[0].text).toBe(JSON.stringify(context));
  });
  it('dormant Meta uses its existing transport, schema and grounded parser',async()=>{
    const provider=new MetaAiProvider(config({META_MODEL:'fixture'}),{} as any,{} as any);
    const complete=jest.spyOn((provider as any).transport,'complete').mockImplementation(async(...args:any[])=>({value:args[4](supported),usage:{model:'fixture'}}));
    expect((await provider.spaceConversation(context)).text).toBe(supported.text);expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][5]).toContain('UNTRUSTED DATA');
  });
});

describe('Engine conversational orchestration',()=>{
  function fixture(){
    const db={query:jest.fn().mockResolvedValue({rows:[row],rowCount:1})};
    const media={searchDetailed:jest.fn().mockResolvedValue({results:[{assetId:'asset',startTime:10,endTime:20}],searchStatus:'complete'})};
    const ai={isConfigured:()=>true,spaceConversation:jest.fn().mockResolvedValueOnce({action:'search',text:'',searchQuery:'prototype shipping discussion',citedEvidenceIds:[]}).mockResolvedValueOnce(supported)};
    const service=new ConversationService(db as any,media as any,ai as any,config({SPACE_REPLIES_ENABLED:'true'}));return{db,media,ai,service};
  }
  it('retrieves for the authenticated owner and re-reads original index ranges',async()=>{
    const f=fixture();const result=await f.service.reply('owner',{history,selection:[]});
    expect(f.media.searchDetailed.mock.calls[0].slice(0,5)).toEqual(['prototype shipping discussion',undefined,12,'owner','verify']);
    expect(f.db.query.mock.calls[0][1][0]).toBe('owner');expect(result.citations[0]).toMatchObject({assetId:'asset',startS:10,endS:20,status:'indexed'});
    expect(f.ai.spaceConversation.mock.calls[1][0].phase).toBe('answer');
  });
  it('searches the original selected source for a new action despite an answer-only plan',async()=>{
    const f=fixture();f.ai.spaceConversation.mockReset().mockResolvedValueOnce({action:'answer',text:'',searchQuery:'',citedEvidenceIds:[]}).mockResolvedValueOnce(supported);
    const followup=[{role:'user' as const,content:'Find the staff strike'},{role:'assistant' as const,content:'Found that in this clip.'},{role:'user' as const,content:'find the exact timestamps where the two were hugging'}];
    await f.service.reply('owner',{history:followup,selection:[{assetId:'asset',startS:0,endS:20}]});
    expect(f.media.searchDetailed).toHaveBeenCalledWith(followup[2].content,'asset',12,'owner','verify',undefined);
  });
  it('keeps an explicit wider library request unfiltered',async()=>{
    const f=fixture();await f.service.reply('owner',{history:[...history,{role:'assistant',content:'Found it'},{role:'user',content:'Find them in other videos'}],selection:[{assetId:'asset',startS:0,endS:20}]});
    expect(f.media.searchDetailed.mock.calls[0][1]).toBeUndefined();
  });
  it('narrates the full indexed timeline with original duration instead of just the cited excerpt',async()=>{
    const f=fixture();f.db.query.mockReset().mockResolvedValueOnce({rowCount:1,rows:[{id:'asset',duration:53,original_filename:'source.mp4'}]}).mockResolvedValueOnce({rows:[row]}).mockResolvedValueOnce({rows:[{...row,start_time:0,end_time:20},{...row,id:'seg2',start_time:20,end_time:53,range_frames:[{time:26,description:'The two briefly hug'}]}]});
    f.ai.spaceConversation.mockReset().mockResolvedValue(supported);
    await f.service.reply('owner',{history:[{role:'user',content:'Narrate what happened in the whole clip and its duration'}],selection:[{assetId:'asset',startS:0,endS:20}]});
    expect(f.media.searchDetailed).not.toHaveBeenCalled();
    expect(f.ai.spaceConversation.mock.calls[0][0]).toMatchObject({phase:'answer',sourceMetadata:[{assetId:'asset',durationS:53,filename:'source.mp4'}],sourceOverview:{kind:'indexed',complete:true,durationS:53}});
    expect(f.ai.spaceConversation.mock.calls[0][0].evidence[1].description).toContain('26s: The two briefly hug');
    expect(f.db.query.mock.calls[2][0]).toContain('LIMIT 20');expect(f.db.query.mock.calls[2][1][0]).toBe('owner');
  });
  it('does not claim full timeline coverage when the index has a gap',async()=>{
    const f=fixture();f.db.query.mockReset().mockResolvedValueOnce({rowCount:1,rows:[{id:'asset',duration:53,original_filename:'source.mp4'}]}).mockResolvedValue({rows:[{...row,start_time:0,end_time:20}]});
    f.ai.spaceConversation.mockReset().mockResolvedValue(supported);
    const result=await f.service.reply('owner',{history:[{role:'user',content:'Narrate the whole clip'}],selection:[{assetId:'asset',startS:0,endS:20}]});
    expect(result.searchStatus).toBe('incomplete');expect(f.ai.spaceConversation.mock.calls[0][0]).toMatchObject({sourceOverview:{complete:false,durationS:53}});
  });
  it('searches a new quoted moment archive-wide despite an earlier selected source and a reply-only plan',async()=>{
    const query='a moment that says "i look at my exam questions, and they look back at me. i know nothing"';
    expect(requestsFootageSearch(query)).toBe(true);
    const input={history:[{role:'user' as const,content:'Find kitchen dancing'},{role:'assistant' as const,content:'Here is the kitchen clip.'},{role:'user' as const,content:query}],selection:[{assetId:'asset',startS:0,endS:20}]};
    expect(followupSource(input)).toBeUndefined();
    expect(followupSource({...input,history:[...input.history.slice(0,2),{role:'user',content:'Find a moment where they hug'}]})).toBe('asset');
    expect(followupSource({...input,history:[...input.history.slice(0,2),{role:'user',content:'Find a moment that says hello in this clip'}]})).toBe('asset');
    const f=fixture();f.db.query.mockResolvedValue({rows:[{...row,duration:53}],rowCount:1});
    f.ai.spaceConversation.mockReset().mockResolvedValueOnce({action:'reply',text:'Only the kitchen clip is here.',searchQuery:'',citedEvidenceIds:[]}).mockResolvedValue(supported);
    await f.service.reply('owner',input);expect(f.media.searchDetailed).toHaveBeenCalledWith(query,undefined,12,'owner','verify',undefined);
  });
  it('does not perform retrieval for a conversational greeting',async()=>{
    const f=fixture();f.ai.spaceConversation.mockReset().mockResolvedValue({action:'reply',text:'Hi! What would you like to explore?',searchQuery:'',citedEvidenceIds:[]});
    expect((await f.service.reply('owner',{history:[{role:'user',content:'Hi'}],selection:[]})).text).toContain('Hi!');expect(f.media.searchDetailed).not.toHaveBeenCalled();
  });
  it('returns only model-selected relevant sources, not every retrieval candidate',async()=>{
    const f=fixture();f.db.query.mockResolvedValue({rows:[row,{...row,id:'unrelated',asset_id:'other',title:'I know nothing',transcript_text:'Look at the questions for a moment.'}],rowCount:2});
    const result=await f.service.reply('owner',{history,selection:[]});
    expect(result.evidence).toHaveLength(1);expect(result.evidence[0].assetId).toBe('asset');
    expect(f.ai.spaceConversation.mock.calls[1][0].evidence).toHaveLength(2);
  });
  it('retains partial-search status rather than claiming a complete negative',async()=>{
    const f=fixture();f.media.searchDetailed.mockResolvedValue({results:[],searchStatus:'incomplete'});f.ai.spaceConversation.mockReset().mockResolvedValueOnce({action:'search',searchQuery:'prototype',text:'',citedEvidenceIds:[]}).mockResolvedValueOnce({...supported,citedEvidenceIds:[]});
    const value=await f.service.reply('owner',{history,selection:[]});expect(value.searchStatus).toBe('incomplete');
  });
  it('refuses unavailable/foreign selections before any model call',async()=>{
    const f=fixture();f.db.query.mockResolvedValue({rows:[],rowCount:0});
    await expect(f.service.reply('owner',{history,selection:[{assetId:'foreign',startS:0,endS:2}]})).rejects.toBeInstanceOf(NotFoundException);expect(f.ai.spaceConversation).not.toHaveBeenCalled();
  });
  it('is disabled unless explicitly enabled; no implicit paid work',async()=>{
    const f=fixture();const service=new ConversationService(f.db as any,f.media as any,f.ai as any,config({}));
    await expect(service.reply('owner',{history,selection:[]})).rejects.toThrow();expect(f.ai.spaceConversation).not.toHaveBeenCalled();
  });
});

describe('dedicated SaaS engine session guard',()=>{
  const token='a'.repeat(43);
  it('derives the owner from an unexpired hashed session, never body user IDs',async()=>{
    const db={query:jest.fn().mockResolvedValue({rowCount:1,rows:[{user_id:'actual-owner'}]})};const req={headers:{authorization:`SaaS ${token}`},body:{userId:'forged'},user:undefined as unknown};
    const guard=new SaasSessionGuard(db as any);await guard.canActivate({switchToHttp:()=>({getRequest:()=>req})} as any);
    expect(req.user).toEqual({id:'actual-owner'});expect(db.query.mock.calls[0][1]).toEqual([createHash('sha256').update(token).digest('hex')]);expect(db.query.mock.calls[0][0]).toContain('expires_at>now()');
  });
  it('rejects unsigned, expired or developer-token inputs on the SaaS bridge',async()=>{
    const db={query:jest.fn().mockResolvedValue({rowCount:0,rows:[]})};const guard=new SaasSessionGuard(db as any);
    for(const authorization of [undefined,'Bearer token',`SaaS ${token}`])await expect(guard.canActivate({switchToHttp:()=>({getRequest:()=>({headers:{authorization}})})} as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
