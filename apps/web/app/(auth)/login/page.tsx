import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginCard } from "@/components/auth/LoginCard";

export const metadata: Metadata = {
  title: "Log in – Brisky",
};

export default function LoginPage() {
  return (
    <AuthShell>
      <LoginCard />
    </AuthShell>
  );
}
