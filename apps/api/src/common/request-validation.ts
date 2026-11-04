import { BadRequestException } from '@nestjs/common';

export function invalidRequest(message: string): never {
  throw new BadRequestException({ statusCode: 400, code: 'INVALID_REQUEST', message });
}

export function boundedText(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    invalidRequest(`${field} must be ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${max} characters`);
  }
  return value;
}

export function validateCredentials(email: unknown, password: unknown, registration = false, name?: unknown): void {
  const address = boundedText(email, 'email', 254).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) invalidRequest('email must be a valid email address');
  boundedText(password, 'password', 256);
  if (registration && (password as string).length < 12) invalidRequest('password must contain at least 12 characters');
  if (name !== undefined) boundedText(name, 'name', 120, true);
}

export function validateSearch(query: unknown, assetId?: unknown, phase?: unknown): void {
  boundedText(query, 'query', 2000);
  if (assetId !== undefined) boundedText(assetId, 'assetId', 128);
  if (phase !== undefined && phase !== 'retrieve' && phase !== 'verify') invalidRequest('phase must be retrieve or verify');
}

export function validateClip(body: unknown): asserts body is { start_s: number; end_s: number; title?: string } {
  const value = body as any;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.start_s !== 'number' || !Number.isFinite(value.start_s) || value.start_s < 0 ||
      typeof value.end_s !== 'number' || !Number.isFinite(value.end_s) || value.end_s <= value.start_s ||
      value.end_s - value.start_s > 600 || value.end_s > 7 * 24 * 3600) {
    invalidRequest('Clip bounds must be finite numbers: 0 <= start_s < end_s; maximum span is 600 seconds');
  }
  if (value.title !== undefined) boundedText(value.title, 'title', 200, true);
}

export function validateFolders(folders: unknown): asserts folders is Array<{ id: string; name: string }> {
  if (!Array.isArray(folders) || folders.length > 100) invalidRequest('folders must be an array of at most 100 entries');
  const ids = new Set<string>();
  for (const folder of folders) {
    if (!folder || typeof folder !== 'object') invalidRequest('Each folder must contain id and name');
    const id = boundedText(folder.id, 'folder.id', 256);
    boundedText(folder.name, 'folder.name', 256);
    if (ids.has(id)) invalidRequest('Duplicate folder ids are not allowed');
    ids.add(id);
  }
}
