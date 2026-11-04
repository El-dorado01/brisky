import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../queue/queue.module';
import { UploadConnector } from './upload.connector';
import { GoogleDriveConnector } from './google-drive.connector';
import { TokenCryptoService } from './token-crypto.service';
import { ConnectorsService } from './connectors.service';
import { ConnectorsController } from './connectors.controller';
import { ConnectorRegistry } from './connector.registry';
import { ConnectorPollerService } from './connector-poller.service';
import { SaasConnectorsController } from './saas-connectors.controller';
import { SaasSessionGuard } from '../conversation/saas-session.guard';

@Module({
  imports: [DatabaseModule, forwardRef(() => QueueModule)],
  controllers: [ConnectorsController,SaasConnectorsController],
  providers: [
    ConnectorRegistry,
    UploadConnector,
    GoogleDriveConnector,
    TokenCryptoService,
    ConnectorsService,
    ConnectorPollerService,
    SaasSessionGuard,
  ],
  exports: [
    ConnectorRegistry,
    UploadConnector,
    GoogleDriveConnector,
    TokenCryptoService,
    ConnectorsService,
    ConnectorPollerService,
  ],
})
export class ConnectorsModule implements OnModuleInit {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly uploadConnector: UploadConnector,
    private readonly googleDriveConnector: GoogleDriveConnector,
  ) {}

  onModuleInit() {
    this.registry.register(this.uploadConnector);
    this.registry.register(this.googleDriveConnector);
  }
}
