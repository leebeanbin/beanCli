'use client';

import { useState } from 'react';

const ROLES = ['MANAGER', 'DBA', 'SECURITY_ADMIN', 'VIEWER'] as const;

// Minimal Base64url encoder (no external dep needed)
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
      <h1 className="text-2xl font-bold mb-6">Dev JWT Generator</h1>
      <p className="text-sm text-gray-500 mb-6">
        Development-only tool. Generates a HS256-signed JWT stored in localStorage.
        Must match <code className="bg-gray-100 px-1 rounded">JWT_SECRET</code> in .env.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject (actor)</label>
          <input
            type="text"
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">JWT Secret</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={!sub || !secret}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Generate Token
        </button>
      </div>

      {token && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Generated Token</h2>
          <textarea
            readOnly
            value={token}
            rows={5}
            className="w-full border border-gray-200 rounded px-3 py-2 text-xs font-mono bg-gray-50 resize-none"
          />
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="flex-1 bg-green-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-green-700 transition-colors"
            >
              {saved ? 'Saved to localStorage' : 'Save to localStorage'}
            </button>
            <button
              onClick={handleClear}
              className="flex-1 bg-gray-100 text-gray-700 rounded px-4 py-2 text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Clear Token
            </button>
          </div>
          {saved && (
            <p className="text-xs text-green-600">
              Token saved. Authenticated requests will use this token automatically.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
