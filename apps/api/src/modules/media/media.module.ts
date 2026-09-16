import { Module, forwardRef } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { PipelineModule } from '../pipeline/pipeline.module';
import { UploadConnector } from '../connector/upload.connector';
import { QueueModule } from '../queue/queue.module';
import { ConnectorsModule } from '../connector/connectors.module';

@Module({
  imports: [PipelineModule, QueueModule, forwardRef(() => ConnectorsModule)],
  controllers: [MediaController],
  providers: [MediaService, UploadConnector],
  exports: [MediaService, UploadConnector],
})
export class MediaModule {}
