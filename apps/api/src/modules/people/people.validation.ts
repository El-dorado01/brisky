import { UnauthorizedException } from '@nestjs/common';
import { boundedText, invalidRequest } from '../../common/request-validation';

export function uuid(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) invalidRequest(`${field} must be a UUID`);
  return value;
}
export function ownerId(value: unknown): string {
  if (!value) throw new UnauthorizedException();
  return uuid(value, 'owner');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidRequest('Body must be an object');
  return value as Record<string, unknown>;
}
export function personInput(body: unknown) {
  const value = record(body);
  if (Object.keys(value).some(k => !['name', 'aliases', 'isMe'].includes(k))) invalidRequest('Unknown person field');
  const name = boundedText(value.name, 'name', 120).trim();
  const raw = value.aliases ?? [];
  if (!Array.isArray(raw) || raw.length > 20) invalidRequest('aliases must contain at most 20 entries');
  const aliases = [...new Set(raw.map(a => boundedText(a, 'alias', 120).trim()))];
  if (value.isMe !== undefined && typeof value.isMe !== 'boolean') invalidRequest('isMe must be boolean');
  return { name, aliases, isMe: value.isMe ?? false };
}
export function appearanceInput(body: unknown) {
  const value = record(body);
  if (Object.keys(value).some(k => !['assetId', 'start_s', 'end_s', 'frame_s', 'box'].includes(k))) invalidRequest('Unknown appearance field');
  const assetId = boundedText(value.assetId, 'assetId', 64).trim();
  const { start_s, end_s, frame_s, box } = value;
  if (typeof start_s !== 'number' || !Number.isFinite(start_s) || start_s < 0 ||
      typeof end_s !== 'number' || !Number.isFinite(end_s) || end_s <= start_s || end_s > 604800 ||
      typeof frame_s !== 'number' || !Number.isFinite(frame_s) || frame_s < start_s || frame_s >= end_s) {
    invalidRequest('Require 0 <= start_s <= frame_s < end_s <= 604800');
  }
  // Normalized [x, y, width, height] at frame_s, not a claim of face tracking.
  if (!Array.isArray(box) || box.length !== 4 || box.some(n => typeof n !== 'number' || !Number.isFinite(n)) ||
      box[0] < 0 || box[1] < 0 || box[2] <= 0 || box[3] <= 0 || box[0] + box[2] > 1 || box[1] + box[3] > 1) {
    invalidRequest('box must be normalized [x, y, width, height] within the frame');
  }
  return { assetId, start_s, end_s, frame_s, box: box as number[] };
}
export function listInput(limit?: unknown, after?: unknown) {
  if (limit !== undefined && (typeof limit !== 'string' || !/^[1-9]\d?$|^100$/.test(limit))) invalidRequest('limit must be 1 to 100');
  return { limit: limit === undefined ? 50 : Number(limit), after: after === undefined ? null : uuid(after, 'after') };
}
