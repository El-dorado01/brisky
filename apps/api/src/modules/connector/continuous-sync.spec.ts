import { ConnectorsService } from './connectors.service';
import { ConnectorRegistry } from './connector.registry';
import { TokenCryptoService } from './token-crypto.service';
import { IndexingService } from '../queue/indexing.service';

describe('ConnectorsService Continuous Sync (Phase F6 Seams 1 & 2)', () => {
  let service: ConnectorsService;
  let mockDb: any;
  let mockRegistry: jest.Mocked<ConnectorRegistry>;
  let mockCrypto: jest.Mocked<TokenCryptoService>;
  let mockIndexingService: jest.Mocked<IndexingService>;
  let mockConnector: any;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    };

    const mockClient = {
      on: jest.fn(),
    };

    mockConnector = {
      provider: 'google_drive',
      capabilities: {
        can_read: true,
        can_write: true,
        can_stream: true,
        can_range_read: true,
        supports_webhooks: true,
        supports_signed_urls: false,
        supports_large_files: true,
      },
      listAssets: jest.fn().mockResolvedValue({ assets: [], nextCursor: undefined }),
      getStartCursor: jest.fn().mockResolvedValue('start_cursor_100'),
      getChanges: jest.fn().mockResolvedValue({
        added: [],
        modified: [],
        deleted: [],
        newCursor: 'new_cursor_101',
      }),
      createAuthenticatedClient: jest.fn().mockReturnValue(mockClient),
    };

    mockRegistry = {
      get: jest.fn().mockReturnValue(mockConnector),
      has: jest.fn().mockReturnValue(true),
    } as any;

    mockCrypto = {
      encrypt: jest.fn().mockReturnValue('encrypted_tokens'),
      decrypt: jest.fn().mockReturnValue(JSON.stringify({ access_token: 'fake_tok' })),
      encryptJson: jest.fn().mockReturnValue('encrypted_tokens'),
      decryptJson: jest.fn().mockReturnValue({ access_token: 'fake_tok' }),
    } as any;

    mockIndexingService = {
      enqueueAsset: jest.fn().mockResolvedValue('job_id_1'),
    } as any;

    service = new ConnectorsService(
      mockDb,
      mockCrypto,
      mockConnector,
      mockRegistry,
      mockIndexingService,
    );
  });

  describe('syncAccount cursor initialization', () => {
    it('establishes and saves sync_cursor on initial full sync', async () => {
      // 1. SELECT connector_accounts
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          provider: 'google_drive',
          selected_folders: [{ id: 'f_1', name: 'Videos' }],
          sync_cursor: null,
        }],
      });
      // 2. getAuthContext SELECT
      mockDb.query.mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', encrypted_tokens: 'enc' }],
      });
      // 3. listAssets returns 0 files
      mockConnector.listAssets.mockResolvedValueOnce({ assets: [] });
      // 4. SELECT allAccountAssets
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // 5. UPDATE connector_accounts (status, last_synced_at, sync_cursor)
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await service.syncAccount('acc_1', 'user_1');

      expect(mockConnector.getStartCursor).toHaveBeenCalled();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE connector_accounts'),
        expect.arrayContaining(['start_cursor_100', 'acc_1']),
      );
    });
  });

  describe('syncAccountChanges', () => {
    it('handles added video by creating media_asset and enqueuing with priority: batch', async () => {
      // 1. SELECT connector_accounts
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          provider: 'google_drive',
          selected_folders: [{ id: 'f_1', name: 'Videos' }],
          sync_cursor: 'cursor_100',
        }],
      });
      // 2. getAuthContext
      mockDb.query.mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', encrypted_tokens: 'enc' }],
      });

      // Connector returns 1 added video
      mockConnector.getChanges.mockResolvedValueOnce({
        added: [{
          remoteId: 'drive_vid_new',
          name: 'new_lecture.mp4',
          mimeType: 'video/mp4',
          size: 104857600,
          md5Checksum: 'chk_new_123',
          modifiedTime: new Date(),
        }],
        modified: [],
        deleted: [],
        newCursor: 'cursor_101',
      });

      // Existing asset check returns not found
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // INSERT into media_assets
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // UPDATE connector_accounts with newCursor
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const res = await service.syncAccountChanges('acc_1', 'user_1');

      expect(res.addedCount).toBe(1);
      expect(mockIndexingService.enqueueAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          originalFilename: 'new_lecture.mp4',
          checksum: 'chk_new_123',
          priority: 'batch',
        }),
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE connector_accounts'),
        expect.arrayContaining(['cursor_101', 'acc_1']),
      );
    });

    it('handles modified video with new checksum by re-enqueuing with forceReindex: true, priority: batch', async () => {
      // 1. SELECT connector_accounts
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          provider: 'google_drive',
          selected_folders: [{ id: 'f_1', name: 'Videos' }],
          sync_cursor: 'cursor_100',
        }],
      });
      // 2. getAuthContext
      mockDb.query.mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', encrypted_tokens: 'enc' }],
      });

      // Connector returns modified video
      mockConnector.getChanges.mockResolvedValueOnce({
        added: [],
        modified: [{
          remoteId: 'drive_vid_mod',
          name: 'edited_lecture.mp4',
          mimeType: 'video/mp4',
          size: 209715200,
          md5Checksum: 'chk_modified_456',
          modifiedTime: new Date(),
        }],
        deleted: [],
        newCursor: 'cursor_101',
      });

      // Existing asset check returns existing row with OLD checksum
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'asset_mod_1',
          checksum: 'old_checksum_000',
          original_filename: 'edited_lecture.mp4',
          original_path: '',
        }],
      });
      // DELETE stale processing units
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // UPDATE media_assets status = 'queued' + index_version
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // UPDATE connector_accounts with newCursor
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const res = await service.syncAccountChanges('acc_1', 'user_1');

      expect(res.modifiedCount).toBe(1);
      expect(mockIndexingService.enqueueAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          assetId: 'asset_mod_1',
          checksum: 'chk_modified_456',
          forceReindex: true,
          priority: 'batch',
        }),
      );
    });

    it('handles renamed video without re-indexing or losing intelligence', async () => {
      // 1. SELECT connector_accounts
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          provider: 'google_drive',
          selected_folders: [{ id: 'f_1', name: 'Videos' }],
          sync_cursor: 'cursor_100',
        }],
      });
      // 2. getAuthContext
      mockDb.query.mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', encrypted_tokens: 'enc' }],
      });

      // Connector returns modified with same checksum, new name
      mockConnector.getChanges.mockResolvedValueOnce({
        added: [],
        modified: [{
          remoteId: 'drive_vid_renamed',
          name: 'renamed_lecture.mp4',
          mimeType: 'video/mp4',
          size: 104857600,
          md5Checksum: 'same_checksum_123',
          modifiedTime: new Date(),
        }],
        deleted: [],
        newCursor: 'cursor_101',
      });

      // Existing asset check returns row with SAME checksum
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'asset_renamed_1',
          checksum: 'same_checksum_123',
          original_filename: 'old_lecture.mp4',
          original_path: '',
        }],
      });
      // UPDATE media_assets set original_filename = 'renamed_lecture.mp4'
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // UPDATE connector_accounts
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const res = await service.syncAccountChanges('acc_1', 'user_1');

      expect(res.renamedCount).toBe(1);
      expect(mockIndexingService.enqueueAsset).not.toHaveBeenCalled();
    });

    it('handles deleted video by marking availability = offline', async () => {
      // 1. SELECT connector_accounts
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          provider: 'google_drive',
          selected_folders: [{ id: 'f_1', name: 'Videos' }],
          sync_cursor: 'cursor_100',
        }],
      });
      // 2. getAuthContext
      mockDb.query.mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', encrypted_tokens: 'enc' }],
      });

      // Connector returns deleted fileId
      mockConnector.getChanges.mockResolvedValueOnce({
        added: [],
        modified: [],
        deleted: ['drive_vid_deleted'],
        newCursor: 'cursor_101',
      });

      // UPDATE media_assets SET availability = 'offline'
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // UPDATE connector_accounts
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const res = await service.syncAccountChanges('acc_1', 'user_1');

      expect(res.deletedCount).toBe(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("availability = 'offline'"),
        expect.arrayContaining(['drive_vid_deleted', 'acc_1', 'user_1']),
      );
    });

    it('handles token revocation by setting account status = error', async () => {
      // 1. SELECT connector_accounts
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          provider: 'google_drive',
          selected_folders: [{ id: 'f_1', name: 'Videos' }],
          sync_cursor: 'cursor_100',
        }],
      });
      // 2. getAuthContext throws invalid_grant
      mockDb.query.mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', encrypted_tokens: 'enc' }],
      });

      mockConnector.getChanges.mockRejectedValueOnce(new Error('invalid_grant: Token has been expired or revoked.'));
      // UPDATE connector_accounts SET status = 'error'
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.syncAccountChanges('acc_1', 'user_1')).rejects.toThrow('invalid_grant');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'error'"),
        expect.arrayContaining([expect.stringContaining('invalid_grant'), 'acc_1']),
      );
    });

    it('discovers and queues newly added videos arriving via changes.modified within selected folders', async () => {
      // 1. SELECT connector_accounts with selected_folders = [{ id: 'f_1' }]
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          provider: 'google_drive',
          selected_folders: [{ id: 'f_1', name: 'Videos' }],
          sync_cursor: 'cursor_100',
        }],
      });
      // 2. getAuthContext
      mockDb.query.mockResolvedValueOnce({
        rows: [{ provider: 'google_drive', encrypted_tokens: 'enc' }],
      });

      // Drive changes.list returns new video under modified with parent folder 'f_1'
      mockConnector.getChanges.mockResolvedValueOnce({
        added: [],
        modified: [{
          remoteId: 'drive_vid_fresh',
          name: 'fresh_recording.mp4',
          mimeType: 'video/mp4',
          size: 104857600,
          md5Checksum: 'chk_fresh_999',
          path: 'f_1',
          modifiedTime: new Date(),
        }],
        deleted: [],
        newCursor: 'cursor_101',
      });

      // Existing check returns not found
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // INSERT into media_assets
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // UPDATE connector_accounts
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const res = await service.syncAccountChanges('acc_1', 'user_1');

      expect(res.addedCount).toBe(1);
      expect(mockIndexingService.enqueueAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          originalFilename: 'fresh_recording.mp4',
          checksum: 'chk_fresh_999',
          priority: 'batch',
        }),
      );
    });
  });
});
