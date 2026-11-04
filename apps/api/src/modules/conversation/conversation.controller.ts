import { Body,Controller,Get,Head,Param,Query,HttpCode,Post,Req,Res,UseGuards } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { AuthGuard } from '../auth/auth.guard';
import { SaasSessionGuard } from './saas-session.guard';
import { ConversationService } from './conversation.service';
import { withSearchDisconnect } from '../../common/search-disconnect';
import { MediaService } from '../media/media.service';
import { streamResponse } from '../media/stream-response';
import { remoteStreamResponse } from '../media/remote-stream-response';
import { MomentThumbnailService } from '../media/moment-thumbnail.service';
import { createReadStream } from 'fs';

@Controller()
export class ConversationController {
  constructor(private readonly conversations:ConversationService,private readonly media:MediaService,private readonly thumbnails:MomentThumbnailService){}
  @Get('saas-engine/media/:id/moment-thumbnail') @UseGuards(SaasSessionGuard)
  async thumbnail(@Param('id') id:string,@Query('startS') start:string,@Query('endS') end:string,@Req() req:any,@Res() response:FastifyReply){
    const file=await this.thumbnails.image(req.user.id,id,start?.trim()?Number(start):NaN,end?.trim()?Number(end):NaN);
    response.header('Cache-Control','private, no-store');
    if(!file)return response.status(202).header('Retry-After','3').send({status:'preparing'});
    response.headers({'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff'});
    return response.send(createReadStream(file));
  }
  // Register explicit HEAD before GET so Fastify does not create a duplicate auto-HEAD.
  @Head('saas-engine/media/:id/stream') @UseGuards(SaasSessionGuard)
  head(@Param('id') id:string,@Req() req:any,@Res() response:FastifyReply){return this.stream(id,req,response);}
  @Get('saas-engine/media/:id/stream') @UseGuards(SaasSessionGuard)
  async stream(@Param('id') id:string,@Req() req:any,@Res() response:FastifyReply){
    const controller=new AbortController(),cancel=()=>controller.abort();
    req.raw.once('aborted',cancel);response.raw.once('close',cancel);
    try{
      const info=await this.media.getStreamInfo(id,req.user.id,false);
      if(info.status==='ready')return await streamResponse(info.filePath,req,response);
      const source=await this.media.getRemotePlaybackSource(id,req.user.id,controller.signal);
      if(source)return await remoteStreamResponse(source,req,response,controller.signal);
      return response.status(202).headers({'Retry-After':'3','Cache-Control':'private, no-store'}).send({status:'preparing'});
    }finally{req.raw.off('aborted',cancel);response.raw.off('close',cancel);}
  }
  @Post('saas-engine/studio/generate') @HttpCode(200) @UseGuards(SaasSessionGuard)
  studio(@Body() body:unknown,@Req() req:any,@Res({passthrough:true}) response:FastifyReply){
    return withSearchDisconnect(req.raw,response.raw,signal=>this.conversations.studio(req.user.id,body,signal));
  }
  @Post('conversation/reply') @HttpCode(200) @UseGuards(AuthGuard)
  reply(@Body() body:unknown,@Req() req:any,@Res({passthrough:true}) response:FastifyReply){
    return withSearchDisconnect(req.raw,response.raw,signal=>this.conversations.reply(req.user.id,body,signal));
  }
  @Post('saas-engine/reply') @HttpCode(200) @UseGuards(SaasSessionGuard)
  saasReply(@Body() body:unknown,@Req() req:any,@Res({passthrough:true}) response:FastifyReply){
    return withSearchDisconnect(req.raw,response.raw,signal=>this.conversations.reply(req.user.id,body,signal));
  }
}
