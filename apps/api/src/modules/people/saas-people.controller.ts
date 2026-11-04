import { Body,Controller,Delete,Get,Param,Post,Put,Query,Req,UseGuards } from '@nestjs/common';
import { SaasSessionGuard } from '../conversation/saas-session.guard';
import { PeopleService } from './people.service';

/** First-party session bridge; developer JWT routes remain separate. */
@Controller('saas-engine/people')
@UseGuards(SaasSessionGuard)
export class SaasPeopleController {
  constructor(private readonly people:PeopleService){}
  @Get() list(@Req() req:any,@Query('limit') limit?:string,@Query('after') after?:string){return this.people.list(req.user.id,limit,after);}
  @Post() create(@Req() req:any,@Body() body:unknown){return this.people.save(req.user.id,body);}
  @Put(':id') replace(@Req() req:any,@Param('id') id:string,@Body() body:unknown){return this.people.save(req.user.id,body,id);}
  @Delete(':id') remove(@Req() req:any,@Param('id') id:string){return this.people.remove(req.user.id,id);}
  @Get(':id/appearances') appearances(@Req() req:any,@Param('id') id:string,@Query('limit') limit?:string,@Query('after') after?:string){return this.people.appearances(req.user.id,id,limit,after);}
  @Post(':id/appearances') tag(@Req() req:any,@Param('id') id:string,@Body() body:unknown){return this.people.addAppearance(req.user.id,id,body);}
  @Delete('appearances/:id') undo(@Req() req:any,@Param('id') id:string){return this.people.removeAppearance(req.user.id,id);}
}
