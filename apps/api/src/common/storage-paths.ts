import * as path from 'path';

/**
 * Store derived-media locators as posix-relative keys under STORAGE_ROOT
 * (e.g. proxies/vid_123.mp4). Never persist another host's absolute path.
 */
export function toStorageLocator(absPath: string, storageRoot: string): string {
  const root = path.resolve(storageRoot);
  const resolved = path.resolve(absPath);
  const rel = path.relative(root, resolved);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel.split(path.sep).join('/');
  }
  const base = path.basename(resolved);
  const parent = path.basename(path.dirname(resolved));
  const grand = path.basename(path.dirname(path.dirname(resolved)));
  if (parent === 'proxies') return `proxies/${base}`;
  if (parent === 'clips') return `clips/${base}`;
  if (parent === 'thumbnails') return `thumbnails/${base}`;
  if (grand === 'keyframes') return `keyframes/${parent}/${base}`;
  if (grand === 'uploads') return `uploads/${parent}/${base}`;
  return `proxies/${base}`;
}

/**
 * Resolve a stored locator onto this process's STORAGE_ROOT.
 * Foreign absolute paths (e.g. /app/storage/proxies/x.mp4 from a worker
 * container) are mapped by their trailing known subdirectory, never used as-is.
 */
export function resolveStorageLocator(
  stored: string | null | undefined,
  storageRoot: string,
): string | null {
  if (!stored) return null;
  const root = path.resolve(storageRoot);
  const normalized = stored.replace(/\\/g, '/');

  if (!path.isAbsolute(stored) && !/^[a-zA-Z]:\//.test(normalized)) {
    return path.resolve(root, stored);
  }

  const markers = ['/proxies/', '/clips/', '/thumbnails/', '/keyframes/', '/uploads/'];
  for (const marker of markers) {
    const idx = normalized.toLowerCase().lastIndexOf(marker);
    if (idx >= 0) {
      return path.resolve(root, normalized.slice(idx + 1));
    }
  }
  return null;
}
