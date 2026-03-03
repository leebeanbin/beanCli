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
      <pre className="bg-gray-50 rounded p-2 text-xs font-mono overflow-x-auto max-h-32">
        {display}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-blue-600 hover:underline mt-1"
        >
          {expanded ? 'Show less' : 'Show more'}
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
      <p className="text-sm text-gray-500">
        Please set a JWT token in the <a href="/auth" className="underline text-blue-600">Auth</a> page first.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Recovery / DLQ</h1>
        <button
          onClick={fetchFailed}
          className="text-xs px-3 py-1 border border-gray-300 rounded hover:border-blue-400 text-gray-600"
        >
          Refresh
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Failed change requests that may need manual intervention or revert.
      </p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : error ? (
        <p className="text-gray-500 text-sm">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-green-600 text-sm font-medium">✓ No failed changes — system is healthy.</p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-lg p-4 shadow-sm border border-red-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs text-gray-500">{item.id.slice(0, 8)}…</span>
                <StatusBadge status={item.status} />
                <span className="text-xs text-gray-500">{item.environment}</span>
                <span className={`text-xs font-mono ${item.risk_level === 'L2' ? 'text-red-600 font-bold' : 'text-yellow-600'}`}>
                  {item.risk_level}
                </span>
              </div>

              <div className="text-xs text-gray-600 mb-2">
                <span className="font-medium">Actor:</span> {item.actor} &nbsp;|&nbsp;
                <span className="font-medium">Table:</span> <code>{item.target_table}</code>
              </div>

              {item.failure_reason && (
                <div className="border border-red-200 rounded p-2 mb-2 bg-red-50">
                  <p className="text-xs font-medium text-red-700 mb-1">Failure Reason</p>
                  <pre className="text-xs text-red-600 overflow-x-auto whitespace-pre-wrap">{item.failure_reason}</pre>
                </div>
              )}

              <SqlBlock sql={item.sql_statement} />

              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-gray-400">
                  Created: {new Date(item.created_at).toLocaleString()}
                </span>
                <button
                  onClick={() => router.push('/changes?sql=' + encodeURIComponent(item.sql_statement))}
                  className="text-xs px-3 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded hover:bg-blue-100"
                >
                  New Change from This
                </button>
              </div>
            </div>
          ))}
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
