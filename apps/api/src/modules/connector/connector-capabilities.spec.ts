import { GoogleDriveConnector } from './google-drive.connector';
import { UploadConnector } from './upload.connector';

describe('Connector Capabilities (Phase F4)', () => {
  it('GoogleDriveConnector declares correct capabilities', () => {
    const mockConfig: any = {
      get: jest.fn().mockImplementation((key: string, def?: any) => def ?? ''),
    };
    const connector = new GoogleDriveConnector(mockConfig);

    expect(connector.capabilities).toBeDefined();
    expect(connector.capabilities).toEqual({
      can_read: true,
      can_write: true,
      can_stream: true,
      can_range_read: true,
      supports_webhooks: true,
      supports_signed_urls: false,
      supports_large_files: true,
    });
  });

  it('UploadConnector declares correct capabilities', () => {
    const mockConfig: any = {
      get: jest.fn().mockImplementation((key: string, def?: any) => {
        if (key === 'UPLOAD_DIR') return './storage/uploads';
        return def ?? '';
      }),
    };
    const connector = new UploadConnector(mockConfig);

    expect(connector.capabilities).toBeDefined();
    expect(connector.capabilities).toEqual({
      can_read: true,
      can_write: false,
      can_stream: true,
      can_range_read: true,
      supports_webhooks: false,
      supports_signed_urls: false,
      supports_large_files: true,
    });
  });
});
