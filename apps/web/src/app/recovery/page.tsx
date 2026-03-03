'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AccessGuard } from '../../components/AccessGuard';
import { StatusBadge } from '../../components/StatusBadge';
import { apiClient, getToken } from '../../lib/api';

interface FailedChange {
  id: string;
  actor: string;
  status: string;
  target_table: string;
  sql_statement: string;
  failure_reason: string;
  risk_level: string;
  environment: string;
  created_at: string;
}

function SqlBlock({ sql }: { sql: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = sql.length > 200;
  const display = isLong && !expanded ? sql.slice(0, 200) + '…' : sql;

  return (
    <div>
      <pre className="bg-bg border border-rim p-2 text-xs font-mono overflow-x-auto max-h-32 text-fg">
        {display}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs font-mono text-accent hover:underline mt-1"
        >
          {expanded ? '[ Show less ]' : '[ Show more ]'}
        </button>
      )}
    </div>
  );
}

function RecoveryContent() {
  const router = useRouter();
  const [items, setItems] = useState<FailedChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFailed = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiClient.get<{ items: FailedChange[]; total: number }>(
      '/api/v1/changes',
      { status: 'FAILED', limit: '50' },
    );
    if (res.ok && res.data) {
      setItems(res.data.items ?? []);
    } else {
      setError(res.error ?? 'Could not load data — API may be offline.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchFailed(); }, [fetchFailed]);

  if (!getToken()) {
    return (
      <p className="text-xs font-mono text-fg-2">
        Please set a JWT token in the{' '}
        <a href="/auth" className="text-accent hover:underline">Auth</a> page first.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-pixel text-3xl text-fg">[ Recovery / DLQ ]</h1>
        <button
          onClick={fetchFailed}
          className="text-xs font-mono text-fg-2 hover:text-accent border border-rim hover:border-accent px-2 py-0.5 transition-none"
        >
          Refresh
        </button>
      </div>
      <p className="text-xs font-mono text-fg-2 mb-6">
        Failed change requests that may need manual intervention or revert.
      </p>

      {loading ? (
        <p className="text-fg-2 text-xs font-mono">Loading…</p>
      ) : error ? (
        <p className="text-fg-2 text-xs font-mono">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-ok text-xs font-mono">● No failed changes — system is healthy.</p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const riskCls = item.risk_level === 'L2'
              ? 'text-danger font-bold'
              : 'text-warn';
            return (
              <div key={item.id} className="bg-bg-2 border border-danger shadow-px-d p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-xs text-fg-2">{item.id.slice(0, 8)}…</span>
                  <StatusBadge status={item.status} />
                  <span className="text-xs font-mono text-fg-2">{item.environment}</span>
                  <span className={`text-xs font-mono ${riskCls}`}>{item.risk_level}</span>
                </div>

                <div className="text-xs font-mono text-fg-2 mb-2">
                  <span className="text-fg">Actor:</span> {item.actor} &nbsp;|&nbsp;
                  <span className="text-fg">Table:</span>{' '}
                  <code className="text-accent">{item.target_table}</code>
                </div>

                {item.failure_reason && (
                  <div className="border border-danger p-2 mb-2 bg-bg">
                    <p className="text-xs font-mono text-danger mb-1">Failure Reason</p>
                    <pre className="text-xs text-danger overflow-x-auto whitespace-pre-wrap">{item.failure_reason}</pre>
                  </div>
                )}

                <SqlBlock sql={item.sql_statement} />

                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs font-mono text-fg-2">
                    Created: {new Date(item.created_at).toLocaleString()}
                  </span>
                  <button
                    onClick={() => router.push('/changes?sql=' + encodeURIComponent(item.sql_statement))}
                    className="text-xs font-mono px-3 py-1 border border-accent text-accent hover:bg-accent hover:text-bg shadow-px-a transition-none"
                  >
                    [ New Change from This ]
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RecoveryPage() {
  return (
    <AccessGuard page="dlqBrowser">
      <RecoveryContent />
    </AccessGuard>
  );
}
