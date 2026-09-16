import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IndexingService } from './indexing.service';
import { IndexingProcessor } from './indexing.processor';
import { IndexingController } from './indexing.controller';
import { FactorySchedulerService } from './factory-scheduler.service';
import { PipelineModule } from '../pipeline/pipeline.module';
import { DatabaseModule } from '../database/database.module';
import { ConnectorsModule } from '../connector/connectors.module';

import { BullmqMediaFactory } from './bullmq-media-factory.service';
import { MEDIA_FACTORY } from './media-factory.interface';

export function shouldRunWorkerProcess(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.IS_WORKER === 'true' || env.RUN_WORKER_IN_API === 'true';
}

const shouldRunWorker = shouldRunWorkerProcess();

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'indexing-queue',
    }),
    DatabaseModule,
    forwardRef(() => PipelineModule),
    forwardRef(() => ConnectorsModule),
  ],
  controllers: [IndexingController],
  providers: [
    IndexingService,
    FactorySchedulerService,
    BullmqMediaFactory,
    {
      provide: MEDIA_FACTORY,
      useClass: BullmqMediaFactory,
    },
    ...(shouldRunWorker ? [IndexingProcessor] : []),
  ],
  exports: [
    IndexingService,
    FactorySchedulerService,
    BullModule,
    BullmqMediaFactory,
    MEDIA_FACTORY,
  ],
})
export class QueueModule {}
