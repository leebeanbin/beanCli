'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { setToken } from '../../lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

export default function AuthPage() {
  const { isAuthenticated, login, user } = useAuth();
  const router = useRouter();

  // Setup detection
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already logged in → go home
  useEffect(() => {
    if (isAuthenticated) router.replace('/');
  }, [isAuthenticated, router]);

  // Check setup status on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/auth/setup-status`)
      .then((r) => r.json())
      .then((data: unknown) => {
        const d = data as { needsSetup?: boolean };
        setNeedsSetup(!!d.needsSetup);
      })
      .catch(() => setNeedsSetup(false));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(username, password);
    setLoading(false);
    if (result.ok) {
      router.replace('/');
    } else {
      setError(result.error ?? 'Login failed');
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? `Setup failed (HTTP ${res.status})`);
        return;
      }
      // Auto-login with returned token
      setToken(data.token ?? '');
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  // Loading setup status
  if (needsSetup === null) {
    return (
      <div className="max-w-sm mx-auto mt-8">
        <p className="font-mono text-xs text-fg-2 animate-pulse">[ Checking system status... ]</p>
      </div>
    );
  }

  // ── First-run setup form ──────────────────────────────────────────────────
  if (needsSetup) {
    return (
      <div className="max-w-sm mx-auto mt-8">
        <h1 className="font-pixel text-3xl text-accent mb-2">[ First Run Setup ]</h1>
        <p className="text-xs font-mono text-fg-2 mb-6">
          No accounts found. Create the initial administrator account (DBA role).
        </p>

        <form onSubmit={handleSetup} className="bg-bg-2 border border-rim shadow-px p-6 space-y-4">
          <div className="border-b border-rim pb-3 mb-1">
            <p className="font-pixel text-base text-ok">● System ready — needs first admin</p>
          </div>

          <div>
            <label className="block font-pixel text-lg text-fg-2 mb-1">Admin Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              minLength={3}
              maxLength={64}
              autoComplete="username"
              className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block font-pixel text-lg text-fg-2 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent"
            />
            <p className="text-xs font-mono text-fg-2 opacity-60 mt-1">Minimum 8 characters</p>
          </div>

          {error && (
            <p className="text-xs font-mono text-danger border border-danger px-3 py-2 bg-danger/10">
              ✗ {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password || password.length < 8}
            className="w-full border border-accent text-accent hover:bg-accent hover:text-bg px-4 py-2 font-pixel text-xl shadow-px-a disabled:opacity-40 disabled:cursor-not-allowed transition-none"
          >
            {loading ? '[ Creating Admin... ]' : '[ Create Admin Account ]'}
          </button>
        </form>
      </div>
    );
  }

  // ── Normal login form ─────────────────────────────────────────────────────
  return (
    <div className="max-w-sm mx-auto mt-8">
      <h1 className="font-pixel text-3xl text-fg mb-2">[ Sign In ]</h1>
      <p className="text-xs font-mono text-fg-2 mb-6">
        Enter your beanCLI credentials. Session is stored locally and expires in 1 hour.
      </p>

      <form onSubmit={handleLogin} className="bg-bg-2 border border-rim shadow-px p-6 space-y-4">
        <div>
          <label className="block font-pixel text-lg text-fg-2 mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            autoComplete="username"
            className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block font-pixel text-lg text-fg-2 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent"
          />
        </div>

        {error && (
          <p className="text-xs font-mono text-danger border border-danger px-3 py-2 bg-danger/10">
            ✗ {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full border border-accent text-accent hover:bg-accent hover:text-bg px-4 py-2 font-pixel text-xl shadow-px-a disabled:opacity-40 disabled:cursor-not-allowed transition-none"
        >
          {loading ? '[ Authenticating... ]' : '[ Sign In ]'}
        </button>
      </form>

      <div className="mt-6 border border-rim bg-bg-2 shadow-px">
        <button
          type="button"
          className="w-full px-4 py-2 font-pixel text-base text-fg-2 hover:text-accent text-left flex items-center gap-2"
          onClick={() => {
            const el = document.getElementById('dev-hint');
            if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
          }}
        >
          <span className="opacity-50">▸</span> Dev Credentials Hint
        </button>
        <div id="dev-hint" style={{ display: 'none' }} className="px-4 pb-4 space-y-1">
          <p className="text-xs font-mono text-fg-2 opacity-70">
            Default seeded accounts (dev only):
          </p>
          <p className="text-xs font-mono text-accent">admin / admin → DBA role</p>
          <p className="text-xs font-mono text-fg-2">manager / manager → MANAGER role</p>
          <p className="text-xs font-mono text-fg-2">analyst / analyst → ANALYST role</p>
          <p className="text-xs font-mono text-fg-2 opacity-50 mt-2">
            JWT_SECRET must match the API server .env value.
          </p>
        </div>
      </div>
    </div>
  );
}
