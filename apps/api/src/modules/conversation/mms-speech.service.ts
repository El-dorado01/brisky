import {Injectable,OnModuleDestroy,ServiceUnavailableException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {spawn,ChildProcessWithoutNullStreams} from 'child_process';
import {randomUUID} from 'crypto';
import * as fs from 'fs';
import {resolveFromRepo} from '../../common/repo-paths';

@Injectable()
export class MmsSpeechService implements OnModuleDestroy{
  private child:ChildProcessWithoutNullStreams|null=null;
  private opening:Promise<void>|null=null;
  private tail:Promise<unknown>=Promise.resolve();
  private waiting=new Map<string,{resolve:(value:Buffer)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private queued=0;
  constructor(private config:ConfigService){}
  ready():Promise<void>{
    if(this.opening)return this.opening;
    const executable=resolveFromRepo(this.config.get('MMS_PYTHON_BIN',process.platform==='win32'?'.venv-mms/Scripts/python.exe':'.venv-mms/bin/python'));
    if(!fs.existsSync(executable))return Promise.reject(new ServiceUnavailableException('Local speech needs setup:mms on the engine host.'));
    const directory=resolveFromRepo(this.config.get('MMS_MODEL_DIR','storage/mms-models/eng'));
    const threads=Number(this.config.get('MMS_CPU_THREADS',4));if(!Number.isInteger(threads)||threads<1||threads>8)return Promise.reject(Error('MMS_CPU_THREADS must be between 1 and 8'));
    this.opening=new Promise<void>((resolve,reject)=>{
      const child=spawn(executable,['-u',resolveFromRepo('services/mms-tts/serve.py'),'--directory',directory,'--threads',String(threads)],{windowsHide:true,stdio:'pipe',env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});this.child=child;
      let text='',ready=false;const timeout=setTimeout(()=>{reject(Error('Local speech startup timed out.'));child.kill();},120000);
      child.stdout.on('data',(chunk:Buffer)=>{text+=chunk.toString('utf8');if(text.length>5*1024*1024){child.kill();return;}let end:number;while((end=text.indexOf('\n'))>=0){const line=text.slice(0,end);text=text.slice(end+1);try{const item=JSON.parse(line);if(item.type==='ready'&&item.sampleRate===24000){ready=true;clearTimeout(timeout);resolve();continue;}const pending=this.waiting.get(item.id);if(!pending)continue;this.waiting.delete(item.id);clearTimeout(pending.timer);if(item.error||item.sampleRate!==24000||typeof item.audio!=='string')pending.reject(Error('Local speech failed.'));else{const bytes=Buffer.from(item.audio,'base64');if(!bytes.length||bytes.length>2160000||bytes.length%2||bytes.toString('base64')!==item.audio)pending.reject(Error('Invalid local speech output'));else pending.resolve(bytes);}}catch{child.kill();}}});
      // Dependency warnings are intentionally not mixed into the JSON protocol.
      child.stderr.resume();
      const failed=()=>{clearTimeout(timeout);if(this.child===child){this.child=null;this.opening=null;}if(!ready)reject(Error('Local speech could not load. Run setup:mms --check.'));for(const pending of this.waiting.values()){clearTimeout(pending.timer);pending.reject(Error('Local speech stopped.'));}this.waiting.clear();};
      child.on('error',failed);child.on('exit',failed);
    });return this.opening;
  }
  async synthesize(text:string,signal?:AbortSignal):Promise<Buffer>{
    if(!text.trim()||text.length>360)throw Error('Speech sentence exceeds bound');
    if(this.queued>=8)throw new ServiceUnavailableException('Local speech is busy.');this.queued++;
    const task=this.tail.catch(()=>{}).then(async()=>{signal?.throwIfAborted();await this.ready();signal?.throwIfAborted();return new Promise<Buffer>((resolve,reject)=>{
      const id=randomUUID(),timer=setTimeout(()=>{this.waiting.delete(id);reject(Error('Local speech timed out.'));this.child?.kill();},30000);this.waiting.set(id,{resolve,reject,timer});
      this.child!.stdin.write(JSON.stringify({id,text})+'\n',error=>{if(error){clearTimeout(timer);this.waiting.delete(id);reject(error);}});
    });});this.tail=task;
    try{const pcm=await task;signal?.throwIfAborted();return pcm;}finally{this.queued--;}
  }
  onModuleDestroy(){this.child?.kill();this.child=null;}
}
