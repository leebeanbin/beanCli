'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../lib/api';

interface AuditEvent {
  id?: number | string;
  actor?: string;
  action?: string;
  resource?: string;
  category?: string;
  details?: unknown;
  created_at_ms?: number;
  created_at?: string;
}

interface AuditResponse {
  items?: AuditEvent[];
  total?: number;
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [actor, setActor] = useState('');

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (category) params.set('category', category);
    if (actor) params.set('actor', actor);
    const res = await apiClient.get<AuditResponse | AuditEvent[]>(
      `/api/v1/audit?${params.toString()}`,
    );
    if (res.ok && res.data) {
      const data = res.data;
      if (Array.isArray(data)) {
        setEvents(data);
        setTotal(data.length);
      } else {
        setEvents(data.items ?? []);
        setTotal(data.total ?? 0);
      }
      setError(null);
    } else {
      setError(res.error ?? 'Failed to load audit log');
    }
    setLoading(false);
  }, [category, actor]);

  useEffect(() => {
    void fetchAudit();
  }, [fetchAudit]);

  function formatTime(evt: AuditEvent) {
    if (evt.created_at_ms) return new Date(evt.created_at_ms).toLocaleString();
    if (evt.created_at) return new Date(evt.created_at).toLocaleString();
    return '—';
  }

  const CATEGORY_COLORS: Record<string, string> = {
    AUTH: 'text-ok',
    CHANGE: 'text-accent',
    APPROVAL: 'text-warn',
    SYSTEM: 'text-fg-2',
  };

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ Audit Log ]</h1>

      {/* Filters */}
      <div className="bg-bg-2 border border-rim shadow-px p-4 mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block font-pixel text-lg text-fg-2 mb-1">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="font-mono text-sm bg-bg border border-rim text-fg px-2 py-1 focus:outline-none focus:border-accent"
              placeholder="AUTH, CHANGE…"
            />
          </div>
          <div>
            <label className="block font-pixel text-lg text-fg-2 mb-1">Actor</label>
            <input
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className="font-mono text-sm bg-bg border border-rim text-fg px-2 py-1 focus:outline-none focus:border-accent"
              placeholder="username…"
            />
          </div>
          <button
            onClick={() => void fetchAudit()}
            className="px-3 py-1 font-pixel text-xl border border-accent text-accent hover:bg-accent hover:text-bg transition-none"
          >
            [ Filter ]
          </button>
        </div>
      </div>

      <div className="bg-bg-2 border border-rim shadow-px p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-pixel text-xl text-fg-2">[ Events ({total}) ]</div>
          <button
            onClick={() => void fetchAudit()}
            className="font-pixel text-lg text-fg-2 hover:text-accent border border-rim hover:border-accent px-2 py-0.5 transition-none"
          >
            Refresh
          </button>
        </div>
        {error && <p className="text-danger text-xs font-mono mb-2">{error}</p>}
        {loading ? (
          <p className="text-fg-2 text-xs font-mono">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr>
                  {['Time', 'Category', 'Actor', 'Action', 'Resource'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-2 py-1 font-pixel text-lg text-fg-2 border-b border-rim"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((evt, i) => (
                  <tr key={i} className="border-b border-rim hover:bg-bg">
                    <td className="px-2 py-1 text-fg-2 whitespace-nowrap">{formatTime(evt)}</td>
                    <td className={`px-2 py-1 ${CATEGORY_COLORS[evt.category ?? ''] ?? 'text-fg'}`}>
                      {evt.category ?? '—'}
                    </td>
                    <td className="px-2 py-1 text-fg">{evt.actor ?? '—'}</td>
                    <td className="px-2 py-1 text-fg">{evt.action ?? '—'}</td>
                    <td className="px-2 py-1 text-fg-2">{evt.resource ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
