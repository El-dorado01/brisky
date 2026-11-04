import {BadRequestException,Injectable,NotFoundException,ServiceUnavailableException} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {MmsSpeechService} from './mms-speech.service';
import {VOICE_SAMPLES,BRISKY_VOICES} from './voice.service';
import {extractSentences} from './meta-voice-stream';
import {pcmWav,wavPcm,VoiceEmit} from './voice-stream';
import {createHash,randomUUID} from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import {resolveFromRepo} from '../../common/repo-paths';
import {ConfigService} from '@nestjs/config';

@Injectable()
export class MmsSavedSpeechService{
  constructor(private db:DatabaseService,private mms:MmsSpeechService,private config:ConfigService){}
  private async input(owner:string,raw:unknown,preview=false){
    if(this.config.get('VOICE_ENABLED','false')!=='true')throw new ServiceUnavailableException('Voice is disabled.');
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Choose a reply or sample');const r=raw as Record<string,unknown>;
    if(r.voice!==undefined&&r.voice!=='mms-eng'&&!BRISKY_VOICES.includes(r.voice as any))throw new BadRequestException('Choose a supported voice');
    if(preview){if(Object.keys(r).some(k=>!['voice','sample'].includes(k))||!Number.isInteger(r.sample)||Number(r.sample)<0||Number(r.sample)>=VOICE_SAMPLES.length)throw new BadRequestException('Choose a voice sample');return {identity:'sample-'+r.sample,text:VOICE_SAMPLES[Number(r.sample)] as string};}
    if(Object.keys(r).some(k=>!['messageId','voice','style'].includes(k))||typeof r.messageId!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i).test(r.messageId)||!['natural','storyteller'].includes(String(r.style)))throw new BadRequestException('Choose a saved reply and style');
    const result=await this.db.query("SELECT content FROM saas.messages WHERE id=$1 AND user_id=$2 AND role='assistant'",[r.messageId,owner]);if(!result.rows[0])throw new NotFoundException('This reply is unavailable');const text=String(result.rows[0].content);if(!text.trim()||text.length>6000)throw new BadRequestException('Ask for a shorter spoken reply');return {identity:r.messageId,text};
  }
  async render(owner:string,raw:unknown,signal?:AbortSignal,preview=false){const parts:Buffer[]=[];await this.stream(owner,raw,async packet=>{if(packet.type==='audio')parts.push(Buffer.from(packet.data,'base64'));},signal,preview);return pcmWav(Buffer.concat(parts));}
  async stream(owner:string,raw:unknown,emit:VoiceEmit,signal?:AbortSignal,preview=false){
    const item=await this.input(owner,raw,preview),started=Date.now(),directory=resolveFromRepo(this.config.get('MMS_CACHE_DIR','storage/voice-cache/mms')),hash=createHash('sha256').update(JSON.stringify([owner,item.identity,item.text,'facebook/mms-tts-eng','c71de0fe7204c83f1c10820a7d696d0b450048ba',42])).digest('hex'),file=path.join(directory,hash+'.wav');
    let cached:Buffer|null=null;try{const stat=await fs.stat(file);if(Date.now()-stat.mtimeMs<86400000&&stat.size<=16*1024*1024)cached=wavPcm(await fs.readFile(file)).pcm;}catch{}
    await emit({type:'format',sampleRate:24000,channels:1,encoding:'pcm_s16le'});let firstAudioMs=0,size=0;const parts:Buffer[]=[];
    const audio=async(pcm:Buffer)=>{size+=pcm.length;if(size>16*1024*1024)throw Error('MMS reply exceeds audio limit');if(!firstAudioMs)firstAudioMs=Date.now()-started;for(let offset=0;offset<pcm.length;offset+=24000){signal?.throwIfAborted();await emit({type:'audio',data:pcm.subarray(offset,offset+24000).toString('base64')});}};
    if(cached)await audio(cached);else{
      const clean=item.text.replace(/https?:\/\/\S+/g,'').replace(/[*_`#]/g,'');for(const sentence of extractSentences(clean,true).sentences){signal?.throwIfAborted();const pcm=await this.mms.synthesize(sentence,signal);parts.push(pcm);await audio(pcm);}
      signal?.throwIfAborted();await fs.mkdir(directory,{recursive:true});for(const entry of await fs.readdir(directory)){if(!/^[a-f0-9]{64}\.wav$/.test(entry))continue;const target=path.join(directory,entry),stat=await fs.stat(target).catch(()=>null);if(stat&&Date.now()-stat.mtimeMs>=86400000)await fs.unlink(target).catch(()=>{});}
      if((await fs.readdir(directory)).length<256){const temp=path.join(directory,hash+'.'+randomUUID()+'.tmp');try{await fs.writeFile(temp,pcmWav(Buffer.concat(parts)),{mode:0o600});signal?.throwIfAborted();await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}}
    }
    await emit({type:'done',cached:!!cached,firstAudioMs,totalMs:Date.now()-started});
  }
}
