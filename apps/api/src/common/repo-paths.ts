import * as fs from 'fs';
import * as path from 'path';

export function findRepoRoot(startDir: string = __dirname): string {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export function resolveFromRepo(relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) return relativeOrAbsolute;
  return path.resolve(findRepoRoot(), relativeOrAbsolute);
}

export function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  };
  return map[ext] ?? 'application/octet-stream';
}

export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  return base.length > 0 ? base : 'video.mp4';
}

export function validateAssetId(id: string): string {
  if (!id || typeof id !== 'string') {
    throw new Error('Asset ID must be a non-empty string');
  }
  const trimmed = id.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(trimmed)) {
    throw new Error(
      `Invalid asset ID format: '${id}'. Must be 1-128 alphanumeric, dash, or underscore characters.`,
    );
  }
  return trimmed;
}

export function assertPathWithinRoot(targetPath: string, rootDir: string): string {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootDir);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Security violation: Path '${targetPath}' escapes allowed root directory '${rootDir}'`,
    );
  }
  return resolvedTarget;
}
