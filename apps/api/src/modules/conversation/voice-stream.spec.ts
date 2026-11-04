import {ConfigService} from '@nestjs/config';
import {VoiceService} from './voice.service';
import {consumeSpeechSse,pcmWav,wavPcm,VoicePacket} from './voice-stream';
import * as fs from 'fs';import * as os from 'os';import * as path from 'path';
const pcm=Buffer.alloc(4800,1),input={messageId:'11111111-1111-4111-8111-111111111111',style:'natural',voice:'Kore'};
const audio={event_type:'step.delta',delta:{type:'audio',mime_type:'audio/l16',sample_rate:24000,channels:1,data:pcm.toString('base64')}};
const complete={event_type:'interaction.completed',interaction:{status:'completed',usage:{total_input_tokens:8,total_output_tokens:12}}};
const event=(value:unknown)=>'data: '+JSON.stringify(value)+'\r\n\r\n';
function body(values:unknown[]){const bytes=Buffer.from(values.map(event).join(''));return new ReadableStream<Uint8Array>({start(c){for(let i=0;i<bytes.length;i+=31)c.enqueue(bytes.subarray(i,i+31));c.close();}});}
describe('streamed speech boundaries',()=>{
 const originalFetch=global.fetch;afterEach(()=>{global.fetch=originalFetch;jest.restoreAllMocks();});
 it('decodes split SSE before completion and recovers usage',async()=>{
  let finish!:()=>void,first!:()=>void;const heard=new Promise<void>(r=>first=r),stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(Buffer.from(event(audio)));finish=()=>{c.enqueue(Buffer.from(event(complete)));c.close();};}});let completed=false;
  const result=consumeSpeechSse(stream,async bytes=>{expect(bytes).toEqual(pcm);first();},new AbortController().signal).then(v=>{completed=true;return v;});await heard;expect(completed).toBe(false);finish();expect((await result).total_output_tokens).toBe(12);
 });
 it('roundtrips PCM WAV and rejects truncation or incompatible formats',async()=>{
  expect(wavPcm(pcmWav(pcm))).toEqual({pcm,sampleRate:24000});expect(()=>wavPcm(Buffer.alloc(44))).toThrow();await expect(consumeSpeechSse(body([audio]),async()=>{},new AbortController().signal)).rejects.toThrow();await expect(consumeSpeechSse(body([{...audio,delta:{...audio.delta,sample_rate:8000}},complete]),async()=>{},new AbortController().signal)).rejects.toThrow();
 });
 function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brisky-stream-')),db={query:jest.fn().mockImplementation(async(_sql:string,args:string[])=>({rows:args[1]==='owner'?[{content:'A fixed greeting.'}]:[]}))},service=new VoiceService(new ConfigService({VOICE_ENABLED:'true',AI_API_KEY:'fixture',VOICE_CACHE_DIR:dir,VOICE_TTS_FALLBACK_MODEL:'gemini-3.8-flash-lite-tts'}),db as any),ledger=(service as any).ledger;
 jest.spyOn(ledger,'reserve').mockReturnValue({id:'fixture'});jest.spyOn(ledger,'settle').mockImplementation(()=>{});return {dir,service,ledger,clean:()=>{for(const f of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,f));fs.rmdirSync(dir);}};}
 it('checks ownership, sends chunks early, caches complete audio and replays without inference',async()=>{const f=fixture(),packets:VoicePacket[]=[];global.fetch=jest.fn().mockResolvedValue(new Response(body([audio,complete]),{headers:{'content-type':'text/event-stream'}}));try{
  await expect(f.service.stream('foreign',input,async()=>{})).rejects.toThrow();expect(global.fetch).not.toHaveBeenCalled();await f.service.stream('owner',input,async p=>{packets.push(p);});expect(packets.map(p=>p.type)).toEqual(['format','audio','done']);expect(f.ledger.settle).toHaveBeenCalledWith(expect.anything(),'success',expect.any(Number),8,12);expect(wavPcm(await f.service.speak('owner',input)).pcm).toEqual(pcm);await f.service.stream('owner',input,async()=>{});expect(global.fetch).toHaveBeenCalledTimes(1);
 }finally{f.clean();}});
 it('does not cache or mark an interrupted stream successful',async()=>{const f=fixture(),controller=new AbortController();global.fetch=jest.fn().mockResolvedValue(new Response(body([audio,complete])));try{await expect(f.service.stream('owner',input,async p=>{if(p.type==='audio')controller.abort();},controller.signal)).rejects.toThrow();expect(fs.readdirSync(f.dir)).toHaveLength(0);expect(f.ledger.settle).toHaveBeenCalledWith(expect.anything(),'error',expect.any(Number));}finally{f.clean();}});
 it('falls back on quota before audio starts, retaining actual-model cache identity',async()=>{const f=fixture();global.fetch=jest.fn().mockResolvedValueOnce(Response.json({error:{message:'100 requests per day; retry in 8h'}},{status:429})).mockResolvedValueOnce(new Response(body([audio,complete])));try{await f.service.stream('owner',input,async()=>{});expect(global.fetch).toHaveBeenCalledTimes(2);const calls=(global.fetch as jest.Mock).mock.calls.map(c=>JSON.parse(c[1].body).model);expect(calls).toEqual(['gemini-3.8-flash-tts','gemini-3.8-flash-lite-tts']);await f.service.speak('owner',input);expect(global.fetch).toHaveBeenCalledTimes(2);}finally{f.clean();}});
});
