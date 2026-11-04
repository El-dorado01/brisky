import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { OtpForm } from "@/components/auth/OtpForm";

export const metadata: Metadata = {
  title: "Verify your email – Brisky",
};

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  if (!email) redirect("/login");

  return (
    <AuthShell>
      <OtpForm email={email} />
    </AuthShell>
  );
}

