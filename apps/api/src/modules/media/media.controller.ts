import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  Res,
  NotFoundException,
  Logger,
  BadRequestException,
  UseGuards,
  Query,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { MediaService } from './media.service';
import { AuthGuard } from '../auth/auth.guard';
import * as fs from 'fs';
import * as path from 'path';

import { FeedbackPayload } from './media.types';

@Controller('media')
@UseGuards(AuthGuard)
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaService: MediaService) {}

  @Get()
  async listAssets(@Req() req: any) {
    const userId = req.user?.id;
    const assets = await this.mediaService.listPublicAssets(userId);
    return { count: assets.length, assets };
  }

  @Post('upload')
  async uploadVideo(@Req() req: any) {
    const userId = req.user?.id;
    const fastifyReq = req as FastifyRequest & {
      isMultipart?: () => boolean;
      file?: () => Promise<{ filename: string; file: NodeJS.ReadableStream; mimetype?: string } | undefined>;
      files: () => AsyncIterableIterator<{
        filename: string;
        file: NodeJS.ReadableStream;
        mimetype: string;
        type: string;
      }>;
    };
    if (typeof fastifyReq.isMultipart === 'function' && !fastifyReq.isMultipart()) {
      throw new BadRequestException('Request must be multipart/form-data');
    }

    const ALLOWED_EXTENSIONS = new Set([
      '.mp4',
      '.mov',
      '.webm',
      '.mkv',
      '.avi',
      '.m4v',
      '.ogv',
      '.mpg',
      '.mpeg',
      '.ts',
      '.3gp',
    ]);

    const accepted: any[] = [];
    const rejected: Array<{ filename: string; reason: string }> = [];

    // Process all files in the multipart stream
    const parts = fastifyReq.files();
    for await (const part of parts) {
      if (!part.file || !part.filename) continue;
      const ext = path.extname(part.filename).toLowerCase();
      const isVideoMime =
        part.mimetype?.startsWith('video/') ||
        part.mimetype === 'application/octet-stream';

      if (!ALLOWED_EXTENSIONS.has(ext) && !isVideoMime) {
        part.file.resume();
        rejected.push({
          filename: part.filename,
          reason: `Unsupported container '${ext || 'unknown'}'. Supported formats: MP4, MOV, WebM, MKV, AVI, M4V, MPG, TS.`,
        });
        continue;
      }

      try {
        const result = await this.mediaService.startFromUploadStream(
          part.filename,
          part.file,
          userId,
        );
        accepted.push(result);
        this.logger.log(
          `Accepted video upload '${part.filename}' for user ${userId} -> asset ${result.assetId}`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        rejected.push({
          filename: part.filename,
          reason: message,
        });
      }
    }

    if (accepted.length === 0 && rejected.length > 0) {
      throw new BadRequestException(
        rejected.map((r) => `${r.filename}: ${r.reason}`).join('; '),
      );
    }

    if (accepted.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    return {
      count: accepted.length,
      accepted,
      rejected,
      message: `${accepted.length} video(s) queued for BullMQ indexing`,
      ...(accepted.length === 1 ? accepted[0] : {}),
    };
  }


  @Post('search')
  async searchMoments(
    @Body() body: { query: string; assetId?: string },
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    if (!body?.query) return { query: '', count: 0, results: [], hasExactMatch: false, queryIntent: 'mixed' };
    const searchRes = await this.mediaService.searchDetailed(body.query, body.assetId, 15, userId);
    return { query: body.query, count: searchRes.results.length, ...searchRes };
  }

  @Get('search')
  async searchMomentsGet(
    @Query('q') q: string,
    @Query('assetId') assetId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    if (!q) return { query: '', count: 0, results: [], hasExactMatch: false, queryIntent: 'mixed' };
    const searchRes = await this.mediaService.searchDetailed(q, assetId, 15, userId);
    return { query: q, count: searchRes.results.length, ...searchRes };
  }

  @Post('feedback')
  async recordFeedback(
    @Body() body: FeedbackPayload,
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    if (!body?.query || !body?.assetId || !body?.feedback) {
      throw new BadRequestException('query, assetId, and feedback are required');
    }
    const success = await this.mediaService.saveFeedback(body, userId);
    return { success };
  }

  @Post('benchmark/run/:id')
  async runBenchmark(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id;
    const results = await this.mediaService.runBenchmarkSuite(id, userId);
    const hits = results.filter((r) => r.hit).length;
    return {
      assetId: id,
      totalQueries: results.length,
      passedHits: hits,
      accuracyPercentage: results.length ? Math.round((hits / results.length) * 100) : 0,
      results,
    };
  }

  @Post('benchmark/library')
  async runLibraryBenchmark(@Req() req: any) {
    const userId = req.user?.id;
    return this.mediaService.runLibraryBenchmarkSuite(userId);
  }

  @Get('economics')
  async getEconomics(@Req() req: any) {
    const userId = req.user?.id;
    return this.mediaService.getUnitEconomics(userId);
  }

  @Get(':id/status')
  async getStatus(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id;
    return this.mediaService.getPublicAsset(id, userId);
  }

  @Get(':id/lineage')
  async getLineage(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id;
    return this.mediaService.getLineage(id, userId);
  }

  @Get(':id/stream')
  async streamMedia(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: FastifyReply,
  ) {
    const userId = req.user?.id;
    const filePath = await this.mediaService.getStreamPath(id, userId);
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.status(206);
      res.headers({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });
      return res.send(file);
    }

    res.headers({
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    return res.send(fs.createReadStream(filePath));
  }

  @Get(':id/thumbnail')
  async getThumbnail(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: FastifyReply,
  ) {
    const userId = req.user?.id;
    const thumbPath = await this.mediaService.getThumbnailPath(id, userId);
    const stream = fs.createReadStream(thumbPath);
    res.header('Content-Type', 'image/jpeg');
    return res.send(stream);
  }

  @Get(':id')
  async getAsset(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id;
    return this.mediaService.getPublicArtifacts(id, userId);
  }

  @Post(':id/delete-original')
  async deleteOriginal(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id;
    const deleted = await this.mediaService.deleteOriginalSource(id, userId);
    return {
      status: 'success',
      assetId: id,
      originalDeleted: deleted,
      message:
        'Original master upload bytes deleted from disk. Proxy stream and PostgreSQL intelligence index remain functional.',
    };
  }
}
