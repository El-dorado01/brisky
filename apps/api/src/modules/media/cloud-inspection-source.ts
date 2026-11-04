import * as fs from 'fs';
import * as path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { assertSearchActive, searchSignal } from '../../common/search-deadline';

/** Whole-file fallback for small sources only. Never guesses byte offsets from timestamps. */
export async function stageCloudSource(storageRoot: string, maxBytes: number,
  open: () => Promise<NodeJS.ReadableStream>, expectedBytes?: number): Promise<{ path: string; cleanup: () => void }> {
  assertSearchActive();
  const parent = path.join(storageRoot, 'scratch', 'cloud-inspection');
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, 'source-'));
  const cleanup = () => fs.rmSync(directory, { recursive: true, force: true });
  let source: Readable | undefined;
  try {
    source = await open() as Readable;
    assertSearchActive();
    let bytes = 0;
    const cap = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > maxBytes ? new Error('Cloud inspection source exceeds byte limit') : null, chunk);
    } });
    const file = path.join(directory, 'source');
    await pipeline(source, cap, fs.createWriteStream(file), { signal: searchSignal() });
    if (!bytes) throw new Error('Cloud inspection source is empty');
    if (expectedBytes !== undefined && bytes !== expectedBytes) throw new Error('Cloud inspection source is incomplete or changed');
    return { path: file, cleanup };
  } catch (error) { source?.destroy(); cleanup(); throw error; }
}
