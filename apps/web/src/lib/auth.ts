import { getToken } from './api';

export function parseRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(base64)) as { role?: string };
    return decoded.role ?? null;
  } catch {
    return null;
  }
}
