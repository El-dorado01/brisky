import { ConnectorRegistry } from './connector.registry';
import { MediaConnector } from './media-connector.interface';

describe('ConnectorRegistry', () => {
  let registry: ConnectorRegistry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  it('registers and retrieves a MediaConnector by provider', () => {
    const mockConnector: MediaConnector = {
      provider: 'test_provider',
      listAssets: jest.fn(),
      getAsset: jest.fn(),
      downloadAsset: jest.fn(),
    };

    registry.register(mockConnector);
    expect(registry.has('test_provider')).toBe(true);
    expect(registry.get('test_provider')).toBe(mockConnector);
    expect(registry.listProviders()).toEqual(['test_provider']);
  });

  it('throws an error when getting an unregistered provider', () => {
    expect(() => registry.get('non_existent')).toThrow(
      /No MediaConnector registered for provider 'non_existent'/,
    );
  });
});
