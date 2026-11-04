import { cookies } from 'next/headers';
import { auth } from '@/server/auth';
import { assertSameOrigin, CHALLENGE_COOKIE, SESSION_COOKIE, cookieOptions, failure, json } from '@/server/auth-http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    // Public UI previews can have no session (or an obsolete mock cookie).
    // Clearing those cookies must not depend on PostgreSQL being available.
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) await auth().logout(token);
    for (const name of [SESSION_COOKIE, CHALLENGE_COOKIE]) jar.set(name, '', { ...cookieOptions, maxAge: 0 });
    return json({ success: true });
  } catch (error) { return failure(error); }
}
