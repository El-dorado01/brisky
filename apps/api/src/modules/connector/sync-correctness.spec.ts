import { BadRequestException } from '@nestjs/common';
import { ConnectorsService } from './connectors.service';

describe('Drive Sync Correctness Seam (Phase F0)', () => {
  let service: ConnectorsService;
  let mockDb: any;
  let mockDriveConnector: any;
  let mockRegistry: any;
  let mockIndexingService: any;
  let mockTokenCrypto: any;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    };
    mockDriveConnector = {
      isConfigured: jest.fn().mockReturnValue(true),
      createAuthenticatedClient: jest.fn().mockReturnValue({ on: jest.fn() }),
    };
    mockTokenCrypto = {
      decryptJson: jest.fn().mockReturnValue({ access_token: 'valid' }),
    };
    mockRegistry = {
      get: jest.fn().mockReturnValue({
        listAssets: jest.fn(),
      }),
    };
    mockIndexingService = {
      enqueueAsset: jest.fn().mockResolvedValue(undefined),
    };

    service = new ConnectorsService(
      mockDb,
      mockTokenCrypto,
      mockDriveConnector,
      mockRegistry,
      mockIndexingService,
    );
  });

  it('rejects sync with BadRequestException when no folders are selected', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ provider: 'google_drive', selected_folders: [] }],
    });

    await expect(service.syncAccount('acc_1', 'user_1')).rejects.toThrow(BadRequestException);
    expect(mockIndexingService.enqueueAsset).not.toHaveBeenCalled();
  });

  it('skips re-indexing when checksum matches even if modifiedTime ticks', async () => {
    mockDb.query
      // 1. Account info
      .mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', selected_folders: [{ id: 'f_1', name: 'Videos' }] }],
      })
      // 2. getAuthContext
      .mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', encrypted_tokens: 'encrypted' }],
      })
      // 3. Existing media_assets row for file
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'asset_1',
            status: 'indexed',
            drive_modified_time: new Date('2026-01-01T00:00:00Z'),
            checksum: 'md5_same_checksum',
            original_filename: 'interview.mp4',
            original_path: 'f_1',
          },
        ],
      })
      // 4. Missing assets query
      .mockResolvedValueOnce({
        rows: [],
      })
      // 5. Update last_synced_at
      .mockResolvedValueOnce({ rows: [] });

    mockRegistry.get().listAssets.mockResolvedValueOnce({
      assets: [
        {
          remoteId: 'drive_file_1',
          name: 'interview.mp4',
          size: 1000,
          modifiedTime: new Date('2026-06-01T00:00:00Z'), // newer modified time!
          md5Checksum: 'md5_same_checksum',
          path: 'f_1',
        },
      ],
    });

    const result = await service.syncAccount('acc_1', 'user_1');

    expect(result.discovered).toBe(1);
    expect(result.existing).toBe(1);
    expect(result.queued).toBe(0);
    expect(mockIndexingService.enqueueAsset).not.toHaveBeenCalled();
  });

  it('updates filename/path when asset is renamed/moved without re-indexing', async () => {
    mockDb.query
      // 1. Account info
      .mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', selected_folders: [{ id: 'f_1', name: 'Videos' }] }],
      })
      // 2. getAuthContext
      .mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', encrypted_tokens: 'encrypted' }],
      })
      // 3. Existing media_assets row for file
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'asset_1',
            status: 'indexed',
            drive_modified_time: new Date('2026-01-01T00:00:00Z'),
            checksum: 'md5_same_checksum',
            original_filename: 'old_name.mp4',
            original_path: 'f_1',
          },
        ],
      })
      // 4. UPDATE media_assets (renamed)
      .mockResolvedValueOnce({ rows: [] })
      // 5. Missing assets query
      .mockResolvedValueOnce({
        rows: [],
      })
      // 6. Update last_synced_at
      .mockResolvedValueOnce({ rows: [] });

    mockRegistry.get().listAssets.mockResolvedValueOnce({
      assets: [
        {
          remoteId: 'drive_file_1',
          name: 'renamed_interview.mp4',
          size: 1000,
          modifiedTime: new Date('2026-01-01T00:00:00Z'),
          md5Checksum: 'md5_same_checksum',
          path: 'f_1',
        },
      ],
    });

    const result = await service.syncAccount('acc_1', 'user_1');

    expect(result.discovered).toBe(1);
    expect(result.existing).toBe(1);
    expect(result.queued).toBe(0);
    expect(mockIndexingService.enqueueAsset).not.toHaveBeenCalled();

    // Verify DB update for rename was executed
    const updateCall = mockDb.query.mock.calls.find((call: any[]) =>
      call[0]?.includes('UPDATE media_assets') && call[0]?.includes('original_filename = $1'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe('renamed_interview.mp4');
  });

  it('marks deleted Drive assets as offline using external_file_id without ANY(original_path)', async () => {
    mockDb.query
      // 1. Account info
      .mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', selected_folders: [{ id: 'f_1', name: 'Videos' }] }],
      })
      // 2. getAuthContext
      .mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', encrypted_tokens: 'encrypted' }],
      })
      // 3. Existing check for discovered file
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'asset_active',
            status: 'indexed',
            drive_modified_time: new Date('2026-01-01T00:00:00Z'),
            checksum: 'chk_1',
            original_filename: 'active.mp4',
            original_path: 'f_1',
          },
        ],
      })
      // 4. Missing assets query (should return assets in this account)
      .mockResolvedValueOnce({
        rows: [
          { id: 'asset_active', external_file_id: 'drive_active' },
          { id: 'asset_deleted', external_file_id: 'drive_deleted' },
        ],
      })
      // 5. UPDATE media_assets SET availability = 'offline'
      .mockResolvedValueOnce({ rows: [] })
      // 6. Update last_synced_at
      .mockResolvedValueOnce({ rows: [] });

    mockRegistry.get().listAssets.mockResolvedValueOnce({
      assets: [
        {
          remoteId: 'drive_active',
          name: 'active.mp4',
          size: 1000,
          modifiedTime: new Date('2026-01-01T00:00:00Z'),
          md5Checksum: 'chk_1',
          path: 'f_1',
        },
      ],
    });

    const result = await service.syncAccount('acc_1', 'user_1');

    expect(result.archived).toBe(1);

    // Verify offline update was made for asset_deleted
    const offlineCall = mockDb.query.mock.calls.find(
      (call: any[]) =>
        call[0]?.includes("availability = 'offline'") && call[1]?.[0] === 'asset_deleted',
    );
    expect(offlineCall).toBeDefined();

    // Verify the query did not use the broken ANY(original_path) clause
    const missingAssetsQuery = mockDb.query.mock.calls.find((call: any[]) =>
      call[0]?.includes('FROM media_assets') && call[0]?.includes("availability != 'offline'"),
    );
    expect(missingAssetsQuery[0]).not.toContain('original_path = ANY');
  });
});
