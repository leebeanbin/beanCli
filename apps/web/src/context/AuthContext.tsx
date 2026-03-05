'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, setToken } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  sub: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

function parseJwt(token: string): { sub?: string; role?: string; exp?: number } | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) as { sub?: string; role?: string; exp?: number };
  } catch {
    return null;
  }
}

function isTokenValid(token: string): boolean {
  const parsed = parseJwt(token);
  if (!parsed?.sub) return false;
  if (parsed.exp && parsed.exp * 1000 < Date.now()) return false;
  return true;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  login: async () => ({ ok: false, error: 'Not initialized' }),
  logout: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Initialize from stored token (client-only — localStorage unavailable on server)
  useEffect(() => {
    const token = getToken();
    if (token && isTokenValid(token)) {
      const parsed = parseJwt(token);
      if (parsed?.sub) {
        setUser({ sub: parsed.sub, role: parsed.role ?? 'VIEWER' });
        setReady(true);
        return;
      }
    }
    // Token missing/invalid/expired — clear it
    setToken(null);
    setUser(null);
    setReady(true);
  }, []);

  // Guard: redirect to /auth if no valid session on protected pages
  useEffect(() => {
    if (!ready) return;
    if (pathname === '/auth') return;
    if (!user) router.push('/auth');
  }, [ready, user, pathname, router]);

  const login = useCallback(
    async (username: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';
        const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = (await res.json()) as {
          token?: string;
          username?: string;
          role?: string;
          error?: string;
        };
        if (!res.ok) {
          return { ok: false, error: data.error ?? `Login failed (HTTP ${res.status})` };
        }
        const token = data.token ?? '';
        setToken(token);
        const parsed = parseJwt(token);
        setUser({
          sub: data.username ?? parsed?.sub ?? username,
          role: data.role ?? parsed?.role ?? 'VIEWER',
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
      }
    },
    [],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    router.push('/auth');
  }, [router]);

  // Blank while loading (prevents flash of protected content before token check)
  if (!ready) return null;

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
