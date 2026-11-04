import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { sessionCookie } from '@/server/auth-http';
import { database } from '@/server/db';
import { createOnboarding } from '@/server/onboarding-core';

export default async function GuestOnly({ children }: { children: React.ReactNode }) {
  const user=await auth().session(await sessionCookie());
  if (user) {
    const setup=await createOnboarding(database()).read(user.id);
    redirect(setup.completed ? '/search' : '/onboarding');
  }
  return children;
}
