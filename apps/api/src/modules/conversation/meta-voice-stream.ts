/** Whole-utterance acknowledgements only: mixed requests must still reach tools. */
export function isVoiceAcknowledgement(text:string){
  const value=text.toLowerCase().replace(/[\u2019]/g,"'").replace(/[.!?,—–]/g,' ').replace(/\s+/g,' ').trim();
  return /^(?:(?:yeah|yes|yep|okay|ok|alright|great|perfect|brisky|and)\s+)*(?:thank you(?: so much)?|thanks(?: so much)?|that(?:'s| is) (?:the )?(?:exact |right )?(?:moment|clip|one)(?: (?:i(?:'m| am| was) looking for|i wanted))?)(?:\s+(?:brisky|thank you|thanks|yeah|yes|great|perfect|that(?:'s| is) (?:the )?(?:exact |right )?(?:moment|clip|one)(?: (?:i(?:'m| am| was) looking for|i wanted))?))*$/.test(value);
}

export function isVoiceFarewell(text:string){
  const value=text.toLowerCase().replace(/[\u2019]/g,"'").replace(/[.!?,]/g,' ').replace(/\s+/g,' ').trim();
  return /^(?:(?:okay|ok|alright|brisky|please|thank you|thanks)\s+)*(?:that(?:'s| is) all(?: for (?:the|this|today's) session| for (?:now|today))?|(?:end|close|stop|finish) (?:the |this |our )?(?:voice )?(?:session|call|conversation)|(?:i am|i'm|we are|we're) done(?: for (?:now|today))?|goodbye|bye(?: bye)?)(?:\s+(?:and|brisky|please|thank you|thanks|goodbye|bye(?: bye)?|have a (?:good|great|wonderful|nice) day))*$/.test(value);
}

export function extractSentences(buffer:string,final=false):{sentences:string[];rest:string}{
  const sentences:string[]=[];let rest=buffer;
  for(;;){let cut=0;const match=/[.!?]["')]*(?=\s)/.exec(rest);if(match)cut=match.index+match[0].length;
    if(cut>300)cut=0;
    if(!cut&&rest.length>300){cut=rest.lastIndexOf(' ',300);if(cut<1)cut=300;}
    if(!cut)break;const sentence=rest.slice(0,cut).trim();if(sentence)sentences.push(sentence);rest=rest.slice(cut).trimStart();
  }
  if(final&&rest.trim()){sentences.push(rest.trim());rest='';}return {sentences,rest};
}

/** SSE parser retains strict completion semantics; transport EOF isn't success. */
export async function readMetaVoiceStream(body:ReadableStream<Uint8Array>,onChunk:(value:any)=>Promise<void>|void,signal:AbortSignal){
  const reader=body.getReader(),decoder=new TextDecoder();let pending='',bytes=0,done=false;
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{for(;;){signal.throwIfAborted();const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>1024*1024)throw Error('Voice text stream exceeds bound');pending=(pending+decoder.decode(next.value,{stream:true})).replace(/\r\n/g,'\n');let end:number;while((end=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,end);pending=pending.slice(end+2);const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!data)continue;if(data==='[DONE]'){done=true;continue;}if(done)throw Error('Unexpected post-completion data');await onChunk(JSON.parse(data));}}
    signal.throwIfAborted();if(!done||pending.trim())throw Error('Voice text stream ended before completion');
  }finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
