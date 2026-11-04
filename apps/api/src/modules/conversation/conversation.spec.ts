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
  it.each(['How does search work?','What can you find?','Thanks for helping me find that clip.',
    'Rephrase your last answer about the search.','Translate "find the hippo" into French.'])(
    'does not force a keyword-only media lookup for %s',query=>{
      expect(requestsFootageSearch(query)).toBe(false);
    });
  it.each(['How does search work? Also find a hippo.','Thanks, find another clip.',
    'Rephrase your answer and find a hippo.'])(
    'preserves an actionable request mixed with ordinary conversation: %s',query=>{
      expect(requestsFootageSearch(query)).toBe(true);
    });
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
    expect(f.media.searchDetailed).toHaveBeenCalledWith(followup[2].content,'asset',12,'owner','verify',undefined,undefined,followup[2].content);
  });
  it('keeps an explicit wider library request unfiltered',async()=>{
    const f=fixture();await f.service.reply('owner',{history:[...history,{role:'assistant',content:'Found it'},{role:'user',content:'Find them in other videos'}],selection:[{assetId:'asset',startS:0,endS:20}]});
    expect(f.media.searchDetailed.mock.calls[0][1]).toBeUndefined();
  });
  it.each([
    'a lady that throws something at a hippo, can you find that moment for me?',
    'Find a man that drops his phone',
    'Find the video of a hippo catching fruit',
    'Can you find them elsewhere in my collection?',
  ])('does not mistake a new description for a selected-source reference: %s',async query=>{
    const input={history:[{role:'user' as const,content:'Find outdoor training'},
      {role:'assistant' as const,content:'Found the training field.'},{role:'user' as const,content:query}],
      selection:[{assetId:'asset',startS:0,endS:20}]};
    expect(followupSource(input)).toBeUndefined();
    const f=fixture();await f.service.reply('owner',input);
    expect(f.media.searchDetailed.mock.calls[0][1]).toBeUndefined();
  });
  it.each(['Find it in this clip','Find where those two hug','What happens after that?'])(
    'preserves genuine references to the selected source: %s',query=>{
      expect(followupSource({history:[...history,{role:'assistant',content:'Found this clip.'},{role:'user',content:query}],
        selection:[{assetId:'asset',startS:0,endS:20}]})).toBe('asset');
    });
  it.each(['Find another hug in this clip','Find a different action within the selected video'])(
    'keeps explicit local scope despite broadening words: %s',query=>{
      expect(followupSource({history:[...history,{role:'assistant',content:'Found this clip.'},{role:'user',content:query}],
        selection:[{assetId:'asset',startS:0,endS:20}]})).toBe('asset');
    });
  it('does not reuse old selected evidence or duration when a new search returns nothing',async()=>{
    const f=fixture();f.media.searchDetailed.mockResolvedValue({results:[],searchStatus:'incomplete'});
    f.db.query.mockResolvedValue({rows:[{...row,id:'asset',duration:53}],rowCount:1});
    f.ai.spaceConversation.mockReset().mockResolvedValueOnce({action:'search',searchQuery:'unseen elephant',text:'',citedEvidenceIds:[]})
      .mockResolvedValue({...supported,text:'I could not establish that from this search.',citedEvidenceIds:[]});
    const result=await f.service.reply('owner',{history:[...history,{role:'assistant',content:'Found the previous clip.'},
      {role:'user',content:'Find an elephant in my collection'}],selection:[{assetId:'asset',startS:0,endS:20}]});
    const answer=f.ai.spaceConversation.mock.calls[1][0] as SpaceAiInput;
    expect(answer.evidence).toEqual([]);expect(answer.sourceMetadata).toEqual([]);
    expect(result.citations).toEqual([]);expect(result.searchStatus).toBe('incomplete');
  });
  it('loads authenticated duration metadata for newly retrieved sources rather than the previous clip',async()=>{
    const f=fixture();f.media.searchDetailed.mockResolvedValue({results:[{assetId:'new',startTime:10,endTime:20}],searchStatus:'complete'});
    f.db.query.mockReset().mockResolvedValueOnce({rows:[{id:'asset',duration:53,original_filename:'old.mp4'}],rowCount:1})
      .mockResolvedValueOnce({rows:[row]}).mockResolvedValueOnce({rows:[{...row,asset_id:'new'}]})
      .mockResolvedValueOnce({rows:[{id:'new',duration:20,original_filename:'new.mp4'}]});
    await f.service.reply('owner',{history:[...history,{role:'assistant',content:'Found the old clip.'},
      {role:'user',content:'Find a hippo in my collection'}],selection:[{assetId:'asset',startS:0,endS:20}]});
    const answer=f.ai.spaceConversation.mock.calls[1][0] as SpaceAiInput;
    expect(answer.evidence.every(e=>e.assetId==='new')).toBe(true);
    expect(answer.sourceMetadata).toEqual([{assetId:'new',durationS:20,filename:'new.mp4'}]);
    expect(f.db.query.mock.calls[3][1]).toEqual(['owner',['new']]);
    expect(f.db.query.mock.calls[3][0]).toContain('user_id=$1');
  });
  it('does not let whole-video narration bypass a request to find a different source',async()=>{
    const f=fixture();f.db.query.mockResolvedValue({rows:[{...row,id:'asset',duration:53}],rowCount:1});
    await f.service.reply('owner',{history:[...history,{role:'assistant',content:'Found this clip.'},
      {role:'user',content:'Find another whole clip and describe what happened'}],selection:[{assetId:'asset',startS:0,endS:20}]});
    expect(f.media.searchDetailed).toHaveBeenCalled();
    expect(f.ai.spaceConversation).toHaveBeenCalledTimes(2);
  });
  it('retains an exact-match rejection for a qualified alternative without changing its assessment',async()=>{
    const f=fixture();
    f.media.searchDetailed.mockResolvedValue({results:[{assetId:'asset',startTime:10,endTime:20,
      verificationStatus:'not_matched',verificationExplanation:'Hippo catches thrown fruit; thrower is not visible.'}],searchStatus:'complete'} as any);
    await f.service.reply('owner',{history,selection:[]});
    const answer=f.ai.spaceConversation.mock.calls[1][0] as SpaceAiInput;
    expect(answer.evidence[0].status).toBe('indexed');
    expect(answer.evidence[0].queryChecks?.[0]).toMatchObject({status:'not_matched',explanation:'Hippo catches thrown fruit; thrower is not visible.'});
    expect(spaceConversationPrompt(answer)).toContain('explicitly naming the missing or different detail');
    expect(spaceConversationPrompt(answer)).toContain('Respect explicit exclusions');
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
  it('loads later lesson steps for tutorial brainstorming rather than only the saved excerpt',async()=>{
    const f=fixture();f.db.query.mockReset().mockResolvedValueOnce({rowCount:1,rows:[{id:'asset',duration:120,original_filename:'lesson.mp4'}]})
      .mockResolvedValueOnce({rows:[row]}).mockResolvedValueOnce({rows:[{...row,start_time:0,end_time:30},
        {...row,id:'later',start_time:30,end_time:120,transcript_text:'Later lesson step: validate the result.'}]});
    f.ai.spaceConversation.mockReset().mockResolvedValue(supported);
    await f.service.reply('owner',{history:[{role:'user',content:'Explain this tutorial and brainstorm questions I can ask'}],
      selection:[{assetId:'asset',startS:10,endS:20}]});
    expect(f.media.searchDetailed).not.toHaveBeenCalled();
    const answer=f.ai.spaceConversation.mock.calls[0][0] as SpaceAiInput;
    expect(answer.sourceOverview).toMatchObject({complete:true,durationS:120});
    expect(answer.evidence.some(e=>e.transcript.includes('validate the result'))).toBe(true);
    expect(spaceConversationPrompt(answer)).toContain('never as quotations or things the instructor actually said');
  });
  it('compares multiple sources with separate coverage and balanced context',async()=>{
    const f=fixture();f.db.query.mockReset().mockResolvedValueOnce({rowCount:2,rows:[{id:'asset',duration:120,original_filename:'one.mp4'},
      {id:'second',duration:60,original_filename:'two.mp4'}]}).mockResolvedValueOnce({rows:[row]})
      .mockResolvedValueOnce({rows:[{...row,start_time:0,end_time:30},{...row,id:'later',start_time:30,end_time:120}]})
      .mockResolvedValueOnce({rows:[{...row,id:'two',asset_id:'second',start_time:0,end_time:60}]});
    f.ai.spaceConversation.mockReset().mockResolvedValue(supported);
    await f.service.reply('owner',{history:[{role:'user',content:'Compare these two tutorials and suggest questions'}],
      selection:[{assetId:'asset',startS:10,endS:20},{assetId:'second',startS:10,endS:20}]});
    const answer=f.ai.spaceConversation.mock.calls[0][0] as SpaceAiInput;
    expect(answer.sourceOverview).toBeUndefined();
    expect(answer.sourceOverviews).toMatchObject([{assetId:'asset',durationS:120,complete:true},{assetId:'second',durationS:60,complete:true}]);
    expect(answer.evidence.map(e=>e.assetId)).toEqual(['asset','second','asset']);
    expect(new Set(answer.evidence.map(e=>e.id)).size).toBe(3);
  });
  it('answers what happened next from later indexed context while retaining the selected anchor',async()=>{
    const f=fixture();f.db.query.mockReset().mockResolvedValueOnce({rowCount:1,rows:[{id:'asset',duration:53,original_filename:'memory.mp4'}]})
      .mockResolvedValueOnce({rows:[row]}).mockResolvedValueOnce({rows:[{...row,start_time:0,end_time:20},
        {...row,id:'later',start_time:20,end_time:53,description:'The visitors arrive afterward.'}]});
    f.ai.spaceConversation.mockReset().mockResolvedValue(supported);
    await f.service.reply('owner',{history:[...history,{role:'assistant',content:'Found this moment.'},
      {role:'user',content:'What happened next?'}],selection:[{assetId:'asset',startS:10,endS:20}]});
    const answer=f.ai.spaceConversation.mock.calls[0][0] as SpaceAiInput;
    expect(answer.selectedRanges).toEqual([{assetId:'asset',startS:10,endS:20}]);
    expect(answer.evidence.some(e=>e.description.includes('visitors arrive'))).toBe(true);
    expect(f.media.searchDetailed).not.toHaveBeenCalled();
  });
  it('keeps explicit excerpt-only brainstorming within the supplied moment',async()=>{
    const f=fixture();f.db.query.mockResolvedValue({rowCount:1,rows:[{...row,id:'asset',duration:120}]});
    f.ai.spaceConversation.mockReset().mockResolvedValueOnce({action:'answer',text:'',searchQuery:'',citedEvidenceIds:[]}).mockResolvedValue(supported);
    await f.service.reply('owner',{history:[{role:'user',content:'Brainstorm questions about this tutorial excerpt'}],selection:[{assetId:'asset',startS:10,endS:20}]});
    expect(f.db.query).toHaveBeenCalledTimes(2);
    expect(f.ai.spaceConversation.mock.calls[1][0].sourceOverviews).toBeUndefined();
  });
  it('does not search or reopen a whole source merely to rewrite a previous answer',async()=>{
    const f=fixture();f.db.query.mockResolvedValue({rowCount:1,rows:[{...row,id:'asset',duration:120}]});
    await f.service.reply('owner',{history:[...history,{role:'assistant',content:'Possibly a match, but the details remain uncertain.'},
      {role:'user',content:'Rephrase your last answer about the whole video.'}],selection:[{assetId:'asset',startS:10,endS:20}]});
    expect(f.media.searchDetailed).not.toHaveBeenCalled();
    expect(f.db.query).toHaveBeenCalledTimes(2);
    expect(f.ai.spaceConversation.mock.calls[1][0].sourceOverviews).toBeUndefined();
  });
  it('does not claim complete source coverage when the shared context budget omits later sections',async()=>{
    const f=fixture(),item=(assetId:string,startS:number,endS:number)=>({...evidence,assetId,startS,endS});
    jest.spyOn(f.service as any,'evidence').mockResolvedValueOnce(Array.from({length:20},(_,i)=>item('asset',i,i+1)))
      .mockResolvedValueOnce([item('second',0,10)]);
    const reviewed=await (f.service as any).reviewSources('owner',[{assetId:'asset',durationS:20,filename:'one'},
      {assetId:'second',durationS:10,filename:'two'}]);
    expect(reviewed.evidence).toHaveLength(20);
    expect(reviewed.overviews).toMatchObject([{assetId:'asset',complete:false},{assetId:'second',complete:true}]);
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
    await f.service.reply('owner',input);expect(f.media.searchDetailed).toHaveBeenCalledWith(query,undefined,12,'owner','verify',undefined,undefined,query);
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
