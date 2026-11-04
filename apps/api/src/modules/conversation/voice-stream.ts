import {ServiceUnavailableException} from '@nestjs/common';

export type VoicePacket={type:'format';sampleRate:number;channels:1;encoding:'pcm_s16le'}|{type:'audio';data:string}|{type:'done';cached:boolean;firstAudioMs:number;totalMs:number};
export type VoiceEmit=(packet:VoicePacket)=>Promise<void>;
export function pcmWav(pcm:Buffer,sampleRate=24000){const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(sampleRate,24);header.writeUInt32LE(sampleRate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);return Buffer.concat([header,pcm]);}
export function wavPcm(wav:Buffer){
 if(wav.length<44||wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw Error('Invalid cached speech');let rate=0,pcm:Buffer|undefined;
 for(let offset=12;offset+8<=wav.length;){const kind=wav.toString('ascii',offset,offset+4),size=wav.readUInt32LE(offset+4),start=offset+8;if(start+size>wav.length)throw Error('Truncated cached speech');if(kind==='fmt '){if(size<16||wav.readUInt16LE(start)!==1||wav.readUInt16LE(start+2)!==1||wav.readUInt16LE(start+14)!==16)throw Error('Unsupported cached speech');rate=wav.readUInt32LE(start+4);}if(kind==='data')pcm=wav.subarray(start,start+size);offset=start+size+(size%2);}
 if(![8000,16000,22050,24000,44100,48000].includes(rate)||!pcm?.length||pcm.length%2)throw Error('Unsupported cached speech');return {pcm,sampleRate:rate};
}
/** Incremental SSE decoder: tolerate split UTF-8/CRLF boundaries, reject truncation. */
export async function consumeSpeechSse(body:ReadableStream<Uint8Array>,audio:(pcm:Buffer)=>Promise<void>,signal:AbortSignal){
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='',wire=0,pcmBytes=0,complete=false,usage:any;const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 async function event(block:string){const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!data||data==='[DONE]')return;let value:any;try{value=JSON.parse(data);}catch{throw Error('Malformed speech event');}
  if(value.metadata?.total_usage)usage=value.metadata.total_usage;
  if(value.event_type==='interaction.completed'){if(value.interaction?.status&&value.interaction.status!=='completed')throw Error('Incomplete speech');complete=true;usage=value.interaction?.usage||usage;}
  if(value.event_type==='error'||value.event_type==='interaction.failed'||value.event_type==='interaction.cancelled')throw Error('Speech stream failed');
  if(value.event_type==='step.delta'&&value.delta?.type==='audio'&&value.delta.data){const d=value.delta;if(complete||typeof d.data!=='string'||d.data.length>1024*1024||d.mime_type&&d.mime_type!=='audio/l16'||d.sample_rate&&d.sample_rate!==24000||d.channels&&d.channels!==1)throw Error('Unsupported speech stream');const bytes=Buffer.from(d.data,'base64');if(bytes.toString('base64')!==d.data)throw Error('Invalid speech encoding');pcmBytes+=bytes.length;if(pcmBytes>16*1024*1024)throw Error('Speech is too large');if(bytes.length)await audio(bytes);}
 }
 try{while(true){signal.throwIfAborted();const next=await reader.read();signal.throwIfAborted();if(next.done)break;wire+=next.value.length;if(wire>24*1024*1024)throw Error('Oversized speech stream');buffer+=decoder.decode(next.value,{stream:true});let boundary:RegExpExecArray|null;while((boundary=/\r?\n\r?\n/.exec(buffer))){const block=buffer.slice(0,boundary.index);buffer=buffer.slice(boundary.index+boundary[0].length);await event(block);}if(buffer.length>2*1024*1024)throw Error('Oversized speech event');}
  buffer+=decoder.decode();if(buffer.trim())await event(buffer);if(!complete||!pcmBytes||pcmBytes%2)throw new ServiceUnavailableException('Speech stopped before completion. Please retry the saved reply.');return usage;
 }finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
