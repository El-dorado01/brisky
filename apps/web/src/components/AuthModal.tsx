import React, { useState } from 'react';
import { AlertCircle, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { UserProfile } from '../types';

interface AuthModalProps {
  token: string | null;
  onClose: () => void;
  onSuccess: (token: string, user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ token, onClose, onSuccess }) => {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authName, setAuthName] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  const handleAuthSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Please enter both email and password.');
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      const endpoint = authMode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
      const body =
        authMode === 'login'
          ? { email: authEmail.trim(), password: authPassword }
          : { email: authEmail.trim(), password: authPassword, name: authName.trim() };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Authentication failed');
      }
      onSuccess(data.token, data.user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleQuickDemoLogin = async () => {
    setAuthEmail('demo@mediaintel.local');
    setAuthPassword('demopassword123');
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'demo@mediaintel.local', password: 'demopassword123' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Demo login failed');
      }
      onSuccess(data.token, data.user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-5 relative animate-in fade-in zoom-in-95 duration-200">
        {token && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white text-xs p-1"
            title="Close"
          >
            ✕
          </button>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
            <KeyRound className="w-5 h-5" />
            <span>MediaIntel Access</span>
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">
            {authMode === 'login' ? 'Sign in to your library' : 'Create a new account'}
          </h3>
          <p className="text-xs text-slate-400">
            {authMode === 'login'
              ? 'Access your isolated video intelligence, embeddings, and telemetry.'
              : 'Get started with an isolated multi-video intelligence workspace.'}
          </p>
        </div>

        {authError && (
          <div className="bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs p-3 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={handleAuthSubmit} className="flex flex-col gap-3.5">
          {authMode === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-300 font-medium">Full Name (optional)</label>
              <input
                type="text"
                value={authName}
                onChange={(e) => setAuthName(e.target.value)}
                placeholder="Jane Doe"
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-300 font-medium">Email Address</label>
            <input
              type="email"
              required
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="creator@example.com"
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-300 font-medium">Password</label>
            <input
              type="password"
              required
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="••••••••••••"
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <button
            type="submit"
            disabled={authLoading}
            className="mt-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2.5 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
          >
            {authLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Please wait...</span>
              </>
            ) : (
              <span>{authMode === 'login' ? 'Sign In' : 'Create Account'}</span>
            )}
          </button>
        </form>

        <div className="relative my-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-900 px-2 text-slate-500 text-[10px]">Or instant access</span>
          </div>
        </div>

        <button
          onClick={handleQuickDemoLogin}
          disabled={authLoading}
          className="w-full bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-medium py-2 rounded-lg transition flex items-center justify-center gap-2"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Quick Demo: Sign In as Demo Creator
        </button>

        <div className="text-center text-xs text-slate-400 mt-1">
          {authMode === 'login' ? (
            <span>
              Don't have an account?{' '}
              <button
                onClick={() => {
                  setAuthMode('register');
                  setAuthError(null);
                }}
                className="text-indigo-400 hover:underline font-medium ml-1"
              >
                Sign Up
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <button
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                }}
                className="text-indigo-400 hover:underline font-medium ml-1"
              >
                Sign In
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
