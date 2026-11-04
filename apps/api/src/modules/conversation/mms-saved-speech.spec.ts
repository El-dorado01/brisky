import {MmsSavedSpeechService} from './mms-saved-speech.service';
import {ConfigService} from '@nestjs/config';
import {NotFoundException} from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('MMS read-aloud ownership and isolated cache',()=>{
  it('checks ownership before synthesis/cache and never accepts arbitrary audition text',async()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'brisky-mms-')),mms={synthesize:jest.fn().mockResolvedValue(Buffer.alloc(4800))},db={query:jest.fn().mockImplementation(async(_sql:string,args:string[])=>({rows:args[1]==='owner'?[{content:'First sentence. Another sentence.'}]:[]}))},service=new MmsSavedSpeechService(db as any,mms as any,new ConfigService({MMS_CACHE_DIR:directory,VOICE_ENABLED:'true'}));const input={messageId:'11111111-1111-4111-8111-111111111111',style:'natural',voice:'Kore'};
    try{
      await expect(service.render('foreign',input)).rejects.toThrow(NotFoundException);expect(mms.synthesize).not.toHaveBeenCalled();const packets:any[]=[];await service.stream('owner',input,async packet=>{packets.push(packet);});expect(mms.synthesize).toHaveBeenCalledTimes(2);expect(packets.at(-1)).toMatchObject({type:'done',cached:false});
      await service.render('owner',input);expect(mms.synthesize).toHaveBeenCalledTimes(2);await expect(service.render('foreign',input)).rejects.toThrow(NotFoundException);expect(mms.synthesize).toHaveBeenCalledTimes(2);
      await expect(service.render('owner',{voice:'mms-eng',sample:0,text:'injected'},undefined,true)).rejects.toThrow();const wav=await service.render('owner',{voice:'mms-eng',sample:0},undefined,true);expect(wav.toString('ascii',0,4)).toBe('RIFF');
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
  });
});
