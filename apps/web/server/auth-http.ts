import 'server-only';
import { cookies } from 'next/headers';
import { AuthError } from './auth-core';

export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-brisky_session' : 'brisky_session';
export const CHALLENGE_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-brisky_challenge' : 'brisky_challenge';
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
export function json(body: unknown, status = 200, retryAfter?: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store',
    ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) } });
}
export function failure(error: unknown) {
  if (error instanceof AuthError) return json({ error: error.message }, error.status, error.retryAfter);
  console.error('SaaS authentication request failed');
  return json({ error: 'Sign-in is temporarily unavailable. Please try again.' }, 503);
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const url=new URL(request.url);
  // Next can use its bind address (0.0.0.0) in request.url. Browsers send the
  // actual local/LAN hostname in Host; production still requires an explicit origin.
  const localOrigin=`${url.protocol}//${request.headers.get('host') || url.host}`;
  const expected = process.env.SAAS_APP_ORIGIN || (process.env.NODE_ENV !== 'production' ? localOrigin : '');
  if (!origin || !expected || origin !== expected) throw new AuthError(403, 'Request origin is not allowed.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AuthError(403, 'Request origin is not allowed.');
}
export async function body(request: Request, maxBytes = 2048): Promise<Record<string, unknown>> {
  assertSameOrigin(request);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new AuthError(415, 'JSON is required.');
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400, 'Request body is required.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new AuthError(413, 'Request is too large.'); }
      chunks.push(value);
    }
    let value;
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AuthError(400, 'Invalid JSON.'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthError(400, 'Invalid request.');
    return value;
  } finally { reader.releaseLock(); }
}
export async function sessionCookie() { return (await cookies()).get(SESSION_COOKIE)?.value; }
