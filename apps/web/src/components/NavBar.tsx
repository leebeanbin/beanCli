'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { LangToggle } from './LangToggle';
import { useLang } from '../lib/i18n';
import { getActiveConnection, type DbConnection } from '../lib/connections';
import { useAuth } from '../context/AuthContext';
import { getToken } from '../lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

// ── Change Password Modal ────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError('New passwords do not match'); return; }
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/v1/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return; }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-bg-2 border border-rim shadow-px-a w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-pixel text-xl text-fg">[ Change Password ]</h2>
          <button onClick={onClose} className="font-pixel text-lg text-fg-2 hover:text-danger px-1">✕</button>
        </div>

        {success ? (
          <div className="space-y-4">
            <p className="text-sm font-mono text-ok border border-ok px-3 py-2 bg-ok/10">
              ✓ Password changed successfully.
            </p>
            <button onClick={onClose} className="w-full border border-rim text-fg-2 hover:text-fg px-4 py-1.5 font-pixel text-base transition-none">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block font-pixel text-base text-fg-2 mb-1">Current Password</label>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoFocus
                autoComplete="current-password"
                className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-1.5 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block font-pixel text-base text-fg-2 mb-1">New Password</label>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-1.5 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block font-pixel text-base text-fg-2 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-1.5 focus:outline-none focus:border-accent"
              />
            </div>

            {error && (
              <p className="text-xs font-mono text-danger border border-danger px-3 py-2 bg-danger/10">
                ✗ {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={loading || !current || !next || next.length < 8 || next !== confirm}
                className="flex-1 border border-accent text-accent hover:bg-accent hover:text-bg px-4 py-1.5 font-pixel text-base shadow-px-a disabled:opacity-40 disabled:cursor-not-allowed transition-none"
              >
                {loading ? '[ Saving... ]' : '[ Change Password ]'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="border border-rim text-fg-2 hover:text-fg px-4 py-1.5 font-pixel text-base transition-none"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── NavBar ───────────────────────────────────────────────────────────────────
export function NavBar() {
  const pathname = usePathname();
  const router   = useRouter();
  const isHome   = pathname === '/';
  const [activeConn, setActiveConn] = useState<DbConnection | null>(null);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const { user, logout } = useAuth();

  useEffect(() => {
    setActiveConn(getActiveConnection());
    const onFocus = () => setActiveConn(getActiveConnection());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [pathname]);
  const { t } = useLang();

  const isAdmin = user?.role === 'DBA' || user?.role === 'SECURITY_ADMIN';

  type NavLeaf = { label: string; href: string; desc?: string };
  type NavGroup = { label: string; children: NavLeaf[] };
  type NavItem = NavLeaf | NavGroup;

  function isGroup(item: NavItem): item is NavGroup {
    return 'children' in item;
  }

  const NAV: NavItem[] = [
    { label: 'Dashboard', href: '/' },
    {
      label: 'Data',
      children: [
        { href: '/query',   label: 'Query',   desc: t('nav.query.desc') },
        { href: '/explore', label: 'Explore', desc: t('nav.explore.desc') },
        { href: '/schema',  label: 'Schema',  desc: t('nav.schema.desc') },
      ],
    },
    {
      label: 'Ops',
      children: [
        { href: '/monitor',  label: 'Monitor',  desc: t('nav.monitor.desc') },
        { href: '/indexes',  label: 'Indexes',  desc: t('nav.indexes.desc') },
        { href: '/audit',    label: 'Audit',    desc: t('nav.audit.desc') },
        { href: '/recovery', label: 'Recovery', desc: t('nav.recovery.desc') },
      ],
    },
    {
      label: 'Changes',
      children: [
        { href: '/changes',   label: 'Changes',   desc: t('nav.changes.desc') },
        { href: '/approvals', label: 'Approvals', desc: t('nav.approvals.desc') },
      ],
    },
    { label: 'Connections', href: '/connections', desc: t('nav.connections.desc') },
  ];

  return (
    <>
      <nav className="bg-bg-2 border-b-2 border-rim px-3" style={{ height: '44px' }}>
        <div className="flex items-center h-full gap-0.5">

          {/* ← Back */}
          {!isHome && (
            <button
              onClick={() => router.back()}
              className="font-pixel text-lg text-fg-2 hover:text-accent px-2 h-full flex items-center border-b-2 border-transparent hover:border-accent transition-none shrink-0 gap-1"
              title="Go back"
            >
              ◀ Back
            </button>
          )}

          {/* Logo */}
          <Link
            href="/"
            className={`font-pixel text-xl text-accent tracking-widest h-full flex items-center px-3 border-b-2 border-transparent hover:text-fg transition-none shrink-0 ${!isHome ? 'border-l border-rim ml-1' : ''}`}
          >
            BeanCLI
          </Link>

          {/* Separator */}
          <div className="w-px h-5 bg-rim mx-1 shrink-0" />

          {/* Nav items */}
          {NAV.map((item) =>
            isGroup(item) ? (
              <div key={item.label} className="relative group h-full flex items-center">
                <button className="font-pixel text-lg text-fg-2 hover:text-accent px-2.5 h-full border-b-2 border-transparent group-hover:border-accent group-hover:text-accent transition-none flex items-center gap-1">
                  {item.label}
                  <span className="text-xs opacity-50">▾</span>
                </button>
                <div className="absolute top-full left-0 hidden group-hover:block bg-bg-2 border border-rim shadow-px-a z-50 min-w-40">
                  <div className="px-2 pt-1 pb-0.5 font-pixel text-base text-fg-2 border-b border-rim">
                    [ {item.label} ]
                  </div>
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className="block px-3 py-1.5 hover:bg-accent hover:text-bg transition-none group/item"
                    >
                      <div className="font-pixel text-lg text-fg group-hover/item:text-bg">{child.label}</div>
                      {child.desc && (
                        <div className="font-mono text-xs text-fg-2 group-hover/item:text-bg opacity-80">{child.desc}</div>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <Link
                key={(item as NavLeaf).href}
                href={(item as NavLeaf).href}
                className={`font-pixel text-lg text-fg-2 hover:text-accent px-2.5 h-full flex items-center border-b-2 border-transparent hover:border-accent transition-none ${pathname === (item as NavLeaf).href ? 'border-accent text-accent' : ''}`}
              >
                {item.label}
              </Link>
            ),
          )}

          {/* Admin (DBA / SECURITY_ADMIN only) */}
          {isAdmin && (
            <Link
              href="/admin/users"
              className={`font-pixel text-lg text-fg-2 hover:text-accent px-2.5 h-full flex items-center border-b-2 border-transparent hover:border-accent transition-none ${pathname.startsWith('/admin') ? 'border-accent text-accent' : ''}`}
            >
              Admin
            </Link>
          )}

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-3">
            {/* Active connection indicator */}
            <Link
              href="/connections"
              className="flex items-center gap-1.5 font-pixel text-sm hover:text-accent transition-none"
              title={activeConn ? `Connected: ${activeConn.label}` : 'No active connection'}
            >
              <span className={activeConn ? 'text-ok' : 'text-fg-2 opacity-50'}>
                {activeConn ? '●' : '○'}
              </span>
              <span className={activeConn ? 'text-ok' : 'text-fg-2 opacity-50'}>
                {activeConn ? activeConn.label : 'No conn'}
              </span>
            </Link>

            {/* User / session */}
            {user && (
              <div className="flex items-center gap-2 border-l border-rim pl-3">
                <button
                  onClick={() => setShowChangePwd(true)}
                  title="Change password"
                  className="font-mono text-xs text-fg-2 hover:text-accent transition-none hidden sm:block"
                >
                  <span className="text-accent">{user.sub}</span>
                  <span className="opacity-50 ml-1">[{user.role}]</span>
                </button>
                <button
                  onClick={logout}
                  title="Sign out"
                  className="font-pixel text-sm text-fg-2 hover:text-danger transition-none px-1"
                >
                  ⏻
                </button>
              </div>
            )}

            <LangToggle />
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {showChangePwd && (
        <ChangePasswordModal onClose={() => setShowChangePwd(false)} />
      )}
    </>
  );
}
