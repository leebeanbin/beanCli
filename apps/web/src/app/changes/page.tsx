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

  // New change form — pre-fill from ?sql= param if provided
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
      <div className="text-sm text-gray-500">
        Please set a JWT token in the <a href="/auth" className="underline text-blue-600">Auth</a> page first.
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Change Requests</h1>

      <form onSubmit={handleCreate} className="bg-white rounded-lg p-4 shadow-sm border mb-6">
        <h2 className="font-semibold mb-3">New Change Request</h2>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">SQL Statement</label>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={4}
            className="w-full font-mono text-sm border rounded p-2"
            placeholder="SELECT * FROM state_users WHERE id = '...';"
          />
        </div>
        <div className="mb-3 flex gap-3 items-center">
          <label className="text-sm font-medium text-gray-700">Environment:</label>
          {(['DEV', 'LOCAL', 'PROD'] as const).map((env) => (
            <label key={env} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                value={env}
                checked={environment === env}
                onChange={(e) => setEnvironment(e.target.value)}
              />
              {env}
            </label>
          ))}
        </div>
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !sql.trim()}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create Change'}
        </button>
      </form>

      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">All Changes ({total})</h2>
          <button onClick={fetchChanges} className="text-xs text-blue-600 hover:underline">Refresh</button>
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : (
          <ChangeTable rows={changes} onSubmit={handleSubmit} onExecute={handleExecute} />
        )}
      </div>
    </div>
  );
}
