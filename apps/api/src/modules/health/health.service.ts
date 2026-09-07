import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { Client } from 'pg';
import Redis from 'ioredis';

type ServiceCheck = {
  status: string;
  error?: string;
  pgvector?: string;
  pgvectorVersion?: string;
};

@Injectable()
export class HealthService implements OnModuleInit {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ffmpegService: FfmpegService,
  ) {}

  async onModuleInit() {
    await this.ensurePgvector();
  }

  async check() {
    const ffmpegStatus = await this.ffmpegService.getVersion();
    const dbStatus = await this.checkDatabase();
    const redisStatus = await this.checkRedis();

    const healthy =
      ffmpegStatus.available &&
      dbStatus.status === 'connected' &&
      dbStatus.pgvector === 'available' &&
      redisStatus.status === 'connected';

    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.get<string>('NODE_ENV', 'development'),
      services: {
        api: { status: 'healthy' },
        ffmpeg: {
          status: ffmpegStatus.available ? 'healthy' : 'unavailable',
          version: ffmpegStatus.version,
          path: ffmpegStatus.path,
        },
        database: dbStatus,
        redis: redisStatus,
      },
    };
  }

  private async ensurePgvector() {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (!databaseUrl) {
      return;
    }

    const client = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 2000,
    });

    try {
      await client.connect();
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      this.logger.log('pgvector extension is enabled');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not enable pgvector yet: ${message}`);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async checkDatabase(): Promise<ServiceCheck> {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (!databaseUrl) {
      return { status: 'unconfigured' };
    }

    const client = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 1500,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      const result = await client.query<{ extversion: string }>(
        `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
      );
      const version = result.rows[0]?.extversion;
      return {
        status: 'connected',
        pgvector: version ? 'available' : 'missing',
        pgvectorVersion: version,
      };
    } catch (err) {
      return {
        status: 'disconnected',
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async checkRedis(): Promise<ServiceCheck> {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = Number(this.configService.get('REDIS_PORT', 6379));

    const redis = new Redis({
      host,
      port,
      connectTimeout: 1000,
      maxRetriesPerRequest: 0,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});

    try {
      await redis.connect();
      await redis.ping();
      return { status: 'connected' };
    } catch (err) {
      return {
        status: 'disconnected',
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await redis.quit().catch(() => undefined);
    }
  }
}
