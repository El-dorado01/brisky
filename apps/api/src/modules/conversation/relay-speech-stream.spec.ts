import {ConfigService} from '@nestjs/config';
import {MetaLiveVoice} from './meta-live-voice';

describe('call relay incremental audio',()=>{
  it('forwards audio before sentence completion and preserves split PCM samples',async()=>{
    let finish!:()=>void,first!:()=>void;
    const gate=new Promise<void>(r=>finish=r),heard=new Promise<void>(r=>first=r),packets:any[]=[];
    const synthesize=jest.fn();
    const voice:any=new MetaLiveVoice(new ConfigService(),{ready:async()=>{},synthesize,
      stream:async(_text,audio)=>{await audio(Buffer.from([1,2,3]));first();await gate;await audio(Buffer.from([4]));}},p=>packets.push(p),()=>{});
    let done=false;
    const pending=voice.speakSentence('Hello.',0,voice.turn.signal).then(()=>{done=true;});
    await heard;
    expect(done).toBe(false);expect(Buffer.from(packets[0].data,'base64')).toEqual(Buffer.from([1,2]));
    finish();await pending;
    expect(Buffer.concat(packets.map(p=>Buffer.from(p.data,'base64')))).toEqual(Buffer.from([1,2,3,4]));
    expect(synthesize).not.toHaveBeenCalled();
  });
  it('stops late audio when interrupted instead of playing stale chunks',async()=>{
    let finish!:()=>void,first!:()=>void;
    const gate=new Promise<void>(r=>finish=r),heard=new Promise<void>(r=>first=r),packets:any[]=[];
    const voice:any=new MetaLiveVoice(new ConfigService(),{ready:async()=>{},synthesize:jest.fn(),
      stream:async(_text,audio)=>{await audio(Buffer.alloc(2));first();await gate;await audio(Buffer.alloc(2));}},p=>packets.push(p),()=>{});
    const pending=voice.speakSentence('Hello.',0,voice.turn.signal);
    await heard;voice.interrupt();finish();
    await expect(pending).rejects.toThrow();
    expect(packets.filter(p=>p.type==='audio')).toHaveLength(1);
  });
});
