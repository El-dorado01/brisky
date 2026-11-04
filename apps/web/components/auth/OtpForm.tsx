"use client";

import Link from "next/link";
import { useRouter } from 'next/navigation';
import { readAuthResponse } from '@/lib/auth-response';
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;
const RESEND_SECONDS = 60;

export function OtpForm({ email }: { email: string }) {
  const router = useRouter();
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle");
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(code: string) {
    if (busy.current) return;
    busy.current = true;
    setError('');
    setStatus("verifying");
    try {
      const response = await fetch('/api/auth/email/verify-code', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) });
      const result = await readAuthResponse(response);
      if (!response.ok) throw new Error(result.error || 'Unable to verify your code.');

      const normalizedEmail = email.trim().toLowerCase();
      if (result.isNewUser) {
        router.replace(`/onboarding?email=${encodeURIComponent(normalizedEmail)}`);
      } else {
        router.replace('/search');
      }
      router.refresh();
    } catch (failure) {
      setStatus('error'); setError(failure instanceof Error ? failure.message : 'Please try again.');
    } finally { busy.current = false; }
  }

  function update(next: string[]) {
    setDigits(next);
    setStatus("idle");
    if (next.every(Boolean)) submit(next.join(""));
  }

  function onChange(i: number, value: string) {
    const d = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    update(next);
    if (d && i < LENGTH - 1) refs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < LENGTH - 1) refs.current[i + 1]?.focus();
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array.from({ length: LENGTH }, (_, i) => pasted[i] ?? "");
    update(next);
    refs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  }

  async function resend() {
    if (busy.current || cooldown > 0) return;
    busy.current = true; setError('');
    try {
      const response = await fetch('/api/auth/email/request-code', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const result = await readAuthResponse(response);
      if (!response.ok) {
        setCooldown(Number(response.headers.get('Retry-After')) || RESEND_SECONDS);
        throw new Error(result.error || 'Unable to resend your code.');
      }
      setCooldown(result.retryAfter ?? RESEND_SECONDS); setDigits(Array(LENGTH).fill('')); setStatus('idle');
      refs.current[0]?.focus();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { busy.current = false; }
  }

  const complete = digits.every(Boolean);

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-1.5 text-sm text-brand-muted">
          We sent a 6-digit code to <strong className="font-medium text-brand-ink">{email}</strong>
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (complete) submit(digits.join(""));
        }}
      >
        <div className="flex justify-between gap-2" role="group" aria-label="One-time code">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={d}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={onPaste}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              autoFocus={i === 0}
              disabled={status === 'verifying'}
              maxLength={1}
              aria-label={`Digit ${i + 1}`}
              className="h-14 w-full min-w-0 rounded-xl border border-brand-line bg-brand-surface text-center text-xl font-semibold text-brand-ink outline-none transition focus:border-brand-violet focus:ring-4 focus:ring-brand-violet/15"
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={!complete || status === "verifying"}
          className="mt-5 h-11 w-full rounded-xl bg-brand-action text-sm font-semibold text-white transition hover:bg-brand-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-action"
        >
          {status === "verifying" ? "Verifying…" : "Verify email"}
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

      <p className="mt-6 text-center text-sm text-brand-muted">
        Didn&apos;t get it?{" "}
        {cooldown > 0 ? (
          <span>Resend in {cooldown}s</span>
        ) : (
          <button type="button" onClick={resend} className="font-medium text-brand-violet hover:text-brand-violet-hover">
            Resend code
          </button>
        )}
      </p>
      <p className="mt-2 text-center text-sm">
        <Link href="/login" className="!text-brand-muted hover:!text-brand-ink">
          Use a different email
        </Link>
      </p>
    </div>
  );
}

