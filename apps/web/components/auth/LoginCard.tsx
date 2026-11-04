"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { readAuthResponse } from '@/lib/auth-response';
import { LoaderCircle } from 'lucide-react';

// TODO: wire these to the real auth backend (OAuth redirects / magic link).
function startOAuth(provider: "google" | "meta") {
  console.info(`[auth] ${provider} sign-in not wired yet`);
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-4 6.8-9.9 6.8-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.9 2.3-8.6 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function MetaIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#0866FF" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 12c-1.6-2.6-3-5.5-5-5.5C4.6 6.5 3 9 3 12s1.4 5.5 3.4 5.5c2.2 0 3.8-2.9 5.6-5.5zm0 0c1.6 2.6 3.4 5.5 5.6 5.5 2 0 3.4-2.5 3.4-5.5s-1.6-5.5-4-5.5c-2 0-3.4 2.9-5 5.5z" />
    </svg>
  );
}

const providerButton =
  "flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-brand-line bg-brand-surface text-sm font-medium text-brand-ink transition hover:border-brand-violet/40 hover:shadow-[0_4px_16px_rgba(115,99,222,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet";

function ProviderButton({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={providerButton}>
      {icon}
      {children}
    </button>
  );
}

export function LoginCard() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true); setError("");
    try {
      const response = await fetch('/api/auth/email/request-code', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const result = await readAuthResponse(response);
      if (!response.ok) throw new Error(result.error || 'Unable to send your code.');
      router.push(`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { setSending(false); }
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Find any moment.</h1>
        <p className="mt-2 text-sm text-brand-muted">Log in or create your account to start searching your media.</p>
      </div>

      <div className="space-y-3">
        <ProviderButton icon={<GoogleIcon />} onClick={() => startOAuth("google")}>
          Continue with Google
        </ProviderButton>
        <ProviderButton icon={<MetaIcon />} onClick={() => startOAuth("meta")}>
          Continue with Meta
        </ProviderButton>
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-brand-muted">
        <span className="h-px flex-1 bg-brand-line" />
        or
        <span className="h-px flex-1 bg-brand-line" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 w-full rounded-xl border border-brand-line bg-brand-surface px-4 text-base sm:text-sm text-brand-ink outline-none transition placeholder:text-brand-muted/70 focus:border-brand-violet focus:ring-4 focus:ring-brand-violet/15"
        />
        <button
          type="submit"
          disabled={sending}
          aria-busy={sending}
          className="h-11 w-full rounded-xl bg-brand-action text-sm font-semibold text-white transition hover:bg-brand-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet"
        >
          <span className="inline-flex items-center justify-center gap-2" role="status">
            {sending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
            {sending ? 'Sending code…' : 'Continue with email'}
          </span>
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

      <p className="mt-6 text-center text-xs text-brand-muted">
        By continuing you agree to our Terms and Privacy Policy.
      </p>
    </div>
  );
}
