import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IndexingProcessor } from './indexing.processor';
import { FactoryJobEnvelope } from './indexing.types';

describe('timestamp-correct cloud clip access', () => {
  let root: string;
  let processor: IndexingProcessor;
  let db: any;
  let ffmpeg: any;
  let connector: any;
  let sourceSize: number;
  let auth: jest.Mock;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-clip-access-'));
    sourceSize = Buffer.byteLength('synthetic full source');
    db = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM media_assets WHERE id =')) return { rows: [{ duration: 120, file_size: sourceSize }] };
      return { rows: [] };
    }) };
    ffmpeg = { extractClip: jest.fn(async (_source: string, output: string) => {
      fs.writeFileSync(output, 'synthetic decoded clip');
    }), generateThumbnail: jest.fn() };
    connector = { capabilities: { can_range_read: true }, getByteRange: jest.fn(),
      downloadAsset: jest.fn(async (_auth: unknown, _id: string, destination: string) => {
        fs.writeFileSync(destination, 'synthetic full source');
      }) };
    auth = jest.fn().mockResolvedValue({});
    processor = new IndexingProcessor(db, ffmpeg, {} as any, {} as any, {} as any,
      { get: (key: string, fallback: unknown) => key === 'STORAGE_ROOT' ? root : fallback } as any,
      { get: () => connector } as any, { getAuthContext: auth } as any, {} as any);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = () => {
    const data: FactoryJobEnvelope = { job_id: 'clip-job', job_type: 'extract_clip', priority: 'normal',
      asset_id: 'master', user_id: 'owner', segment: { start_s: 100, end_s: 115 },
      source: { provider: 'google_drive', remoteId: 'remote', connectorAccountId: 'account', originalFilename: 'master.mp4' } };
    return (processor as any).executeExtractClip({ id: 'bull-job' }, data);
  };
  it('decodes a complete allowed source at the requested absolute timestamps, without guessed byte slices', async () => {
    await run();
    expect(connector.getByteRange).not.toHaveBeenCalled();
    expect(connector.downloadAsset).toHaveBeenCalledTimes(1);
    expect(ffmpeg.extractClip).toHaveBeenCalledWith(expect.stringContaining('source.mp4'), expect.any(String), 100, 115);
    expect(db.query.mock.calls.some(([sql, args]: any[]) => sql.includes('access_mode') && args[0] === 'full_download')).toBe(true);
    expect(fs.existsSync(connector.downloadAsset.mock.calls[0][2])).toBe(false);
  });
  it('does not start a huge download or guessed range when a large master has no preview', async () => {
    sourceSize = 10 * 1024 * 1024 * 1024;
    await expect(run()).rejects.toThrow('seekable source access or a cached preview');
    expect(connector.getByteRange).not.toHaveBeenCalled();
    expect(connector.downloadAsset).not.toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
    expect(ffmpeg.extractClip).not.toHaveBeenCalled();
  });
  it.each([0, NaN, -1])('rejects invalid source size %s before transfer', async (size) => {
    sourceSize = size;
    await expect(run()).rejects.toThrow('known positive source size');
    expect(connector.downloadAsset).not.toHaveBeenCalled();
  });
  it('uses an available local preview even when the original master is huge', async () => {
    sourceSize = 10 * 1024 * 1024 * 1024;
    const preview = path.join(root, 'proxies', 'master.mp4');
    fs.writeFileSync(preview, 'preview');
    await run();
    expect(ffmpeg.extractClip).toHaveBeenCalledWith(preview, expect.any(String), 100, 115);
    expect(connector.downloadAsset).not.toHaveBeenCalled();
  });
  it('does not register a clip if the decoder returns without creating output', async () => {
    ffmpeg.extractClip.mockImplementation(async () => {});
    await expect(run()).rejects.toThrow('did not produce');
    expect(db.query.mock.calls.some(([sql]: any[]) => sql.includes('INSERT INTO media_assets'))).toBe(false);
  });
  it('does not decode a truncated or changed complete source', async () => {
    connector.downloadAsset.mockImplementation(async (_auth: unknown, _id: string, destination: string) => {
      fs.writeFileSync(destination, 'partial');
    });
    await expect(run()).rejects.toThrow('incomplete or changed');
    expect(ffmpeg.extractClip).not.toHaveBeenCalled();
    expect(db.query.mock.calls.some(([sql]: any[]) => sql.includes('INSERT INTO media_assets'))).toBe(false);
  });
  it('lets the decoder seek a large versioned source without staging the master', async () => {
    sourceSize = 10 * 1024 * 1024 * 1024;
    const validate = jest.fn().mockResolvedValue(undefined);
    connector.openReadSession = jest.fn().mockResolvedValue({ size: sourceSize, version: 'v1', read: jest.fn(), validate });
    await run();
    expect(ffmpeg.extractClip).toHaveBeenCalledWith(expect.stringMatching(/^http:\/\/127\.0\.0\.1:/), expect.any(String), 100, 115);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(connector.downloadAsset).not.toHaveBeenCalled();
    expect(connector.getByteRange).not.toHaveBeenCalled();
    expect(db.query.mock.calls.some(([sql, args]: any[]) => sql.includes('access_mode') && args[0] === 'range_read')).toBe(true);
  });
  it('discards the decoded clip when its source changed during decoding', async () => {
    connector.openReadSession = jest.fn().mockResolvedValue({ size: sourceSize, version: 'v1', read: jest.fn(),
      validate: jest.fn().mockRejectedValue(new Error('source changed')) });
    await expect(run()).rejects.toThrow('source changed');
    expect(fs.readdirSync(path.join(root, 'clips'))).toEqual([]);
    expect(db.query.mock.calls.some(([sql]: any[]) => sql.includes('INSERT INTO media_assets'))).toBe(false);
  });
});
