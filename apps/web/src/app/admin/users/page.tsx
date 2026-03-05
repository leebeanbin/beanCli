'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { getToken } from '../../../lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

const VALID_ROLES = ['ANALYST', 'MANAGER', 'DBA', 'SECURITY_ADMIN'] as const;
type Role = typeof VALID_ROLES[number];

interface UserRow {
  username: string;
  role: Role;
  active: boolean;
  created_at: string;
}

function roleBadge(role: Role): string {
  switch (role) {
    case 'DBA': return 'text-accent border-accent';
    case 'MANAGER': return 'text-ok border-ok';
    case 'SECURITY_ADMIN': return 'text-danger border-danger';
    default: return 'text-fg-2 border-rim';
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

// ── Create User Modal ─────────────────────────────────────────────────────────
function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('ANALYST');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ username, password, role }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return; }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-2 border border-rim shadow-px-a w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-pixel text-xl text-fg">[ Create User ]</h2>
          <button onClick={onClose} className="font-pixel text-lg text-fg-2 hover:text-danger px-1">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block font-pixel text-base text-fg-2 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={64}
              autoFocus
              className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-1.5 focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block font-pixel text-base text-fg-2 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-1.5 focus:outline-none focus:border-accent"
            />
            <p className="text-xs font-mono text-fg-2 opacity-50 mt-0.5">Min 8 characters</p>
          </div>

          <div>
            <label className="block font-pixel text-base text-fg-2 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full bg-bg border border-rim text-fg font-mono text-sm px-3 py-1.5 focus:outline-none focus:border-accent"
            >
              {VALID_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {error && (
            <p className="text-xs font-mono text-danger border border-danger px-3 py-2 bg-danger/10">
              ✗ {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading || !username || !password || password.length < 8}
              className="flex-1 border border-accent text-accent hover:bg-accent hover:text-bg px-4 py-1.5 font-pixel text-base shadow-px-a disabled:opacity-40 disabled:cursor-not-allowed transition-none"
            >
              {loading ? '[ Creating... ]' : '[ Create ]'}
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
      </div>
    </div>
  );
}

// ── Change Password Modal ─────────────────────────────────────────────────────
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
      const res = await fetch(`${API_BASE}/api/v1/auth/change-password`, {
        method: 'POST',
        headers: authHeaders(),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-2 border border-rim shadow-px-a w-full max-w-sm p-6">
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

// ── Rename User Modal ─────────────────────────────────────────────────────────
function RenameModal({
  target,
  isSelf,
  onClose,
  onRenamed,
}: {
  target: UserRow;
  isSelf: boolean;
  onClose: () => void;
  onRenamed: (selfRenamed: boolean) => void;
}) {
  const [newUsername, setNewUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/${encodeURIComponent(target.username)}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ newUsername }),
      });
      const data = (await res.json()) as { error?: string; selfRenamed?: boolean };
      if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return; }
      onRenamed(data.selfRenamed === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-2 border border-rim shadow-px-a w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-pixel text-xl text-fg">[ Rename User ]</h2>
          <button onClick={onClose} className="font-pixel text-lg text-fg-2 hover:text-danger px-1">✕</button>
        </div>

        <p className="text-xs font-mono text-fg-2 mb-3">
          Renaming: <span className="text-fg">{target.username}</span>
        </p>

        {isSelf && (
          <p className="text-xs font-mono text-warn border border-warn px-3 py-2 bg-warn/10 mb-3">
            ⚠ You will be logged out after renaming your own account.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block font-pixel text-base text-fg-2 mb-1">New Username</label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
              minLength={3}
              maxLength={64}
              autoFocus
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
              disabled={loading || newUsername.length < 3}
              className="flex-1 border border-accent text-accent hover:bg-accent hover:text-bg px-4 py-1.5 font-pixel text-base shadow-px-a disabled:opacity-40 disabled:cursor-not-allowed transition-none"
            >
              {loading ? '[ Renaming... ]' : '[ Rename ]'}
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
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [renameTarget, setRenameTarget] = useState<UserRow | null>(null);
  const [actionError, setActionError] = useState('');

  // Access guard: DBA only
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'DBA') {
      router.replace('/');
    }
  }, [user, router]);

  const loadUsers = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/users`, { headers: authHeaders() });
      const data = (await res.json()) as { items?: UserRow[]; error?: string };
      if (!res.ok) { setLoadError(data.error ?? `Error ${res.status}`); return; }
      setUsers(data.items ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Network error');
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function handleRoleChange(username: string, role: Role) {
    setActionError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/${encodeURIComponent(username)}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ role }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setActionError(data.error ?? `Error ${res.status}`); return; }
      await loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Network error');
    }
  }

  async function handleToggleActive(username: string, currentlyActive: boolean) {
    setActionError('');
    try {
      if (currentlyActive) {
        // Deactivate via DELETE
        const res = await fetch(`${API_BASE}/api/v1/users/${encodeURIComponent(username)}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) { setActionError(data.error ?? `Error ${res.status}`); return; }
      } else {
        // Reactivate via PATCH
        const res = await fetch(`${API_BASE}/api/v1/users/${encodeURIComponent(username)}`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ active: true }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) { setActionError(data.error ?? `Error ${res.status}`); return; }
      }
      await loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Network error');
    }
  }

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase()),
  );

  if (!user || user.role !== 'DBA') {
    return null;
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-pixel text-2xl text-fg">[ User Management ]</h1>
          <p className="text-xs font-mono text-fg-2 opacity-70">Manage system accounts and roles</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowChangePwd(true)}
            className="border border-rim text-fg-2 hover:text-accent hover:border-accent px-3 py-1.5 font-pixel text-sm transition-none"
          >
            Change Password
          </button>
          {user.role === 'DBA' && (
            <button
              onClick={() => setShowCreate(true)}
              className="border border-accent text-accent hover:bg-accent hover:text-bg px-3 py-1.5 font-pixel text-base shadow-px-a transition-none"
            >
              + Create User
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search users..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-xs bg-bg border border-rim text-fg font-mono text-sm px-3 py-1.5 focus:outline-none focus:border-accent"
      />

      {/* Errors */}
      {(loadError || actionError) && (
        <p className="text-xs font-mono text-danger border border-danger px-3 py-2 bg-danger/10">
          ✗ {loadError || actionError}
        </p>
      )}

      {/* Table */}
      <div className="border border-rim bg-bg-2 overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="border-b border-rim">
              <th className="text-left px-3 py-2 font-pixel text-base text-fg-2">USERNAME</th>
              <th className="text-left px-3 py-2 font-pixel text-base text-fg-2">ROLE</th>
              <th className="text-left px-3 py-2 font-pixel text-base text-fg-2">STATUS</th>
              <th className="text-left px-3 py-2 font-pixel text-base text-fg-2">CREATED</th>
              <th className="text-left px-3 py-2 font-pixel text-base text-fg-2">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-fg-2 opacity-50">
                  {users.length === 0 ? 'No users found' : 'No users match search'}
                </td>
              </tr>
            )}
            {filtered.map((u) => {
              const isSelf = u.username === user.sub;
              const isEditable = !isSelf && user.role === 'DBA';
              return (
                <tr key={u.username} className={`border-b border-rim/50 ${u.active ? '' : 'opacity-50'}`}>
                  {/* Username */}
                  <td className="px-3 py-2">
                    <span className={`font-mono text-sm ${isSelf ? 'text-accent' : 'text-fg'}`}>
                      {u.username}
                      {isSelf && <span className="text-xs text-fg-2 ml-1">(you)</span>}
                    </span>
                  </td>

                  {/* Role badge + dropdown */}
                  <td className="px-3 py-2">
                    {isEditable ? (
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.username, e.target.value as Role)}
                        className={`bg-bg border font-pixel text-base px-2 py-0.5 focus:outline-none cursor-pointer ${roleBadge(u.role)}`}
                      >
                        {VALID_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : (
                      <span className={`border font-pixel text-base px-2 py-0.5 ${roleBadge(u.role)}`}>
                        {u.role}
                      </span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2">
                    <span className={`font-mono text-xs ${u.active ? 'text-ok' : 'text-fg-2'}`}>
                      {u.active ? '● Active' : '○ Inactive'}
                    </span>
                  </td>

                  {/* Created */}
                  <td className="px-3 py-2 text-xs text-fg-2">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {user.role === 'DBA' && (
                        <button
                          onClick={() => setRenameTarget(u)}
                          className="border border-accent text-accent hover:bg-accent hover:text-bg px-2 py-0.5 font-pixel text-sm transition-none"
                        >
                          Rename
                        </button>
                      )}
                      {isEditable ? (
                        <button
                          onClick={() => handleToggleActive(u.username, u.active)}
                          className={`border px-2 py-0.5 font-pixel text-sm transition-none ${
                            u.active
                              ? 'border-danger text-danger hover:bg-danger hover:text-bg'
                              : 'border-ok text-ok hover:bg-ok hover:text-bg'
                          }`}
                        >
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                      ) : !isSelf ? (
                        <span className="text-xs text-fg-2 opacity-40">—</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs font-mono text-fg-2 opacity-50">
        {users.length} user{users.length !== 1 ? 's' : ''} total
      </p>

      {/* Modals */}
      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={loadUsers} />
      )}
      {showChangePwd && (
        <ChangePasswordModal onClose={() => setShowChangePwd(false)} />
      )}
      {renameTarget && (
        <RenameModal
          target={renameTarget}
          isSelf={renameTarget.username === user.sub}
          onClose={() => setRenameTarget(null)}
          onRenamed={(selfRenamed) => {
            setRenameTarget(null);
            if (selfRenamed) {
              logout();
            } else {
              void loadUsers();
            }
          }}
        />
      )}
    </div>
  );
}
