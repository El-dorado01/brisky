import { cookies } from 'next/headers';
import { auth } from '@/server/auth';
import { SESSION_SECONDS } from '@/server/auth-core';
import { body, CHALLENGE_COOKIE, SESSION_COOKIE, cookieOptions, failure, json } from '@/server/auth-http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const input = await body(request), jar = await cookies();
    const result = await auth().verifyCode(input.email, input.code, jar.get(CHALLENGE_COOKIE)?.value ?? '', jar.get(SESSION_COOKIE)?.value);
    jar.set(SESSION_COOKIE, result.token, { ...cookieOptions, maxAge: SESSION_SECONDS });
    jar.set(CHALLENGE_COOKIE, '', { ...cookieOptions, maxAge: 0 });
    return json({ user: result.user, isNewUser: result.isNew });
  } catch (error) { return failure(error); }
}
