import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { FfmpegModule } from './modules/ffmpeg/ffmpeg.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { QueueModule } from './modules/queue/queue.module';
import { MediaModule } from './modules/media/media.module';
import { ConnectorsModule } from './modules/connector/connectors.module';
import * as path from 'path';
import { APP_FILTER } from '@nestjs/core';
import { ApiErrorsFilter } from './common/api-errors';
import { ApiContractController } from './common/api-contract';
import { PeopleModule } from './modules/people/people.module';
import { ConversationModule } from './modules/conversation/conversation.module';

@Module({
  controllers: [ApiContractController],
  providers: [{ provide: APP_FILTER, useClass: ApiErrorsFilter }],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(__dirname, '../../../.env'),
        path.resolve(__dirname, '../.env'),
        '.env',
      ],
    }),
    DatabaseModule,
    AuthModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        extraOptions: { manualRegistration: config.get('BRISKY_MANUAL_QUEUE_REGISTRATION') === 'true' },
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get('REDIS_PORT', 6379)),
        },
      }),
    }),
    QueueModule,
    ConnectorsModule,
    FfmpegModule,
    PipelineModule,
    HealthModule,
    MediaModule,
    PeopleModule,
    ConversationModule,
  ],
})
export class AppModule {}
