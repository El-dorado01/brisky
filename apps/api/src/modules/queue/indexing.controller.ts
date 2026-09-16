import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IndexingService } from './indexing.service';
import { AuthGuard } from '../auth/auth.guard';

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
  async getJobs(@Req() req: any) {
    const userId = req.user?.id;
    return this.indexingService.getRecentJobs(userId);
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
    const pattern = (body?.pattern || 'MADE EASY').trim();
    return this.indexingService.reindexMatching(userId, pattern);
  }
}
