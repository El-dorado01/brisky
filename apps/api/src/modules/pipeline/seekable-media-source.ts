import { createServer, ServerResponse } from 'http';
import { randomBytes } from 'crypto';
import { Readable } from 'stream';
import { once } from 'events';
import { MediaReadSession } from '../connector/media-connector.interface';

export interface SeekableMediaSource {
  readonly url: string;
  readonly bytesRead: number;
  validate(): Promise<void>;
  close(): Promise<void>;
}

/** FFmpeg seeks using the container index. This bridge never maps timestamps to bytes. */
export async function openSeekableMediaSource(session: MediaReadSession, options: {
  maxBytes: number; signal?: AbortSignal; reserve?: (bytes: number) => boolean;
  timeoutMs?: number; blockBytes?: number; maxReads?: number; maxRequests?: number;
  smallFileCacheBytes?: number;
}): Promise<SeekableMediaSource> {
  const block = options.blockBytes ?? 1024 * 1024;
  const timeout = options.timeoutMs ?? 120000;
  const maxReads = options.maxReads ?? 256;
  const maxRequests = options.maxRequests ?? 512;
  const cacheLimit = options.smallFileCacheBytes ?? 0;
  if (!Number.isSafeInteger(session.size) || session.size <= 0 || !session.version ||
      !Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0 ||
      !Number.isSafeInteger(block) || block <= 0 || block > 1024 * 1024 ||
      !Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 3600000 ||
      !Number.isSafeInteger(maxReads) || maxReads <= 0 || maxReads > 65536 ||
      !Number.isSafeInteger(maxRequests) || maxRequests <= 0 || maxRequests > 65536 ||
      !Number.isSafeInteger(cacheLimit) || cacheLimit < 0 || cacheLimit > 64 * 1024 * 1024) throw new Error('Invalid seekable media limits');
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  const token = '/' + randomBytes(24).toString('hex');
  let reserved = 0, transferred = 0, reads = 0, active = 0, requests = 0;
  let failure: Error | undefined;
  let closed = false;
  let cachedSource: Buffer | undefined;
  const sockets = new Set<import('net').Socket>();
  const pending = new Set<Promise<void>>();
  const serve = async (request: import('http').IncomingMessage, response: ServerResponse) => {
    if (request.url !== token) { response.writeHead(404).end(); return; }
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return; }
    if (closed || controller.signal.aborted) { response.writeHead(503).end(); return; }
    if (++requests > maxRequests || active >= 2) { response.writeHead(429).end(); return; }
    let start = 0, end = session.size - 1;
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) { response.writeHead(416).end(); return; }
      if (!match[1]) { start = Math.max(0, session.size - Number(match[2])); }
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= session.size) {
      response.writeHead(416, { 'Content-Range': `bytes */${session.size}` }).end(); return;
    }
    const headers: Record<string, string | number> = { 'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${session.size}`;
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === 'HEAD') { response.end(); return; }
    if (cachedSource) { response.end(cachedSource.subarray(start, end + 1)); return; }
    active++;
    const local = new AbortController();
    const cancel = () => local.abort();
    const onClose = () => { if (!response.writableFinished) cancel(); };
    response.once('close', onClose);
    controller.signal.addEventListener('abort', cancel, { once: true });
    let stream: Readable | undefined;
    try {
      for (let offset = start; offset <= end;) {
        local.signal.throwIfAborted();
        const length = Math.min(block, end - offset + 1);
        if (++reads > maxReads || reserved + length > options.maxBytes || options.reserve?.(length) === false) {
          throw new Error('Seekable media transfer budget exhausted');
        }
        reserved += length;
        const result = await session.read(offset, length, local.signal);
        stream = result.stream as Readable;
        local.signal.throwIfAborted();
        if (result.status !== 206 || result.contentRange !== `bytes ${offset}-${offset + length - 1}/${session.size}`) {
          throw new Error('Cloud source returned an invalid byte range');
        }
        const chunks: Buffer[] = [];
        let count = 0;
        const destroy = () => stream?.destroy();
        local.signal.addEventListener('abort', destroy, { once: true });
        try {
          for await (const data of stream) {
            local.signal.throwIfAborted();
            const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
            count += chunk.length; transferred += chunk.length;
            if (count > length) throw new Error('Cloud range exceeded requested length');
            chunks.push(chunk);
          }
        } finally { local.signal.removeEventListener('abort', destroy); }
        if (count !== length) throw new Error('Cloud range was truncated');
        if (!response.write(Buffer.concat(chunks, length))) await once(response, 'drain', { signal: local.signal });
        offset += length;
      }
      response.end();
    } catch (error) {
      if (!local.signal.aborted) { failure = error instanceof Error ? error : new Error(String(error)); controller.abort(); }
      response.destroy();
    } finally {
      stream?.destroy();
      response.removeListener('close', onClose);
      controller.signal.removeEventListener('abort', cancel);
      active--;
    }
  };
  const server = createServer((request, response) => {
    const work = serve(request, response);
    pending.add(work);
    void work.catch(() => response.destroy()).finally(() => pending.delete(work));
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  const destroySockets = () => { for (const socket of sockets) socket.destroy(); };
  controller.signal.addEventListener('abort', destroySockets);
  const close = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    controller.abort(); destroySockets();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.allSettled([...pending]);
    cachedSource = undefined;
  };
  try {
    // Small sources are fetched once per decoder session, within the same transfer
    // budget. Large sources keep the existing bounded range path.
    if (session.size <= cacheLimit && session.size <= options.maxBytes) {
      await session.validate(controller.signal);
      const chunks: Buffer[] = [];
      for (let offset = 0; offset < session.size;) {
        controller.signal.throwIfAborted();
        const length = Math.min(block, session.size - offset);
        if (++reads > maxReads || reserved + length > options.maxBytes || options.reserve?.(length) === false) {
          throw new Error('Seekable media transfer budget exhausted');
        }
        reserved += length;
        const result = await session.read(offset, length, controller.signal);
        const stream = result.stream as Readable;
        const destroy = () => stream.destroy();
        controller.signal.addEventListener('abort', destroy, { once: true });
        try {
          if (result.status !== 206 || result.contentRange !== `bytes ${offset}-${offset + length - 1}/${session.size}`) throw new Error('Cloud source returned an invalid byte range');
          let count = 0;
          for await (const data of stream) {
            controller.signal.throwIfAborted();
            const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
            count += chunk.length; transferred += chunk.length;
            if (count > length) throw new Error('Cloud range exceeded requested length');
            chunks.push(chunk);
          }
          if (count !== length) throw new Error('Cloud range was truncated');
        } finally { controller.signal.removeEventListener('abort', destroy); stream.destroy(); }
        offset += length;
      }
      await session.validate(controller.signal);
      cachedSource = Buffer.concat(chunks, session.size);
    }
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    controller.signal.throwIfAborted();
    const port = (server.address() as import('net').AddressInfo).port;
    return { url: `http://127.0.0.1:${port}${token}`, get bytesRead() { return transferred; }, close,
      validate: async () => { if (failure) throw failure; controller.signal.throwIfAborted(); await session.validate(controller.signal); } };
  } catch (error) { await close(); throw error; }
}
