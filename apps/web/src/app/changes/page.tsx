'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChangeTable } from '../../components/ChangeTable';
import { apiClient, getToken } from '../../lib/api';
import type { ChangeRow } from '../../components/ChangeTable';

type StatusFilter = 'ALL' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'DONE' | 'FAILED';
const STATUS_TABS: StatusFilter[] = ['ALL', 'DRAFT', 'PENDING', 'APPROVED', 'DONE', 'FAILED'];

function ChangesPageContent() {
  const searchParams = useSearchParams();
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const [sql, setSql] = useState(() => searchParams.get('sql') ?? '');
  const [environment, setEnvironment] = useState('DEV');
  const [submitting, setSubmitting] = useState(false);

  const fetchChanges = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<{ items: ChangeRow[]; total: number }>(
      '/api/v1/changes?limit=50',
    );
    if (res.ok && res.data) {
      setChanges(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
    } else {
      setError(res.error ?? 'Failed to load changes');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchChanges();
  }, [fetchChanges]);

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

  async function handleRevert(id: string) {
    await apiClient.post(`/api/v1/changes/${id}/revert`);
    await fetchChanges();
  }

  const filteredChanges =
    statusFilter === 'ALL'
      ? changes
      : changes.filter((c) => (c as ChangeRow & { status?: string }).status?.toUpperCase() === statusFilter);

  if (!getToken()) {
    return (
      <div className="font-pixel text-xl text-fg-2">
        Please set a JWT token in the{' '}
        <a href="/auth" className="text-accent hover:underline">
          Auth
        </a>{' '}
        page first.
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ Change Requests ]</h1>

      {/* New change form */}
      <form onSubmit={handleCreate} className="bg-bg-2 border border-rim shadow-px p-4 mb-6">
        <div className="font-pixel text-xl text-fg-2 mb-3">[ New Change Request ]</div>
        <div className="mb-3">
          <label className="block font-pixel text-lg text-fg-2 mb-1">SQL Statement</label>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={4}
            className="w-full font-mono text-sm bg-bg border border-rim text-fg px-3 py-2 focus:outline-none focus:border-accent"
            placeholder="SELECT * FROM state_users WHERE id = '...';"
          />
        </div>
        <div className="mb-3 flex gap-4 items-center">
          <span className="font-pixel text-lg text-fg-2">Environment:</span>
          {(['DEV', 'LOCAL', 'PROD'] as const).map((env) => (
            <label
              key={env}
              className="flex items-center gap-1 font-pixel text-lg text-fg cursor-pointer"
            >
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
          className="px-3 py-1 font-pixel text-xl border border-accent text-accent hover:bg-accent hover:text-bg shadow-px-a disabled:opacity-40 disabled:cursor-not-allowed transition-none"
        >
          {submitting ? 'Creating…' : '[ Create Change ]'}
        </button>
      </form>

      {/* Changes list */}
      <div className="bg-bg-2 border border-rim shadow-px p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-pixel text-xl text-fg-2">[ All Changes ({total}) ]</div>
          <button
            onClick={() => void fetchChanges()}
            className="font-pixel text-lg text-fg-2 hover:text-accent border border-rim hover:border-accent px-2 py-0.5 transition-none"
          >
            Refresh
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 mb-3 flex-wrap">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`font-pixel text-lg px-2 py-0.5 border transition-none ${
                statusFilter === s
                  ? 'border-accent text-accent bg-accent/10'
                  : 'border-rim text-fg-2 hover:border-accent hover:text-accent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-fg-2 text-xs font-mono">Loading…</p>
        ) : (
          <ChangeTable
            rows={filteredChanges}
            onSubmit={handleSubmit}
            onExecute={handleExecute}
            onRevert={handleRevert}
          />
        )}
      </div>
    </div>
  );
}

export default function ChangesPage() {
  return (
    <Suspense fallback={<p className="text-fg-2 text-xs font-mono">Loading…</p>}>
      <ChangesPageContent />
    </Suspense>
  );
}
