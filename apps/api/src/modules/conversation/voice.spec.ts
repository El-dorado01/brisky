import {ConfigService} from '@nestjs/config';
import {BadRequestException,NotFoundException} from '@nestjs/common';
import {parseSpeechAudio,parseVoiceTranscript,voiceAudio,voiceBodyLimit,VOICE_BODY_BYTES,VoiceService,VoiceQuotaError} from './voice.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function wav(){const bytes=Buffer.alloc(32044);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(32000,40);return bytes;}
describe('voice boundaries and owner-scoped cached speech',()=>{
  it('raises the body limit only on the audio input route',()=>{for(const url of ['/api/v1/saas-engine/voice/speak','/api/v1/auth/login','/api/v1/saas-engine/reply']){const route={url,method:'POST',bodyLimit:65536};voiceBodyLimit(route);expect(route.bodyLimit).toBe(65536);}const route={url:'/api/v1/saas-engine/voice/transcribe',method:'POST',bodyLimit:65536};voiceBodyLimit(route);expect(route.bodyLimit).toBe(VOICE_BODY_BYTES);});
  it('accepts canonical recorded audio and rejects injected fields, invalid headers and overlarge data',()=>{
    expect(voiceAudio({audio:wav().toString('base64'),mimeType:'audio/wav'}).bytes).toEqual(wav());
    for(const raw of [{audio:'xxx',mimeType:'audio/wav'},{audio:Buffer.alloc(50).toString('base64'),mimeType:'audio/wav'},{audio:wav().toString('base64'),mimeType:'audio/wav',owner:'foreign'},{audio:'a'.repeat(2800001),mimeType:'audio/webm'}])expect(()=>voiceAudio(raw)).toThrow(BadRequestException);
  });
  it('does not turn silence into a spoken transcript and rejects partial output',()=>{const result={candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({speechDetected:false,text:'invented words'})}]}}]};expect(parseVoiceTranscript(result)).toEqual({speechDetected:false,text:''});expect(()=>parseVoiceTranscript({candidates:[{finishReason:'MAX_TOKENS'}]})).toThrow();});
  it('requires completed WAV audio instead of trusting arbitrary inline bytes',()=>{expect(()=>parseSpeechAudio({status:'completed',steps:[{type:'model_output',content:[{type:'audio',data:Buffer.from('bad').toString('base64')}]}]})).toThrow();});
  it('checks ownership before cache, caches delivery separately, and coalesces duplicate requests',async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brisky-voice-check-')),bytes=wav(),db={query:jest.fn().mockImplementation(async(_sql:string,args:string[])=>({rows:args[1]==='owner'?[{content:'A generated greeting.'}]:[]}))};
    const config=new ConfigService({VOICE_ENABLED:'true',AI_API_KEY:'fixture',VOICE_CACHE_DIR:dir});const service=new VoiceService(config,db as any),call=jest.spyOn(service as any,'call').mockResolvedValue({status:'completed',steps:[{type:'model_output',content:[{type:'audio',data:bytes.toString('base64')}]}]});
    const input={messageId:'11111111-1111-4111-8111-111111111111',style:'natural'};
    try{await expect(service.speak('foreign',input)).rejects.toThrow(NotFoundException);expect(call).not.toHaveBeenCalled();const result=await Promise.all([service.speak('owner',input),service.speak('owner',input)]);expect(result[0]).toEqual(bytes);expect(call).toHaveBeenCalledTimes(1);await service.speak('owner',input);expect(call).toHaveBeenCalledTimes(1);await service.speak('owner',{...input,style:'storyteller'});expect(call).toHaveBeenCalledTimes(2);await expect(service.speak('foreign',input)).rejects.toThrow(NotFoundException);await service.speak('owner',{...input,voice:'Puck'});expect(call).toHaveBeenCalledTimes(3);expect((call.mock.calls[2][2] as any).generation_config.speech_config[0].voice).toBe('Puck');await expect(service.speak('owner',{...input,voice:'not-a-voice'})).rejects.toThrow(BadRequestException);await expect(service.preview('owner',{voice:'Kore',sample:0,text:'injected'})).rejects.toThrow(BadRequestException);await service.preview('owner',{voice:'Zephyr',sample:0});expect(call).toHaveBeenCalledTimes(4);await service.preview('owner',{voice:'Zephyr',sample:0});expect(call).toHaveBeenCalledTimes(4);expect(db.query.mock.calls.every(c=>c[0].includes("role='assistant'"))).toBe(true);}
    finally{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);}
  });
  it('coalesces quota fallback, retains the selected voice, and keeps the preferred model configured',async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brisky-quota-check-')),bytes=wav();const config=new ConfigService({VOICE_ENABLED:'true',AI_API_KEY:'fixture',VOICE_CACHE_DIR:dir,VOICE_TTS_FALLBACK_MODEL:'gemini-3.8-flash-lite-tts'});
    const service=new VoiceService(config,{query:async()=>({rows:[{content:'A fixed greeting.'}]})} as any);
    const call=jest.spyOn(service as any,'call').mockRejectedValueOnce(new VoiceQuotaError(60000)).mockResolvedValue({status:'completed',steps:[{type:'model_output',content:[{type:'audio',data:bytes.toString('base64')}]}]});
    try{const input={messageId:'11111111-1111-4111-8111-111111111111',style:'natural',voice:'Puck'};const results=await Promise.all([service.speak('owner',input),service.speak('owner',input)]);expect(results[0]).toEqual(bytes);expect(results[1]).toEqual(bytes);expect(call).toHaveBeenCalledTimes(2);expect(call.mock.calls.map(c=>c[0])).toEqual(['gemini-3.8-flash-tts','gemini-3.8-flash-lite-tts']);expect((call.mock.calls[1][2] as any).generation_config.speech_config[0].voice).toBe('Puck');await service.speak('owner',input);expect(call).toHaveBeenCalledTimes(2);}
    finally{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);}
  });

});
