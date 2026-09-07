import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { PipelineModule } from '../pipeline/pipeline.module';
import { UploadConnector } from '../connector/upload.connector';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [PipelineModule, QueueModule],
  controllers: [MediaController],
  providers: [MediaService, UploadConnector],
  exports: [MediaService, UploadConnector],
})
export class MediaModule {}
