'use client';

import { useState } from 'react';

const ROLES = ['MANAGER', 'DBA', 'SECURITY_ADMIN', 'VIEWER'] as const;

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function signJwt(payload: object, secret: string): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(new Uint8Array(sig))}`;
}

export default function AuthPage() {
  const [sub, setSub] = useState('dev-user');
  const [role, setRole] = useState<string>('MANAGER');
  const [secret, setSecret] = useState('dev-jwt-secret-change-in-prod');
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleGenerate() {
    const payload = {
      sub,
      role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const jwt = await signJwt(payload, secret);
    setToken(jwt);
    setSaved(false);
  }

  function handleSave() {
    if (!token) return;
    localStorage.setItem('tfsdc_token', token);
    setSaved(true);
  }

  function handleClear() {
    localStorage.removeItem('tfsdc_token');
    setToken('');
    setSaved(false);
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="font-pixel text-3xl text-fg mb-2">[ Dev JWT Generator ]</h1>
      <p className="text-xs font-mono text-fg-2 mb-6">
        Development-only tool. Generates a HS256-signed JWT stored in localStorage. Must match{' '}
        <code className="text-accent">JWT_SECRET</code> in .env.
      </p>

      <div className="bg-bg-2 border border-rim shadow-px p-6 space-y-4">
        <div>
          <label className="block text-xs font-mono text-fg-2 uppercase tracking-widest mb-1">
            Subject (actor)
          </label>
          <input
            type="text"
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-xs font-mono text-fg-2 uppercase tracking-widest mb-1">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-mono text-fg-2 uppercase tracking-widest mb-1">
            JWT Secret
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-2 focus:outline-none focus:border-accent"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={!sub || !secret}
          className="w-full border border-accent text-accent hover:bg-accent hover:text-bg px-4 py-2 text-sm font-mono shadow-px-a disabled:opacity-40 disabled:cursor-not-allowed transition-none"
        >
          [ Generate Token ]
        </button>
      </div>

      {token && (
        <div className="mt-6 bg-bg-2 border border-rim shadow-px p-6 space-y-4">
          <div className="text-xs font-mono text-fg-2 uppercase tracking-widest">
            Generated Token
          </div>
          <textarea
            readOnly
            value={token}
            rows={5}
            className="w-full bg-bg border border-rim text-fg-2 font-mono text-xs px-3 py-2 resize-none focus:outline-none"
          />
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="flex-1 border border-ok text-ok hover:bg-ok hover:text-bg px-4 py-2 text-sm font-mono shadow-px-o transition-none"
            >
              {saved ? '● Saved to localStorage' : '[ Save to localStorage ]'}
            </button>
            <button
              onClick={handleClear}
              className="flex-1 border border-rim text-fg-2 hover:border-danger hover:text-danger px-4 py-2 text-sm font-mono transition-none"
            >
              [ Clear Token ]
            </button>
          </div>
          {saved && (
            <p className="text-xs font-mono text-ok">
              ● Token saved. Authenticated requests will use this token automatically.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
