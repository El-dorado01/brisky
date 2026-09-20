import * as fs from 'fs';
import * as path from 'path';
import { toStorageLocator } from '../../common/storage-paths';

export interface KeyframeEntry {
  timestamp: number;
  path: string;
  data?: string;
}

const MAX_INLINE_BYTES = 80_000;

/**
 * Copies extracted keyframes from ephemeral scratch to durable
 * storage/keyframes/{assetId}/ and returns locators relative to STORAGE_ROOT.
 * Small JPEGs also get an inline data URI so Stage-2 works without shared disk.
 */
export function persistDurableKeyframes(
  assetId: string,
  storageRoot: string,
  keyframes: KeyframeEntry[],
): KeyframeEntry[] {
  if (!keyframes || keyframes.length === 0) return [];

  const assetKeyframeDir = path.join(storageRoot, 'keyframes', assetId);
  if (!fs.existsSync(assetKeyframeDir)) {
    fs.mkdirSync(assetKeyframeDir, { recursive: true });
  }

  return keyframes.map((kf, index) => {
    if (!kf.path || !fs.existsSync(kf.path)) {
      return kf;
    }
    const ext = path.extname(kf.path) || '.jpg';
    const filename = `kf_${index}_${Math.round(kf.timestamp * 1000)}${ext}`;
    const destPath = path.join(assetKeyframeDir, filename);
    fs.copyFileSync(kf.path, destPath);

    let data = kf.data;
    try {
      const buf = fs.readFileSync(destPath);
      if (buf.length > 0 && buf.length <= MAX_INLINE_BYTES) {
        const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
        data = `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch {
      /* ignore */
    }

    return {
      timestamp: kf.timestamp,
      path: toStorageLocator(destPath, storageRoot),
      data,
    };
  });
}
