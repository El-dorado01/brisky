import { auth } from '@/server/auth';
import { failure, json, sessionCookie } from '@/server/auth-http';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const user = await auth().session(await sessionCookie());
    return json({ user }, user ? 200 : 401);
  } catch (error) { return failure(error); }
}
