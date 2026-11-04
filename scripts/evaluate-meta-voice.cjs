// Opt-in paid, synthetic-text-only comparison. Run from the repository root:
// node --env-file=.env scripts/evaluate-meta-voice.cjs --run
// Uses the normal append-only budget ledger; never calls media tools or writes Spaces.
const fs=require('fs'),path=require('path'),{randomUUID}=require('crypto');
if(!process.argv.includes('--run')){console.log('Explicit --run required. Build apps/api first. Uses configured AI budget.');process.exit(0);}
const {ConfigService}=require('../apps/api/node_modules/@nestjs/config');
const {AiUsageLedger}=require('../apps/api/dist/modules/pipeline/ai-usage-ledger');
const {SYSTEM,TOOLS}=require('../apps/api/dist/modules/conversation/meta-live-voice');
const {readMetaVoiceStream}=require('../apps/api/dist/modules/conversation/meta-voice-stream');
const prices=JSON.parse(process.env.AI_MODEL_PRICING_JSON||'{}');
prices['meta/muse-wonder-1.0']={reservationUsd:.25,inputUsdPerMillion:4,outputUsdPerMillion:20};
const ledger=new AiUsageLedger(new ConfigService({...process.env,AI_MODEL_PRICING_JSON:JSON.stringify(prices)}));
const found=[{role:'user',content:'Find someone dancing in a kitchen.'},{role:'assistant',content:'I found a matching clip. A person dances beside a kitchen counter between 4 and 9 seconds.'}];
const fixtures=[
 {id:'greeting',text:'Hi Brisky, how are you?',expected:'none',history:[]},
 {id:'search',text:'Find a lady dancing in the kitchen.',expected:'consult_brisky',history:[]},
 {id:'pending-status',text:'What about my search?',expected:'none',history:[found[0]],state:'A library search is currently running. Tell the user it is still running when asked.'},
 {id:'found-status',text:'Did you find the moment?',expected:'none',history:found},
 {id:'confirmation',text:"Yeah thank you that's the exact moment I'm looking for",expected:'none',history:found},
 {id:'mixed-request',text:'Thank you, now find a different clip with someone outside.',expected:'consult_brisky',history:found},
 {id:'explanation',text:'Explain how you use timestamps and why you should not guess missing details. Please cover both parts.',expected:'none',history:[]},
 {id:'farewell',text:'That is all for this session, goodbye Brisky.',expected:'end_call',history:found},
];
(async()=>{
 const results=[];const output=path.resolve('storage/voice-evaluation/wonder-comparison.json');fs.mkdirSync(path.dirname(output),{recursive:true});
 for(const [index,fixture] of fixtures.entries())for(const model of index%2?['muse-wonder-1.0','muse-spark-1.3']:['muse-spark-1.3','muse-wonder-1.0']){
  const attempt=ledger.reserve('meta',model,'voice_model_comparison',randomUUID()),start=Date.now();let usage,first=null,answer='',finish='',settled=false;const calls=new Map();
  try{
   const response=await fetch('https://api.meta.ai/v1/chat/completions',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+process.env.META_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,stream:true,stream_options:{include_usage:true},max_completion_tokens:1024,reasoning_effort:'minimal',messages:[{role:'system',content:SYSTEM+' Searches already dispatched continue in the background even when the user speaks. For status questions, use the search state below and do not start a new search. Do not add invented explanatory notes to the user request. '+(fixture.state||'No search is currently running; completed results are in the conversation history.')},...fixture.history,{role:'user',content:fixture.text}],tools:TOOLS}),signal:AbortSignal.timeout(60000)});
   if(!response.ok){await response.body?.cancel();throw Error('HTTP '+response.status);}
   await readMetaVoiceStream(response.body,value=>{if(value.usage)usage=value.usage;const choice=value.choices?.[0];if(!choice)return;if(choice.finish_reason)finish=choice.finish_reason;const delta=choice.delta;if(delta?.content){first??=Date.now()-start;answer+=delta.content;}for(const call of delta?.tool_calls||[]){first??=Date.now()-start;const item=calls.get(call.index)||{name:'',arguments:''};item.name+=call.function?.name||'';item.arguments+=call.function?.arguments||'';calls.set(call.index,item);}},new AbortController().signal);
   if(!['stop','tool_calls'].includes(finish))throw Error('Incomplete generation');
   ledger.settle(attempt,'success',Date.now()-start,usage?.prompt_tokens,usage?.completion_tokens);settled=true;
   const tools=[...calls.values()];const pass=fixture.expected==='none'?tools.length===0&&!!answer.trim():tools.length===1&&tools[0].name===fixture.expected;
   results.push({fixture:fixture.id,model,pass,expected:fixture.expected,firstOutputMs:first,totalMs:Date.now()-start,answer,tools,usage,estimatedUsd:usage?ledger.estimateUsd('meta',model,usage.prompt_tokens,usage.completion_tokens):null});
   console.log(JSON.stringify({fixture:fixture.id,model,pass,firstOutputMs:first,totalMs:Date.now()-start}));
  }catch(error){if(!settled)ledger.settle(attempt,'error',Date.now()-start,usage?.prompt_tokens,usage?.completion_tokens);results.push({fixture:fixture.id,model,error:error.message,pass:false});console.log(JSON.stringify({fixture:fixture.id,model,error:error.message}));}
  fs.writeFileSync(output,JSON.stringify({generatedAt:new Date().toISOString(),syntheticTextOnly:true,modelDecisionTestWithoutAcknowledgementOrStatusGuards:true,asrAndMmsNotMeasured:true,results},null,2));
 }
 console.log('Report: storage/voice-evaluation/wonder-comparison.json');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
