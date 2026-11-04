import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { sessionCookie } from '@/server/auth-http';

export default async function RequireSession({ children }: { children: React.ReactNode }) {
  if (!await auth().session(await sessionCookie())) redirect('/login');
  return children;
}
