import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, UseGuards, HttpCode } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { invalidRequest } from '../../common/request-validation';
import { PeopleService } from './people.service';
import { PeopleSearchService } from './people-search.service';
import { SearchDeadlineError, withSearchDeadline } from '../../common/search-deadline';
import { withSearchDisconnect } from '../../common/search-disconnect';

@Controller('people')
@UseGuards(AuthGuard)
export class PeopleController {
  constructor(private readonly people: PeopleService, private readonly search: PeopleSearchService) {}

  @Post('search')
  @HttpCode(200)
  searchPeople(@Req() req: any, @Res({ passthrough: true }) reply: any, @Body() body: unknown) {
    return withSearchDisconnect(req.raw, reply.raw, signal => withSearchDeadline(30000,
      () => this.search.search(req.user?.id, body), signal)).catch(error => {
        if (!(error instanceof SearchDeadlineError)) throw error;
        return { results: [], hasExactMatch: false, queryIntent: 'visual', searchStatus: 'incomplete', canContinue: true,
          explanation: 'Identity search did not finish. Retry; this does not establish that the people are absent.' };
      });
  }

  @Get()
  list(@Req() req: any, @Query('limit') limit?: string, @Query('after') after?: string) {
    return this.people.list(req.user?.id, limit, after);
  }
  @Post()
  create(@Req() req: any, @Body() body: unknown) { return this.people.save(req.user?.id, body); }
  @Put(':id')
  replace(@Req() req: any, @Param('id') id: string, @Body() body: unknown) { return this.people.save(req.user?.id, body, id); }
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) { return this.people.remove(req.user?.id, id); }
  @Post(':id/appearances')
  addAppearance(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.people.addAppearance(req.user?.id, id, body);
  }
  @Get(':id/appearances')
  appearances(@Req() req: any, @Param('id') id: string, @Query('limit') limit?: string, @Query('after') after?: string) {
    return this.people.appearances(req.user?.id, id, limit, after);
  }
  @Patch('appearances/:id')
  review(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'status') ||
        !['confirmed', 'rejected'].includes(body.status)) invalidRequest('status must be confirmed or rejected');
    return this.people.review(req.user?.id, id, body.status);
  }
  @Delete('appearances/:id')
  removeAppearance(@Req() req: any, @Param('id') id: string) { return this.people.removeAppearance(req.user?.id, id); }
}
