"use client";

/** Plays little-endian PCM as chunks arrive; stopping cancels the upstream reader. */
export class StreamingSpeechPlayer{
 private context:AudioContext|null=null;private ownContext=true;
 constructor(context?:AudioContext){if(context){this.context=context;this.ownContext=false;}}
 prime(){if(!this.context)this.context=new AudioContext();void this.context.resume().catch(()=>{});}
private reader:ReadableStreamDefaultReader<Uint8Array>|null=null;private sources=new Set<AudioBufferSourceNode>();private stopped=false;private reject:((error:Error)=>void)|null=null;
 pause(){if(this.stopped)return;this.stopped=true;void this.reader?.cancel().catch(()=>{});for(const source of this.sources){source.onended=null;try{source.stop();}catch{}}this.sources.clear();if(this.ownContext)void this.context?.close().catch(()=>{});this.context=null;this.reject?.(new DOMException('Speech stopped','AbortError'));}
 async play(response:Response,options:{signal:AbortSignal;rate:number;onStart:()=>void}){
  if(this.stopped||options.signal.aborted)throw new DOMException('Speech stopped','AbortError');if(!response.body)throw Error('Speech returned no audio.');
  let resolveEnd=()=>{};const ended=new Promise<void>((resolve,reject)=>{resolveEnd=resolve;this.reject=reject;});void ended.catch(()=>{});
  let contextReady=false,format=false,sampleRate=0,done=false,started=false,nextTime=0,pendingByte:number|null=null,totalBytes=0,wire=0,buffer='';const decoder=new TextDecoder();
  const abort=()=>this.pause();options.signal.addEventListener('abort',abort,{once:true});this.reader=response.body.getReader();
  const packet=async(line:string)=>{
   if(!line.trim())return;const value=JSON.parse(line);if(this.stopped)throw new DOMException('Speech stopped','AbortError');
   if(value.type==='error')throw Error('Speech stopped before completion. Your reply is saved; please retry.');
   if(value.type==='format'){if(format||![8000,16000,22050,24000,44100,48000].includes(value.sampleRate)||value.channels!==1||value.encoding!=='pcm_s16le')throw Error('Unsupported speech format.');format=true;sampleRate=value.sampleRate;return;}
   if(value.type==='done'){if(done||!started||pendingByte!==null)throw Error('Incomplete speech audio.');done=true;if(!this.sources.size)resolveEnd();return;}
   if(value.type!=='audio'||!format||done||typeof value.data!=='string'||value.data.length>1024*1024)throw Error('Invalid speech stream.');
   const raw=atob(value.data);totalBytes+=raw.length;if(totalBytes>16*1024*1024)throw Error('Speech is too large.');const bytes=new Uint8Array(raw.length+(pendingByte===null?0:1));let offset=0;if(pendingByte!==null){bytes[0]=pendingByte;offset=1;pendingByte=null;}for(let i=0;i<raw.length;i++)bytes[i+offset]=raw.charCodeAt(i);if(bytes.length%2)pendingByte=bytes[bytes.length-1];const samples=Math.floor(bytes.length/2);if(!samples)return;
   if(!contextReady){const context=this.context||new AudioContext();this.context=context;let timeout:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([context.resume(),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('Tap the microphone to allow audio playback.')),3000);})]);}finally{if(timeout)clearTimeout(timeout);}if(this.stopped)throw new DOMException('Speech stopped','AbortError');if(context.state!=='running')throw Error('Tap the microphone to allow audio playback.');nextTime=context.currentTime+.06;contextReady=true;}
   const context=this.context!,audio=context.createBuffer(1,samples,sampleRate),channel=audio.getChannelData(0),view=new DataView(bytes.buffer);for(let i=0;i<samples;i++)channel[i]=view.getInt16(i*2,true)/32768;
   const source=context.createBufferSource();source.buffer=audio;source.playbackRate.value=options.rate;source.connect(context.destination);this.sources.add(source);source.onended=()=>{this.sources.delete(source);if(done&&!this.sources.size)resolveEnd();};nextTime=Math.max(nextTime,context.currentTime+.03);source.start(nextTime);nextTime+=audio.duration/options.rate;if(!started){started=true;options.onStart();}
  };
  try{for(;;){options.signal.throwIfAborted();const next=await this.reader.read();if(next.done)break;wire+=next.value.length;if(wire>24*1024*1024)throw Error('Speech is too large.');buffer+=decoder.decode(next.value,{stream:true});let split:number;while((split=buffer.indexOf('\n'))>=0){await packet(buffer.slice(0,split));buffer=buffer.slice(split+1);}if(buffer.length>2*1024*1024)throw Error('Speech packet is too large.');}buffer+=decoder.decode();if(buffer.trim())await packet(buffer);if(!done)throw Error('Speech stopped before completion. Please retry.');await ended;
  }catch(error){this.pause();throw error;}finally{options.signal.removeEventListener('abort',abort);await this.reader?.cancel().catch(()=>{});this.reader?.releaseLock();this.reader=null;if(this.ownContext)void this.context?.close().catch(()=>{});this.context=null;this.reject=null;}
 }
}
