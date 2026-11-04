import type { ReactNode } from "react";
import { LoginBackground } from "@/components/auth/LoginBackground";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="relative flex min-h-dvh w-full items-center justify-center overflow-x-hidden bg-brand-canvas px-4 py-12 text-brand-ink"
      style={{ backgroundColor: "var(--color-brand-canvas)" }}
    >
      <LoginBackground />
      <span
        aria-label="Brisky"
        className="absolute left-6 top-6 z-10 text-4xl leading-none text-brand-violet [font-family:var(--font-logo),var(--font-dm-sans),sans-serif] sm:left-10 sm:top-8"
      >
        <span aria-hidden>/ˈbrɪski/</span>
      </span>
      <div className="relative z-10 w-full max-w-[380px]">{children}</div>
    </main>
  );
}

