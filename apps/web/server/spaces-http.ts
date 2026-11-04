import 'server-only';
import { auth } from './auth';
import { AuthError } from './auth-core';
import { json, sessionCookie } from './auth-http';
import { database } from './db';
import { createSpaces } from './spaces-core';

export type SpaceRoute = { params: Promise<{ spaceId: string }> };
export async function spacesRequest(run: (service: ReturnType<typeof createSpaces>, userId: string) => Promise<unknown>) {
  try {
    const account = await auth().session(await sessionCookie());
    if (!account) throw new AuthError(401, 'Sign in to access your spaces.');
    return json(await run(createSpaces(database()),account.id));
  } catch(error) {
    if(error instanceof AuthError) return json({error:error.message},error.status);
    // Unique identifiers cannot be used to probe ownership or overwrite another user's data.
    if(error && typeof error==='object' && 'code' in error && error.code==='23505')return json({error:'This request identifier is already in use.'},409);
    console.error('SaaS spaces request failed');
    return json({error:'Your spaces are temporarily unavailable. Please try again.'},503);
  }
}
