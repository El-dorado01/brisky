import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  Res,
  Logger,
  BadRequestException,
  ForbiddenException,
  UseGuards,
  Query,
  HttpCode,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FastifyRequest, FastifyReply } from "fastify";
import { MediaService } from "./media.service";
import { AuthGuard } from "../auth/auth.guard";
import * as fs from "fs";
import * as path from "path";

import { FeedbackPayload } from "./media.types";
import { withSearchDisconnect } from '../../common/search-disconnect';
import { validateSearch, boundedText, invalidRequest, validateClip } from '../../common/request-validation';
import { parsePage } from '../../common/pagination';
import { peopleSearchOptions } from '../people/people-search';

@Controller("media")
@UseGuards(AuthGuard)
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(
    private readonly mediaService: MediaService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async listAssets(@Req() req: any, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    const userId = req.user?.id;
    return this.mediaService.listAssetsPage(userId, parsePage(limit, cursor, 'assets', userId));
  }

  @Post("upload")
  async uploadVideo(@Req() req: any) {
    const isDevUploadEnabled =
      this.configService.get<string>("ENABLE_DEV_UPLOAD", "false") === "true";
    if (!isDevUploadEnabled) {
      throw new ForbiddenException(
        "Direct master upload is disabled in Phase 4. Connect cloud storage (e.g. Google Drive) to index media.",
      );
    }
    const userId = req.user?.id;
    const fastifyReq = req as FastifyRequest & {
      isMultipart?: () => boolean;
      file?: () => Promise<
        | { filename: string; file: NodeJS.ReadableStream; mimetype?: string }
        | undefined
      >;
      files: () => AsyncIterableIterator<{
        filename: string;
        file: NodeJS.ReadableStream;
        mimetype: string;
        type: string;
      }>;
    };
    if (
      typeof fastifyReq.isMultipart === "function" &&
      !fastifyReq.isMultipart()
    ) {
      throw new BadRequestException("Request must be multipart/form-data");
    }

    const ALLOWED_EXTENSIONS = new Set([
      ".mp4",
      ".mov",
      ".webm",
      ".mkv",
      ".avi",
      ".m4v",
      ".ogv",
      ".mpg",
      ".mpeg",
      ".ts",
      ".3gp",
    ]);

    const accepted: any[] = [];
    const rejected: Array<{ filename: string; reason: string }> = [];

    // Process all files in the multipart stream
    const parts = fastifyReq.files();
    for await (const part of parts) {
      if (!part.file || !part.filename) continue;
      const ext = path.extname(part.filename).toLowerCase();
      const isVideoMime =
        part.mimetype?.startsWith("video/") ||
        part.mimetype === "application/octet-stream";

      if (!ALLOWED_EXTENSIONS.has(ext) && !isVideoMime) {
        part.file.resume();
        rejected.push({
          filename: part.filename,
          reason: `Unsupported container '${ext || "unknown"}'. Supported formats: MP4, MOV, WebM, MKV, AVI, M4V, MPG, TS.`,
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
        rejected.map((r) => `${r.filename}: ${r.reason}`).join("; "),
      );
    }

    if (accepted.length === 0) {
      throw new BadRequestException("No files uploaded");
    }

    return {
      count: accepted.length,
      accepted,
      rejected,
      message: `${accepted.length} video(s) queued for BullMQ indexing`,
      ...(accepted.length === 1 ? accepted[0] : {}),
    };
  }

  @Post("search")
  @HttpCode(200)
  async searchMoments(
    @Body() body: { query: string; assetId?: string; phase?: 'retrieve' | 'verify'; people?: unknown },
    @Req() req: any,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    validateSearch(body?.query, body?.assetId, body?.phase);
    const people=peopleSearchOptions(body.people);
    const userId = req.user?.id;
    if (!body?.query)
      return {
        query: "",
        count: 0,
        results: [],
        hasExactMatch: false,
        queryIntent: "mixed",
      };
    const searchRes = await withSearchDisconnect(req.raw, reply.raw, (signal) => this.mediaService.searchDetailed(
      body.query,
      body.assetId,
      15,
      userId,
      body.phase === 'retrieve' ? 'retrieve' : 'verify',
      signal,
      people,
    ));
    return { query: body.query, count: searchRes.results.length, ...searchRes };
  }

  @Get("search")
  async searchMomentsGet(
    @Query("q") q: string,
    @Query("assetId") assetId: string,
    @Req() req: any,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    validateSearch(q, assetId);
    const userId = req.user?.id;
    if (!q)
      return {
        query: "",
        count: 0,
        results: [],
        hasExactMatch: false,
        queryIntent: "mixed",
      };
    const searchRes = await withSearchDisconnect(req.raw, reply.raw, (signal) => this.mediaService.searchDetailed(
      q,
      assetId,
      15,
      userId,
      'verify', signal,
    ));
    return { query: q, count: searchRes.results.length, ...searchRes };
  }

  @Post("feedback")
  async recordFeedback(@Body() body: FeedbackPayload, @Req() req: any) {
    validateSearch(body?.query, body?.assetId);
    boundedText(body?.assetId, 'assetId', 128);
    if (body?.feedback !== 'positive' && body?.feedback !== 'negative') invalidRequest('feedback must be positive or negative');
    if (body.segmentId !== undefined) boundedText(body.segmentId, 'segmentId', 256);
    if (body.notes !== undefined) boundedText(body.notes, 'notes', 2000, true);
    if (body.timestampSec !== undefined && (typeof body.timestampSec !== 'number' || !Number.isFinite(body.timestampSec) || body.timestampSec < 0)) invalidRequest('timestampSec must be a non-negative finite number');
    const userId = req.user?.id;
    if (!body?.query || !body?.assetId || !body?.feedback) {
      throw new BadRequestException(
        "query, assetId, and feedback are required",
      );
    }
    const success = await this.mediaService.saveFeedback(body, userId);
    return { success };
  }

  @Post("benchmark/run/:id")
  async runBenchmark(@Param("id") id: string, @Req() req: any) {
    const userId = req.user?.id;
    const results = await this.mediaService.runBenchmarkSuite(id, userId);
    const hits = results.filter((r) => r.hit).length;
    return {
      assetId: id,
      totalQueries: results.length,
      passedHits: hits,
      accuracyPercentage: results.length
        ? Math.round((hits / results.length) * 100)
        : 0,
      results,
    };
  }

  @Post("benchmark/library")
  async runLibraryBenchmark(@Req() req: any) {
    const userId = req.user?.id;
    return this.mediaService.runLibraryBenchmarkSuite(userId);
  }

  @Get("economics")
  async getEconomics(@Req() req: any) {
    const userId = req.user?.id;
    return this.mediaService.getUnitEconomics(userId);
  }

  @Get(":id/status")
  async getStatus(@Param("id") id: string, @Req() req: any) {
    const userId = req.user?.id;
    return this.mediaService.getPublicAsset(id, userId);
  }

  @Get(":id/lineage")
  async getLineage(@Param("id") id: string, @Req() req: any) {
    const userId = req.user?.id;
    return this.mediaService.getLineage(id, userId);
  }

  @Post(":id/extract-clip")
  @HttpCode(202)
  async extractClip(
    @Param("id") id: string,
    @Body() body: { start_s: number; end_s: number; title?: string },
    @Req() req: any,
  ) {
    validateClip(body);
    const userId = req.user?.id;
    return this.mediaService.enqueueClipExtraction(id, body, userId, req.headers?.['idempotency-key']);
  }

  @Get(":id/stream")
  async streamMedia(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: FastifyReply,
  ) {
    const userId = req.user?.id;
    const streamInfo = await this.mediaService.getStreamInfo(id, userId);

    if (streamInfo.status === 'preparing') {
      res.status(202);
      res.header('Retry-After', '3');
      return res.send({
        status: 'preparing',
        proxy_status: streamInfo.proxyStatus,
        message: streamInfo.message,
      });
    }

    const filePath = streamInfo.filePath;
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.status(206);
      res.headers({
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/mp4",
      });
      return res.send(file);
    }

    res.headers({
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
    });
    return res.send(fs.createReadStream(filePath));
  }

  @Get(":id/thumbnail")
  async getThumbnail(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: FastifyReply,
  ) {
    const userId = req.user?.id;
    const thumb = await this.mediaService.getThumbnail(id, userId);
    res.header("Content-Type", thumb.mimeType);

    const hasVersion = Boolean(
      (req.query as Record<string, unknown> | undefined)?.v,
    );
    if (hasVersion) {
      res.header("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.header("Cache-Control", "no-cache");
    }

    if (thumb.buffer) {
      return res.send(thumb.buffer);
    }
    const stat = fs.statSync(thumb.filePath!);
    res.header("Last-Modified", stat.mtime.toUTCString());
    const stream = fs.createReadStream(thumb.filePath!);
    return res.send(stream);
  }

  @Get(":id")
  async getAsset(@Param("id") id: string, @Req() req: any) {
    const userId = req.user?.id;
    return this.mediaService.getPublicArtifacts(id, userId);
  }

  @Post(":id/delete-original")
  async deleteOriginal(@Param("id") id: string, @Req() req: any) {
    const userId = req.user?.id;
    const deleted = await this.mediaService.deleteOriginalSource(id, userId);
    return {
      status: "success",
      assetId: id,
      originalDeleted: deleted,
      message:
        "Original master upload bytes deleted from disk. Proxy stream and PostgreSQL intelligence index remain functional.",
    };
  }
}
