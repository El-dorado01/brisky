jest.mock('googleapis', () => ({ google: { drive: jest.fn() } }));
import { google } from 'googleapis';
import { Readable } from 'stream';
import { GoogleDriveConnector } from './google-drive.connector';

describe('Drive range opening cancellation', () => {
  const connector = () => new GoogleDriveConnector({ get: (_key: string, fallback: string) => fallback } as any);
  it('passes the search signal into the HTTP request', async () => {
    const stream = Readable.from(['media']);
    const get = jest.fn().mockResolvedValue({ data: stream });
    (google.drive as jest.Mock).mockReturnValue({ files: { get } });
    const controller = new AbortController();
    expect(await connector().getByteRange({} as any, 'file', 0, 5, controller.signal)).toBe(stream);
    expect(get).toHaveBeenCalledWith({ fileId: 'file', alt: 'media' },
      { responseType: 'stream', headers: { Range: 'bytes=0-4' }, signal: controller.signal });
    stream.destroy();
  });
  it('destroys a stream returned after cancellation', async () => {
    const controller = new AbortController();
    const stream = Readable.from(['media']);
    const get = jest.fn(async () => { controller.abort(); return { data: stream }; });
    (google.drive as jest.Mock).mockReturnValue({ files: { get } });
    await expect(connector().getByteRange({} as any, 'file', 0, 5, controller.signal)).rejects.toThrow();
    expect(stream.destroyed).toBe(true);
  });
  it('exposes status/range metadata and validates source version after decoding', async () => {
    const stream = Readable.from(['abcd']);
    const get = jest.fn().mockResolvedValueOnce({ data: { size: '100', version: '7', capabilities: { canDownload: true } } })
      .mockResolvedValueOnce({ status: 206, headers: { 'content-range': 'bytes 0-3/100' }, data: stream })
      .mockResolvedValueOnce({ data: { size: '100', version: '8' } });
    (google.drive as jest.Mock).mockReturnValue({ files: { get } });
    const controller = new AbortController();
    const session = await connector().openReadSession({} as any, 'file', controller.signal);
    expect(session.size).toBe(100);
    expect(session.version).toBe('7');
    expect(await session.read(0, 4, controller.signal)).toMatchObject({ status: 206, contentRange: 'bytes 0-3/100' });
    await expect(session.validate(controller.signal)).rejects.toThrow('changed during inspection');
    stream.destroy();
  });
  it('refuses an unversioned source before opening media bytes', async () => {
    const get = jest.fn().mockResolvedValue({ data: { size: '100' } });
    (google.drive as jest.Mock).mockReturnValue({ files: { get } });
    await expect(connector().openReadSession({} as any, 'file')).rejects.toThrow('versioned media reads');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
