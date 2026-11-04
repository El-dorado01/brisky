import {Body,Controller,HttpCode,Post,Req,Res,UseGuards,ServiceUnavailableException} from '@nestjs/common';
import {once} from 'events';
import {FastifyReply} from 'fastify';
import {SaasSessionGuard} from './saas-session.guard';
import {VoiceService} from './voice.service';
import {withSearchDisconnect} from '../../common/search-disconnect';
import {LiveVoiceService} from './live-voice.service';
import {MmsSavedSpeechService} from './mms-saved-speech.service';

@Controller('saas-engine/voice') @UseGuards(SaasSessionGuard)
export class VoiceController{
  constructor(private readonly voice:VoiceService,private readonly live:LiveVoiceService,private readonly mms:MmsSavedSpeechService){}
  @Post('config') @HttpCode(200)
  config(){return this.live.mode();}
  @Post('live-ticket') @HttpCode(200)
  liveTicket(@Req() req:any,@Body() raw:unknown){return this.live.ticket(req.user.id,raw);}
  @Post('transcribe') @HttpCode(200)
  transcribe(@Req() req:any,@Res({passthrough:true}) response:FastifyReply,@Body() raw:unknown){if(this.live.mode().ttsProvider==='mms')throw new ServiceUnavailableException('This profile uses streaming Meta transcription. Reload and start Voice Mode.');return withSearchDisconnect(req.raw,response.raw,signal=>this.voice.transcribe(req.user.id,raw,signal));}
  @Post('speak') @HttpCode(200)
  async speak(@Req() req:any,@Res() response:FastifyReply,@Body() raw:unknown){const bytes=await withSearchDisconnect(req.raw,response.raw,signal=>this.live.mode().ttsProvider==='mms'?this.mms.render(req.user.id,raw,signal):this.voice.speak(req.user.id,raw,signal));return response.header('Content-Type','audio/wav').header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').send(bytes);}
  @Post('stream') @HttpCode(200)
  async stream(@Req() req:any,@Res() response:FastifyReply){
    let started=false;
    return withSearchDisconnect(req.raw,response.raw,async signal=>{
      try{const service=this.live.mode().ttsProvider==='mms'?this.mms:this.voice;await service.stream(req.user.id,req.body,async packet=>{signal.throwIfAborted();if(!started){response.hijack();response.raw.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'private, no-store, no-transform','X-Content-Type-Options':'nosniff','X-Accel-Buffering':'no'});started=true;}if(!response.raw.write(JSON.stringify(packet)+'\n'))await once(response.raw,'drain',{signal});},signal);response.raw.end();}
      catch(error){if(!started)throw error;if(!response.raw.destroyed)response.raw.end(JSON.stringify({type:'error',message:'Speech stopped before completion. Your reply is saved; please retry.'})+'\n');}
    });
  }
  @Post('preview') @HttpCode(200)
  async preview(@Req() req:any,@Res() response:FastifyReply,@Body() raw:unknown){const bytes=await withSearchDisconnect(req.raw,response.raw,signal=>this.live.mode().ttsProvider==='mms'?this.mms.render(req.user.id,raw,signal,true):this.voice.preview(req.user.id,raw,signal));return response.header('Content-Type','audio/wav').header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').send(bytes);}

}
