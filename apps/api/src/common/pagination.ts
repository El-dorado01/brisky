import { UnauthorizedException } from '@nestjs/common';
import { invalidRequest } from './request-validation';

export interface PageRequest { limit: number; after?: { createdAt: string; id: string }; }
export function parsePage(limit: unknown, cursor: unknown, resource: 'assets' | 'jobs', owner: string): PageRequest {
  if (!owner) throw new UnauthorizedException();
  if (limit !== undefined && (typeof limit !== 'string' || !/^[1-9]\d{0,2}$/.test(limit))) invalidRequest('limit must be an integer from 1 to 100');
  const size = limit === undefined ? 50 : Number(limit);
  if (size > 100) invalidRequest('limit must be an integer from 1 to 100');
  if (cursor === undefined) return { limit: size };
  try {
    if (typeof cursor !== 'string' || cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw Error();
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (value.v !== 1 || value.resource !== resource || value.owner !== owner ||
        typeof value.id !== 'string' || !value.id || value.id.length > 128 ||
        typeof value.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value.createdAt) ||
        !Number.isFinite(Date.parse(value.createdAt)) || value.createdAt.startsWith('0000') ||
        new Date(value.createdAt).toISOString() !== value.createdAt.slice(0, 23) + 'Z' ||
        resource === 'jobs' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)) throw Error();
    return { limit: size, after: { createdAt: value.createdAt, id: value.id } };
  } catch { return invalidRequest('Invalid cursor for this user and resource'); }
}

export function pageResult<T>(rows: any[], page: PageRequest, resource: 'assets' | 'jobs', owner: string, map: (row: any) => T) {
  const selected = rows.slice(0, page.limit);
  const last = selected[selected.length - 1];
  const hasMore = rows.length > page.limit;
  const nextCursor = hasMore ? Buffer.from(JSON.stringify({ v: 1, resource, owner,
    createdAt: last.cursor_created_at, id: last.id })).toString('base64url') : null;
  return { items: selected.map(map), count: selected.length, hasMore, nextCursor };
}
