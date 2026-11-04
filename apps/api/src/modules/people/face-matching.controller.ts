import { Body,Controller,Get,Param,Post,Put,Req,Res,UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { SaasSessionGuard } from '../conversation/saas-session.guard';
import { FaceMatchingService } from './face-matching.service';
import {FaceArchiveService} from './face-archive.service';

@Controller('saas-engine/people') @UseGuards(SaasSessionGuard)
export class FaceMatchingController {
  constructor(private readonly faces:FaceMatchingService,private readonly archive:FaceArchiveService){}
  @Get(':id/face-archive') archiveStatus(@Req() req:any,@Param('id') id:string){return this.archive.status(req.user.id,id);}
  @Put(':id/face-archive') archiveConfigure(@Req() req:any,@Param('id') id:string,@Body() body:unknown){return this.archive.configure(req.user.id,id,body);}
  @Post(':id/face-archive-retry') archiveRetry(@Req() req:any,@Param('id') id:string){return this.archive.retry(req.user.id,id);}
  @Get(':id/face-suggestions') list(@Req() req:any,@Param('id') id:string){return this.faces.list(req.user.id,id);}
  @Post(':id/face-scan') scan(@Req() req:any,@Param('id') id:string,@Body() body:unknown){return this.faces.scan(req.user.id,id,body);}
  @Post(':id/reference-check') check(@Req() req:any,@Param('id') id:string,@Body() body:unknown){return this.faces.checkReference(req.user.id,id,body);}
  @Post('face-suggestions/:id/review') review(@Req() req:any,@Param('id') id:string,@Body() body:unknown){return this.faces.review(req.user.id,id,body);}
  @Get('face-suggestions/:id/frame') async image(@Req() req:any,@Param('id') id:string,@Res() response:FastifyReply){response.header('Cache-Control','private, no-store').type('image/jpeg').send(await this.faces.image(req.user.id,id));}
}
