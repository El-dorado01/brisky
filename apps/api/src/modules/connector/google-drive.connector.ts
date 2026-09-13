import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, drive_v3 } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import {
  MediaConnector,
  ConnectorAsset,
  ConnectorFolder,
  ListAssetsOptions,
  ConnectorChanges,
} from './media-connector.interface';

export type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export interface GoogleDriveTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
}

@Injectable()
export class GoogleDriveConnector implements MediaConnector<OAuth2Client> {
  private readonly logger = new Logger(GoogleDriveConnector.name);
  readonly provider = 'google_drive';

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET', '');
    this.redirectUri = this.configService.get<string>(
      'GOOGLE_REDIRECT_URI',
      'http://localhost:3000/api/v1/connectors/google-drive/callback',
    );
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Exponential backoff retry helper specifically for Google Drive API rate limits (429) and transient errors (503).
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    initialDelayMs = 1000,
  ): Promise<T> {
    let attempt = 0;
    let delay = initialDelayMs;

    while (true) {
      try {
        return await operation();
      } catch (err: any) {
        attempt += 1;
        const status = err?.status || err?.code || err?.response?.status;
        const isRateLimit = status === 429 || String(err?.message || '').toLowerCase().includes('rate limit');
        const isTransient = status === 503 || status === 500;

        if (attempt >= maxRetries || (!isRateLimit && !isTransient)) {
          throw err;
        }

        const jitter = Math.floor(Math.random() * 50);
        this.logger.warn(
          `[GoogleDriveConnector] API call failed with status ${status} (attempt ${attempt}/${maxRetries}). Retrying in ${delay + jitter}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        delay *= 2;
      }
    }
  }

  createOAuthClient(): OAuth2Client {
    return new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectUri);
  }

  createAuthenticatedClient(tokens: GoogleDriveTokens): OAuth2Client {
    const client = this.createOAuthClient();
    client.setCredentials(tokens);
    return client;
  }

  getAuthUrl(state?: string): string {
    const client = this.createOAuthClient();
    const scopes = [
      // Read-only access to user's existing media files (guarantees originals can never be modified)
      'https://www.googleapis.com/auth/drive.readonly',
      // Write access exclusively to files and folders created by Brisky (Brisky/proxies, previews, clips)
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ];

    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state,
    });
  }

  async exchangeCodeForTokens(code: string): Promise<GoogleDriveTokens> {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);
    return tokens;
  }

  async getUserInfo(authClient: OAuth2Client): Promise<{ email: string; name: string }> {
    const oauth2 = google.oauth2({ version: 'v2', auth: authClient });
    const res = await oauth2.userinfo.get();
    return {
      email: res.data.email || 'unknown@google.com',
      name: res.data.name || res.data.email || 'Google Drive User',
    };
  }

  async listFolders(authClient: OAuth2Client, parentFolderId = 'root'): Promise<ConnectorFolder[]> {
    const drive = google.drive({ version: 'v3', auth: authClient });
    let query = "mimeType = 'application/vnd.google-apps.folder' and trashed = false and name != 'Brisky'";
    if (parentFolderId === 'root') {
      query += " and 'root' in parents";
    } else {
      query += ` and '${parentFolderId}' in parents`;
    }

    const res = await this.withRetry(() =>
      drive.files.list({
        q: query,
        fields: 'files(id, name, parents)',
        pageSize: 100,
        orderBy: 'name',
      }),
    );

    return (res.data.files || []).map((f) => ({
      id: f.id!,
      name: f.name || 'Untitled Folder',
      parentId: f.parents?.[0] || undefined,
    }));
  }

  async listAssets(
    authClient: OAuth2Client,
    options?: ListAssetsOptions,
  ): Promise<{ assets: ConnectorAsset[]; nextCursor?: string }> {
    const drive = google.drive({ version: 'v3', auth: authClient });
    const folderIds = options?.folderIds || [];

    let q = "trashed = false and mimeType contains 'video/'";
    if (folderIds.length > 0) {
      const folderQueries = folderIds.map((id) => `'${id}' in parents`).join(' or ');
      q = `trashed = false and mimeType contains 'video/' and (${folderQueries})`;
    }

    const allAssets: ConnectorAsset[] = [];
    let pageToken = options?.cursor;
    let nextPageToken: string | undefined;

    do {
      const res: drive_v3.Schema$FileList = (
        await this.withRetry(() =>
          drive.files.list({
            q,
            fields:
              'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, md5Checksum, parents)',
            pageSize: options?.pageSize || 100,
            pageToken,
          }),
        )
      ).data;

      const pageAssets: ConnectorAsset[] = (res.files || [])
        .filter(
          (f) =>
            f.id &&
            f.name &&
            !f.name.endsWith('_proxy.mp4') &&
            !f.name.endsWith('_thumb.jpg'),
        )
        .map((f) => ({
          remoteId: f.id!,
          name: f.name!,
          mimeType: f.mimeType || 'video/mp4',
          size: Number(f.size || 0),
          modifiedTime: f.modifiedTime ? new Date(f.modifiedTime) : undefined,
          webViewLink: f.webViewLink || undefined,
          md5Checksum: f.md5Checksum || undefined,
          path: f.parents?.[0] || undefined,
        }));

      allAssets.push(...pageAssets);
      nextPageToken = res.nextPageToken || undefined;
      pageToken = nextPageToken;

      // If specific cursor was requested by caller, return single page
      if (options?.cursor) {
        break;
      }
    } while (pageToken && allAssets.length < 1000);

    return {
      assets: allAssets,
      nextCursor: nextPageToken,
    };
  }

  async getAsset(authClient: OAuth2Client, remoteId: string): Promise<ConnectorAsset> {
    const drive = google.drive({ version: 'v3', auth: authClient });
    const res = await this.withRetry(() =>
      drive.files.get({
        fileId: remoteId,
        fields: 'id, name, mimeType, size, modifiedTime, webViewLink, md5Checksum, parents',
      }),
    );

    const f = res.data;
    if (!f.id || !f.name) {
      throw new Error(`Google Drive file ${remoteId} not found`);
    }

    return {
      remoteId: f.id,
      name: f.name,
      mimeType: f.mimeType || 'video/mp4',
      size: Number(f.size || 0),
      modifiedTime: f.modifiedTime ? new Date(f.modifiedTime) : undefined,
      webViewLink: f.webViewLink || undefined,
      md5Checksum: f.md5Checksum || undefined,
      path: f.parents?.[0] || undefined,
    };
  }

  async getMetadata(authClient: OAuth2Client, remoteId: string): Promise<Record<string, any>> {
    const asset = await this.getAsset(authClient, remoteId);
    return { ...asset };
  }

  async downloadAsset(
    authClient: OAuth2Client,
    remoteId: string,
    destPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const drive = google.drive({ version: 'v3', auth: authClient });

    const meta = await this.withRetry(() =>
      drive.files.get({
        fileId: remoteId,
        fields: 'size, name',
      }),
    );
    const totalBytes = Number(meta.data.size || 0);

    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    const res = await this.withRetry(() =>
      drive.files.get(
        { fileId: remoteId, alt: 'media' },
        { responseType: 'stream' },
      ),
    );

    let downloadedBytes = 0;
    let lastProgress = 0;

    await new Promise<void>((resolve, reject) => {
      const writeStream = fs.createWriteStream(destPath);

      (res.data as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0 && onProgress) {
          const pct = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
          if (pct - lastProgress >= 5 || pct === 100) {
            lastProgress = pct;
            onProgress(pct);
          }
        }
      });

      (res.data as NodeJS.ReadableStream).on('error', (err) => {
        writeStream.destroy();
        reject(err);
      });

      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);

      (res.data as NodeJS.ReadableStream).pipe(writeStream);
    });

    this.logger.log(
      `[GoogleDriveConnector] Downloaded remoteId=${remoteId} (${(downloadedBytes / (1024 * 1024)).toFixed(2)} MB) to scratch: ${destPath}`,
    );
  }

  async getByteRange(
    authClient: OAuth2Client,
    remoteId: string,
    start: number,
    length?: number,
  ): Promise<NodeJS.ReadableStream> {
    const drive = google.drive({ version: 'v3', auth: authClient });
    const endHeader = length !== undefined ? `${start + length - 1}` : '';
    const rangeHeader = `bytes=${start}-${endHeader}`;

    const res = await drive.files.get(
      { fileId: remoteId, alt: 'media' },
      {
        responseType: 'stream',
        headers: { Range: rangeHeader },
      },
    );

    return res.data as NodeJS.ReadableStream;
  }

  async deleteAsset(authClient: OAuth2Client, remoteId: string): Promise<boolean> {
    const drive = google.drive({ version: 'v3', auth: authClient });
    await drive.files.delete({ fileId: remoteId });
    return true;
  }

  async createFolder(
    authClient: OAuth2Client,
    name: string,
    parentFolderId = 'root',
  ): Promise<ConnectorFolder> {
    const drive = google.drive({ version: 'v3', auth: authClient });
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentFolderId ? [parentFolderId] : undefined,
      },
      fields: 'id, name, parents',
    });
    return {
      id: res.data.id!,
      name: res.data.name || name,
      parentId: res.data.parents?.[0] || undefined,
    };
  }

  async uploadAsset(
    authClient: OAuth2Client,
    remoteFolderId: string,
    sourcePath: string,
    filename: string,
  ): Promise<ConnectorAsset> {
    const drive = google.drive({ version: 'v3', auth: authClient });
    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: remoteFolderId ? [remoteFolderId] : undefined,
      },
      media: {
        body: fs.createReadStream(sourcePath),
      },
      fields: 'id, name, mimeType, size, modifiedTime, webViewLink, md5Checksum, parents',
    });
    const f = res.data;
    return {
      remoteId: f.id!,
      name: f.name!,
      mimeType: f.mimeType || 'video/mp4',
      size: Number(f.size || 0),
      modifiedTime: f.modifiedTime ? new Date(f.modifiedTime) : undefined,
      webViewLink: f.webViewLink || undefined,
      md5Checksum: f.md5Checksum || undefined,
      path: f.parents?.[0] || undefined,
    };
  }

  async watchChanges(
    authClient: OAuth2Client,
    callbackUrl: string,
  ): Promise<{ channelId: string; resourceId: string }> {
    const drive = google.drive({ version: 'v3', auth: authClient });
    const startPageTokenRes = await drive.changes.getStartPageToken();
    const channelId = `brisky-watch-${Date.now()}`;
    const res = await drive.changes.watch({
      pageToken: startPageTokenRes.data.startPageToken || '1',
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: callbackUrl,
      },
    });
    return {
      channelId,
      resourceId: res.data.resourceId || '',
    };
  }

  async getChanges(authClient: OAuth2Client, cursor: string): Promise<ConnectorChanges> {
    const drive = google.drive({ version: 'v3', auth: authClient });
    const res = await drive.changes.list({
      pageToken: cursor,
      fields:
        'nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, size, modifiedTime, webViewLink, md5Checksum, trashed))',
    });

    const added: ConnectorAsset[] = [];
    const modified: ConnectorAsset[] = [];
    const deleted: string[] = [];

    for (const change of res.data.changes || []) {
      if (change.removed || change.file?.trashed) {
        if (change.fileId) deleted.push(change.fileId);
      } else if (change.file && change.file.mimeType?.startsWith('video/')) {
        const asset: ConnectorAsset = {
          remoteId: change.file.id!,
          name: change.file.name!,
          mimeType: change.file.mimeType || 'video/mp4',
          size: Number(change.file.size || 0),
          modifiedTime: change.file.modifiedTime ? new Date(change.file.modifiedTime) : undefined,
          webViewLink: change.file.webViewLink || undefined,
          md5Checksum: change.file.md5Checksum || undefined,
        };
        modified.push(asset);
      }
    }

    return {
      added,
      modified,
      deleted,
      newCursor: res.data.newStartPageToken || res.data.nextPageToken || undefined,
    };
  }

  /**
   * Section 5 (03-media-storage-brief.md):
   * Ensures the dedicated "Brisky/" folder hierarchy exists in the user's Google Drive:
   * Brisky/
   *  ├── previews/
   *  ├── proxies/
   *  ├── clips/
   *  └── exports/
   * Original user media is never modified; generated assets live exclusively here.
   */
  async ensureBriskyStructure(authClient: OAuth2Client): Promise<{
    rootId: string;
    previewsId: string;
    proxiesId: string;
    clipsId: string;
    exportsId: string;
  }> {
    const drive = google.drive({ version: 'v3', auth: authClient });

    const findOrCreateFolder = async (name: string, parentId?: string): Promise<string> => {
      let q = `mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false`;
      if (parentId) {
        q += ` and '${parentId}' in parents`;
      } else {
        q += ` and 'root' in parents`;
      }

      const res = await this.withRetry(() =>
        drive.files.list({
          q,
          fields: 'files(id, name)',
          pageSize: 1,
        }),
      );

      if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id!;
      }

      const created = await this.createFolder(authClient, name, parentId || 'root');
      return created.id;
    };

    const rootId = await findOrCreateFolder('Brisky');
    const [previewsId, proxiesId, clipsId, exportsId] = await Promise.all([
      findOrCreateFolder('previews', rootId),
      findOrCreateFolder('proxies', rootId),
      findOrCreateFolder('clips', rootId),
      findOrCreateFolder('exports', rootId),
    ]);

    return { rootId, previewsId, proxiesId, clipsId, exportsId };
  }
}

