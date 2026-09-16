import * as fs from 'fs';
import * as path from 'path';

export interface KeyframeEntry {
  timestamp: number;
  path: string;
}

/**
 * Copies extracted keyframes from ephemeral scratch to durable storage/keyframes/{assetId}/
 * and returns updated entries pointing to the durable paths.
 */
export function persistDurableKeyframes(
  assetId: string,
  durableBaseDir: string,
  keyframes: KeyframeEntry[],
): KeyframeEntry[] {
  if (!keyframes || keyframes.length === 0) return [];

  const assetKeyframeDir = path.join(durableBaseDir, assetId);
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
    return {
      timestamp: kf.timestamp,
      path: destPath,
    };
  });
}
