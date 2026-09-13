import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TokenCryptoService } from './token-crypto.service';
import { GoogleDriveConnector, GoogleDriveTokens, OAuth2Client } from './google-drive.connector';
import { IndexingService } from '../queue/indexing.service';
import { ConnectorRegistry } from './connector.registry';
import { ConnectorFolder } from './media-connector.interface';
import { randomBytes } from 'crypto';

export interface ConnectorAccountSummary {
  id: string;
  provider: string;
  email: string;
  accountName: string;
  selectedFolders: Array<{ id: string; name: string }>;
  status: string;
  lastSyncedAt?: string;
  createdAt: string;
}

export interface SyncResult {
  discovered: number;
  queued: number;
  existing: number;
  archived: number;
}

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly driveConnector: GoogleDriveConnector,
    private readonly connectorRegistry: ConnectorRegistry,
    private readonly indexingService: IndexingService,
  ) {}

  getGoogleAuthUrl(userId: string): string {
    if (!this.driveConnector.isConfigured()) {
      throw new BadRequestException('Google Drive OAuth credentials are not configured in .env');
    }
    const state = JSON.stringify({ userId, nonce: randomBytes(8).toString('hex') });
    return this.driveConnector.getAuthUrl(Buffer.from(state).toString('base64'));
  }

  async handleGoogleCallback(code: string, stateEncoded?: string): Promise<{ accountId: string; email: string }> {
    let userId: string | undefined;
    if (stateEncoded) {
      try {
        const parsed = JSON.parse(Buffer.from(stateEncoded, 'base64').toString('utf8'));
        userId = parsed.userId;
      } catch {
        this.logger.warn('Failed to parse OAuth state parameter');
      }
    }

    if (!userId) {
      const userRes = await this.db.query<{ id: string }>('SELECT id FROM users LIMIT 1');
      userId = userRes.rows[0]?.id;
    }

    if (!userId) {
      throw new BadRequestException('No authenticated user found for OAuth link');
    }

    const tokens = await this.driveConnector.exchangeCodeForTokens(code);
    const authClient = this.driveConnector.createAuthenticatedClient(tokens);
    const userInfo = await this.driveConnector.getUserInfo(authClient);

    const encryptedTokens = this.tokenCrypto.encryptJson(tokens);

    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM connector_accounts WHERE user_id = $1 AND provider = 'google_drive' AND email = $2`,
      [userId, userInfo.email],
    );

    let accountId: string;
    if (existing.rows.length > 0) {
      accountId = existing.rows[0].id;
      await this.db.query(
        `UPDATE connector_accounts
         SET encrypted_tokens = $1, account_name = $2, status = 'connected', updated_at = NOW()
         WHERE id = $3`,
        [encryptedTokens, userInfo.name, accountId],
      );
      this.logger.log(`Updated Google Drive connector account ${accountId} (${userInfo.email})`);
    } else {
      const insert = await this.db.query<{ id: string }>(
        `INSERT INTO connector_accounts (
           user_id, provider, email, account_name, encrypted_tokens, status
         ) VALUES ($1, 'google_drive', $2, $3, $4, 'connected')
         RETURNING id`,
        [userId, userInfo.email, userInfo.name, encryptedTokens],
      );
      accountId = insert.rows[0].id;
      this.logger.log(`Created new Google Drive connector account ${accountId} (${userInfo.email})`);
    }

    return { accountId, email: userInfo.email };
  }

  async listAccounts(userId: string): Promise<ConnectorAccountSummary[]> {
    const res = await this.db.query(
      `SELECT id, provider, email, account_name, selected_folders, status, last_synced_at, created_at
       FROM connector_accounts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );

    return res.rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      email: row.email,
      accountName: row.account_name,
      selectedFolders: Array.isArray(row.selected_folders) ? row.selected_folders : [],
      status: row.status,
      lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : undefined,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async deleteAccount(accountId: string, userId: string): Promise<boolean> {
    const res = await this.db.query(
      `DELETE FROM connector_accounts WHERE id = $1 AND user_id = $2 RETURNING id`,
      [accountId, userId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Connector account ${accountId} not found`);
    }
    this.logger.log(`Deleted connector account ${accountId} for user ${userId}`);
    return true;
  }

  /**
   * Generic provider-agnostic authentication context resolver.
   * Given an accountId and userId, retrieves decrypted credentials and creates
   * an authenticated client for that provider.
   */
  async getAuthContext(accountId: string, userId: string): Promise<any> {
    const res = await this.db.query<{ provider: string; encrypted_tokens: string }>(
      `SELECT provider, encrypted_tokens FROM connector_accounts WHERE id = $1 AND user_id = $2`,
      [accountId, userId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Connector account ${accountId} not found`);
    }

    const { provider, encrypted_tokens } = res.rows[0];

    if (provider === 'google_drive') {
      const tokens = this.tokenCrypto.decryptJson<GoogleDriveTokens>(encrypted_tokens);
      const client = this.driveConnector.createAuthenticatedClient(tokens);

      client.on('tokens', async (newTokens: any) => {
        const merged = { ...tokens, ...newTokens };
        const encrypted = this.tokenCrypto.encryptJson(merged);
        await this.db.query(
          `UPDATE connector_accounts SET encrypted_tokens = $1, updated_at = NOW() WHERE id = $2`,
          [encrypted, accountId],
        );
        this.logger.debug(`Refreshed OAuth tokens updated for account ${accountId}`);
      });

      return client;
    }

    // Generic fallback for future providers (Dropbox, OneDrive, S3)
    return this.tokenCrypto.decryptJson(encrypted_tokens);
  }

  async listFolders(accountId: string, userId: string, parentFolderId = 'root'): Promise<ConnectorFolder[]> {
    const res = await this.db.query<{ provider: string }>(
      `SELECT provider FROM connector_accounts WHERE id = $1 AND user_id = $2`,
      [accountId, userId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Connector account ${accountId} not found`);
    }

    const connector = this.connectorRegistry.get(res.rows[0].provider);
    if (!connector.listFolders) {
      return [];
    }

    const auth = await this.getAuthContext(accountId, userId);
    return connector.listFolders(auth, parentFolderId);
  }

  async setSelectedFolders(
    accountId: string,
    userId: string,
    folders: Array<{ id: string; name: string }>,
  ): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE connector_accounts
       SET selected_folders = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id`,
      [JSON.stringify(folders), accountId, userId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Connector account ${accountId} not found`);
    }

    this.logger.log(
      `Updated selected folders for account ${accountId}: ${folders.map((f) => f.name).join(', ')}`,
    );
    return true;
  }

  /**
   * Universal provider-agnostic account sync.
   * Calls connector.listAssets() through MediaConnector interface,
   * detects additions, modifications, and deletions, and enqueues indexing.
   */
  async syncAccount(accountId: string, userId: string): Promise<SyncResult> {
    const accRes = await this.db.query<{
      provider: string;
      selected_folders: Array<{ id: string; name: string }>;
    }>(
      `SELECT provider, selected_folders FROM connector_accounts WHERE id = $1 AND user_id = $2`,
      [accountId, userId],
    );

    if (accRes.rows.length === 0) {
      throw new NotFoundException(`Connector account ${accountId} not found`);
    }

    const provider = accRes.rows[0].provider;
    const connector = this.connectorRegistry.get(provider);
    const auth = await this.getAuthContext(accountId, userId);

    const selectedFolders = Array.isArray(accRes.rows[0].selected_folders)
      ? accRes.rows[0].selected_folders
      : [];
    const folderIds = selectedFolders.map((f) => f.id);

    const { assets: discoveredFiles } = await connector.listAssets(auth, { folderIds });

    this.logger.log(
      `[MediaConnector: ${provider}] Sync account ${accountId}: discovered ${discoveredFiles.length} file(s)`,
    );

    let queuedCount = 0;
    let existingCount = 0;
    let archivedCount = 0;

    const seenRemoteIds = new Set<string>();

    for (const file of discoveredFiles) {
      seenRemoteIds.add(file.remoteId);

      const existing = await this.db.query<{
        id: string;
        status: string;
        drive_modified_time: Date | null;
        checksum: string;
      }>(
        `SELECT id, status, drive_modified_time, checksum FROM media_assets
         WHERE external_file_id = $1 AND user_id = $2
         LIMIT 1`,
        [file.remoteId, userId],
      );

      const fileModTime = file.modifiedTime || new Date();

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        const prevModTime = row.drive_modified_time ? new Date(row.drive_modified_time) : null;
        const isModified = prevModTime && fileModTime.getTime() > prevModTime.getTime() + 1000;

        if (isModified) {
          this.logger.log(`Asset ${file.name} (${file.remoteId}) modified in ${provider}; re-indexing`);
          await this.db.query(
            `UPDATE media_assets
             SET status = 'queued', stage = 'queued', progress = 0,
                 drive_modified_time = $1, file_size = $2, updated_at = NOW()
             WHERE id = $3`,
            [fileModTime, file.size, row.id],
          );
          await this.indexingService.enqueueAsset({
            assetId: row.id,
            userId,
            sourcePath: '',
            originalFilename: file.name,
            checksum: file.md5Checksum || `${provider}_${file.remoteId}_${fileModTime.getTime()}`,
            fileSize: file.size,
            sourceType: provider as any,
            provider,
            remoteId: file.remoteId,
            externalFileId: file.remoteId,
            connectorAccountId: accountId,
          });
          queuedCount++;
        } else {
          existingCount++;
        }
      } else {
        const assetId = `vid_${Date.now()}_${randomBytes(3).toString('hex')}`;
        const checksum = file.md5Checksum || `${provider}_${file.remoteId}_${fileModTime.getTime()}`;

        await this.db.query(
          `INSERT INTO media_assets (
             id, user_id, source_type, external_file_id, connector_account_id,
             original_filename, checksum, file_size, status, stage, progress,
             drive_modified_time, drive_web_view_link, original_path
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', 'queued', 0, $9, $10, $11)`,
          [
            assetId,
            userId,
            provider,
            file.remoteId,
            accountId,
            file.name,
            checksum,
            file.size,
            fileModTime,
            file.webViewLink || null,
            file.path || '',
          ],
        );

        await this.indexingService.enqueueAsset({
          assetId,
          userId,
          sourcePath: '',
          originalFilename: file.name,
          checksum,
          fileSize: file.size,
          sourceType: provider as any,
          provider,
          remoteId: file.remoteId,
          externalFileId: file.remoteId,
          connectorAccountId: accountId,
        });

        queuedCount++;
        this.logger.log(`Discovered & queued asset '${file.name}' from ${provider} -> ${assetId}`);
      }
    }

    // Mark missing assets as archived/offline within the monitored folders (or entire account if scanning root)
    let allAccountAssetsQuery = `SELECT id, external_file_id FROM media_assets
       WHERE connector_account_id = $1 AND user_id = $2 AND status = 'indexed' AND (availability IS NULL OR availability != 'offline')`;
    const queryParams: any[] = [accountId, userId];

    if (folderIds.length > 0) {
      allAccountAssetsQuery += ` AND original_path = ANY($3)`;
      queryParams.push(folderIds);
    }

    const allAccountAssets = await this.db.query<{ id: string; external_file_id: string }>(
      allAccountAssetsQuery,
      queryParams,
    );

    for (const asset of allAccountAssets.rows) {
      if (!seenRemoteIds.has(asset.external_file_id)) {
        await this.db.query(
          `UPDATE media_assets SET availability = 'offline', updated_at = NOW() WHERE id = $1`,
          [asset.id],
        );
        archivedCount++;
        this.logger.log(`Marked asset ${asset.id} offline (removed from ${provider})`);
      }
    }

    await this.db.query(
      `UPDATE connector_accounts SET last_synced_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [accountId],
    );

    return {
      discovered: discoveredFiles.length,
      queued: queuedCount,
      existing: existingCount,
      archived: archivedCount,
    };
  }
}
