'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../lib/api';

interface ChangeRow {
  id?: string | number;
  sql?: string;
  status?: string;
  environment?: string;
  risk_level?: string;
  created_at?: string;
  error_message?: string;
}

interface ChangesResponse {
  items?: ChangeRow[];
  total?: number;
}

export default function RecoveryPage() {
  const router = useRouter();
  const [items, setItems] = useState<ChangeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | number | null>(null);

  const fetchFailed = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<ChangesResponse | ChangeRow[]>(
      '/api/v1/changes?status=FAILED&limit=50',
    );
    if (res.ok && res.data) {
      const data = res.data;
      if (Array.isArray(data)) {
        setItems(data);
        setTotal(data.length);
      } else {
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
      }
      setError(null);
    } else {
      setError(res.error ?? 'Failed to load recovery queue');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchFailed();
  }, [fetchFailed]);

  function resubmit(sql: string) {
    router.push(`/changes?sql=${encodeURIComponent(sql)}`);
  }

  const STATUS_COLORS: Record<string, string> = {
    FAILED: 'text-danger',
    CANCELLED: 'text-fg-2',
    DONE: 'text-ok',
    EXECUTING: 'text-accent',
  };

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ DLQ Recovery ]</h1>

      <div className="bg-bg-2 border border-rim shadow-px p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-pixel text-xl text-fg-2">[ Failed Changes ({total}) ]</div>
          <button
            onClick={() => void fetchFailed()}
            className="font-pixel text-lg text-fg-2 hover:text-accent border border-rim hover:border-accent px-2 py-0.5 transition-none"
          >
            Refresh
          </button>
        </div>
        {error && <p className="text-danger text-xs font-mono mb-2">{error}</p>}
        {loading ? (
          <p className="text-fg-2 text-xs font-mono">Loading…</p>
        ) : items.length === 0 ? (
          <div className="font-pixel text-xl text-ok py-4">No failed changes. Queue is clean.</div>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => {
              const id = item.id ?? i;
              const isOpen = expanded === id;
              return (
                <div key={String(id)} className="border border-rim bg-bg">
                  <div
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-bg-2"
                    onClick={() => setExpanded(isOpen ? null : id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-fg-2">#{String(id)}</span>
                      <span
                        className={`font-pixel text-lg ${STATUS_COLORS[item.status ?? ''] ?? 'text-fg'}`}
                      >
                        {item.status ?? '—'}
                      </span>
                      {item.environment && (
                        <span className="font-mono text-xs text-fg-2">[{item.environment}]</span>
                      )}
                      <span className="font-mono text-xs text-fg truncate max-w-sm">
                        {item.sql?.slice(0, 60) ?? '—'}
                        {(item.sql?.length ?? 0) > 60 ? '…' : ''}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-fg-2">{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {isOpen && (
                    <div className="px-3 pb-3 border-t border-rim">
                      {item.error_message && (
                        <div className="font-mono text-xs text-danger bg-bg-2 border border-danger px-2 py-1 my-2">
                          Error: {item.error_message}
                        </div>
                      )}
                      {item.sql && (
                        <pre className="font-mono text-xs text-fg bg-bg border border-rim px-3 py-2 my-2 overflow-x-auto whitespace-pre-wrap">
                          {item.sql}
                        </pre>
                      )}
                      <div className="flex gap-2 mt-2">
                        {item.sql && (
                          <button
                            onClick={() => resubmit(item.sql!)}
                            className="px-3 py-1 font-pixel text-lg border border-accent text-accent hover:bg-accent hover:text-bg transition-none"
                          >
                            Re-submit as new Change
                          </button>
                        )}
                        <span className="font-mono text-xs text-fg-2 self-center">
                          {item.created_at
                            ? new Date(item.created_at).toLocaleString()
                            : ''}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
