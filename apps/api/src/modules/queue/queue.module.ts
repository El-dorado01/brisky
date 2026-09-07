import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IndexingService } from './indexing.service';
import { IndexingProcessor } from './indexing.processor';
import { IndexingController } from './indexing.controller';
import { PipelineModule } from '../pipeline/pipeline.module';
import { DatabaseModule } from '../database/database.module';

const shouldRunWorker =
  process.env.IS_WORKER === 'true' || process.env.RUN_WORKER_IN_API !== 'false';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'indexing-queue',
    }),
    DatabaseModule,
    forwardRef(() => PipelineModule),
  ],
  controllers: [IndexingController],
  providers: [
    IndexingService,
    ...(shouldRunWorker ? [IndexingProcessor] : []),
  ],
  exports: [IndexingService, BullModule],
})
export class QueueModule {}
