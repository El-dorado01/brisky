import { Injectable, Logger } from '@nestjs/common';
import { MediaConnector } from './media-connector.interface';

@Injectable()
export class ConnectorRegistry {
  private readonly logger = new Logger(ConnectorRegistry.name);
  private readonly connectors = new Map<string, MediaConnector>();

  register(connector: MediaConnector): void {
    if (this.connectors.has(connector.provider)) {
      this.logger.warn(`Overwriting registered connector for provider: ${connector.provider}`);
    }
    this.connectors.set(connector.provider, connector);
    this.logger.log(`Registered MediaConnector provider: ${connector.provider}`);
  }

  get(provider: string): MediaConnector {
    const key = provider === 'drive' ? 'google_drive' : provider;
    const connector = this.connectors.get(key);
    if (!connector) {
      throw new Error(`No MediaConnector registered for provider '${provider}'. Registered: [${Array.from(this.connectors.keys()).join(', ')}]`);
    }
    return connector;
  }

  has(provider: string): boolean {
    return this.connectors.has(provider);
  }

  listProviders(): string[] {
    return Array.from(this.connectors.keys());
  }
}
