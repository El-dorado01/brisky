import { Body, Controller, Get, Param, Post, Req, UseGuards, Query } from '@nestjs/common';
import { parsePage } from '../../common/pagination';
import { IndexingService } from './indexing.service';
import { AuthGuard } from '../auth/auth.guard';
import { boundedText } from '../../common/request-validation';

@Controller('indexing')
@UseGuards(AuthGuard)
export class IndexingController {
  constructor(private readonly indexingService: IndexingService) {}

  @Get('stats')
  async getStats(@Req() req: any) {
    const userId = req.user?.id;
    return this.indexingService.getStats(userId);
  }

  @Get('jobs')
  async getJobs(@Req() req: any, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    const userId = req.user?.id;
    return this.indexingService.listJobsPage(userId, parsePage(limit, cursor, 'jobs', userId));
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string, @Req() req: any) {
    return this.indexingService.getJob(boundedText(id, 'id', 128), req.user?.id);
  }

  @Post('jobs/:id/retry-operation')
  async retryOperation(@Param('id') id: string, @Req() req: any) {
    return this.indexingService.retryClip(boundedText(id, 'id', 128), req.user?.id);
  }

  @Post('jobs/:assetId/retry')
  async retry(@Param('assetId') assetId: string, @Req() req: any) {
    const userId = req.user?.id;
    const success = await this.indexingService.retryAsset(assetId, userId);
    return { success, assetId };
  }

  @Post('jobs/:id/cancel')
  async cancel(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id;
    return this.indexingService.cancelJob(id, userId);
  }

  @Post('reindex-matching')
  async reindexMatching(@Body() body: { pattern?: string }, @Req() req: any) {
    const userId = req.user?.id;
    const pattern = boundedText(body?.pattern, 'pattern', 200).trim();
    return this.indexingService.reindexMatching(userId, pattern);
  }
}
