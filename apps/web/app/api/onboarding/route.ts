import { auth } from '@/server/auth';
import { AuthError } from '@/server/auth-core';
import { body,failure,json,sessionCookie } from '@/server/auth-http';
import { database } from '@/server/db';
import { createOnboarding } from '@/server/onboarding-core';
export const runtime='nodejs';
async function user() {
  const user=await auth().session(await sessionCookie());
  if (!user) throw new AuthError(401,'Sign in to save your setup.');
  return user;
}
export async function GET() {
  try {return json(await createOnboarding(database()).read((await user()).id));}
  catch(error) {return failure(error);}
}
export async function PUT(request:Request) {
  try {
    const input=await body(request,8192),account=await user();
    return json(await createOnboarding(database()).save(account.id,input));
  } catch(error) {return failure(error);}
}
