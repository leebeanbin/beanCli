'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChangeTable } from '../../components/ChangeTable';
import { apiClient, getToken } from '../../lib/api';
import type { ChangeRow } from '../../components/ChangeTable';

export default function ChangesPage() {
  const searchParams = useSearchParams();
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sql, setSql] = useState(() => searchParams.get('sql') ?? '');
  const [environment, setEnvironment] = useState('DEV');
  const [submitting, setSubmitting] = useState(false);

  const fetchChanges = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<{ items: ChangeRow[]; total: number }>('/api/v1/changes?limit=50');
    if (res.ok && res.data) {
      setChanges(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
    } else {
      setError(res.error ?? 'Failed to load changes');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchChanges(); }, [fetchChanges]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!sql.trim()) return;
    setSubmitting(true);
    const res = await apiClient.post('/api/v1/changes', { sql, environment });
    if (res.ok) {
      setSql('');
      await fetchChanges();
    } else {
      setError(res.error ?? 'Failed to create change');
    }
    setSubmitting(false);
  }

  async function handleSubmit(id: string) {
    await apiClient.post(`/api/v1/changes/${id}/submit`);
    await fetchChanges();
  }

  async function handleExecute(id: string) {
    await apiClient.post(`/api/v1/changes/${id}/execute`);
    await fetchChanges();
  }

  if (!getToken()) {
    return (
      <div className="text-xs font-mono text-fg-2">
        Please set a JWT token in the{' '}
        <a href="/auth" className="text-accent hover:underline">Auth</a> page first.
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ Change Requests ]</h1>

      {/* New change form */}
      <form onSubmit={handleCreate} className="bg-bg-2 border border-rim shadow-px p-4 mb-6">
        <div className="text-xs text-fg-2 font-mono uppercase tracking-widest mb-3">[ New Change Request ]</div>
        <div className="mb-3">
          <label className="block text-xs font-mono text-fg-2 uppercase tracking-widest mb-1">SQL Statement</label>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={4}
            className="w-full font-mono text-sm bg-bg border border-rim text-fg px-3 py-2 focus:outline-none focus:border-accent"
            placeholder="SELECT * FROM state_users WHERE id = '...';"
          />
        </div>
        <div className="mb-3 flex gap-4 items-center">
          <span className="text-xs font-mono text-fg-2 uppercase tracking-widest">Environment:</span>
          {(['DEV', 'LOCAL', 'PROD'] as const).map((env) => (
            <label key={env} className="flex items-center gap-1 text-xs font-mono text-fg cursor-pointer">
              <input
                type="radio"
                value={env}
                checked={environment === env}
                onChange={(e) => setEnvironment(e.target.value)}
                className="accent-accent"
              />
              {env}
            </label>
          ))}
        </div>
        {error && <p className="text-danger text-xs font-mono mb-2">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !sql.trim()}
          className="px-3 py-1 text-xs font-mono border border-accent text-accent hover:bg-accent hover:text-bg shadow-px-a disabled:opacity-40 disabled:cursor-not-allowed transition-none"
        >
          {submitting ? 'Creating…' : '[ Create Change ]'}
        </button>
      </form>

      {/* Changes list */}
      <div className="bg-bg-2 border border-rim shadow-px p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-fg-2 font-mono uppercase tracking-widest">
            [ All Changes ({total}) ]
          </div>
          <button
            onClick={fetchChanges}
            className="text-xs font-mono text-fg-2 hover:text-accent border border-rim hover:border-accent px-2 py-0.5 transition-none"
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="text-fg-2 text-xs font-mono">Loading…</p>
        ) : (
          <ChangeTable rows={changes} onSubmit={handleSubmit} onExecute={handleExecute} />
        )}
      </div>
    </div>
  );
}
