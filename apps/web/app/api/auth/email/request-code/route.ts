import { cookies } from 'next/headers';
import { auth } from '@/server/auth';
import { CODE_SECONDS } from '@/server/auth-core';
import { body, CHALLENGE_COOKIE, cookieOptions, failure, json } from '@/server/auth-http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const input = await body(request);
    const result = await auth().requestCode(input.email);
    (await cookies()).set(CHALLENGE_COOKIE, result.browser, { ...cookieOptions, maxAge: CODE_SECONDS });
    return json({ sent: true, expiresIn: CODE_SECONDS, retryAfter: result.retryAfter });
  } catch (error) { return failure(error); }
}
