'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '../../lib/api';
import { getActiveConnection, type DbConnection } from '../../lib/connections';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return columns.map(esc).join(',') + '\n' +
    rows.map((r) => columns.map((c) => esc(r[c])).join(',')).join('\n') + '\n';
}

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  duration?: number;
  error?: string;
}

function QueryPageContent() {
  const searchParams = useSearchParams();
  const [sql, setSql] = useState(() => searchParams.get('sql') ?? '');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [activeConn, setActiveConn] = useState<DbConnection | null>(null);
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    setActiveConn(getActiveConnection());
  }, []);

  const explain = useCallback(async () => {
    if (!sql.trim() || explaining) return;
    setExplaining(true);
    const explainSql = `EXPLAIN ANALYZE ${sql.trim()}`;
    let res: QueryResult;
    if (activeConn) {
      try {
        const r = await fetch(`${API_BASE}/api/v1/connections/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection: activeConn, sql: explainSql }),
        });
        const data = (await r.json()) as QueryResult & { error?: string };
        res = r.ok ? data : { columns: [], rows: [], rowCount: 0, error: data.error ?? `HTTP ${r.status}` };
      } catch (e) {
        res = { columns: [], rows: [], rowCount: 0, error: e instanceof Error ? e.message : 'Network error' };
      }
    } else {
      const apiRes = await apiClient.post<QueryResult>('/api/v1/schema/analyze', { sql: sql.trim() });
      res = apiRes.ok && apiRes.data ? apiRes.data : { columns: [], rows: [], rowCount: 0, error: apiRes.error ?? 'Explain failed' };
    }
    setResult(res);
    setExplaining(false);
  }, [sql, explaining, activeConn]);

  const execute = useCallback(async () => {
    if (!sql.trim() || running) return;
    setRunning(true);

    let res: QueryResult;
    if (activeConn) {
      // Use caller-supplied connection via the dedicated endpoint
      try {
        const r = await fetch(`${API_BASE}/api/v1/connections/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection: activeConn, sql }),
        });
        const data = (await r.json()) as QueryResult & { error?: string };
        res = r.ok ? data : { columns: [], rows: [], rowCount: 0, error: data.error ?? `HTTP ${r.status}` };
      } catch (e) {
        res = { columns: [], rows: [], rowCount: 0, error: e instanceof Error ? e.message : 'Network error' };
      }
    } else {
      const apiRes = await apiClient.post<QueryResult>('/api/v1/sql/execute', { sql });
      res = apiRes.ok && apiRes.data ? apiRes.data : { columns: [], rows: [], rowCount: 0, error: apiRes.error ?? 'Query failed' };
    }

    setResult(res);
    setRunning(false);
  }, [sql, running, activeConn]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void execute();
    }
  }

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ SQL Query ]</h1>

      {/* Active connection banner */}
      {activeConn ? (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 border border-ok/40 bg-ok/5">
          <span className="font-pixel text-base text-ok">● {activeConn.label}</span>
          <span className="font-mono text-xs text-fg-2">
            {activeConn.type} · {activeConn.host ?? ''}
            {activeConn.database ? `/${activeConn.database}` : ''}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 border border-warn/30 bg-warn/5">
          <span className="font-pixel text-base text-warn">◌ No active connection</span>
          <a href="/connections" className="font-pixel text-base text-accent underline">→ Connect</a>
          <span className="font-pixel text-base text-fg-2">(using API server pool)</span>
        </div>
      )}

      <div className="bg-bg-2 border border-rim shadow-px p-4 mb-4">
        <div className="font-pixel text-xl text-fg-2 mb-2">[ Editor ]</div>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={8}
          className="w-full font-mono text-sm bg-bg border border-rim text-fg px-3 py-2 focus:outline-none focus:border-accent resize-y"
          placeholder="SELECT * FROM state_users LIMIT 20;"
          spellCheck={false}
        />
        <div className="flex items-center gap-4 mt-2">
          <button
            onClick={() => void execute()}
            disabled={running || !sql.trim()}
            className="px-3 py-1 font-pixel text-xl border border-accent text-accent hover:bg-accent hover:text-bg shadow-px-a disabled:opacity-40 disabled:cursor-not-allowed transition-none"
          >
            {running ? 'Running…' : '[ Execute ]'}
          </button>
          <button
            onClick={() => void explain()}
            disabled={explaining || running || !sql.trim()}
            className="px-3 py-1 font-pixel text-xl border border-warn text-warn hover:bg-warn hover:text-bg shadow-px-a disabled:opacity-40 disabled:cursor-not-allowed transition-none"
            title="Run EXPLAIN ANALYZE on the query"
          >
            {explaining ? 'Explaining…' : '[ Explain ]'}
          </button>
          <span className="font-pixel text-lg text-fg-2">Ctrl+Enter to run</span>
          {result && !result.error && result.rows.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="font-pixel text-lg text-ok">
                {result.rowCount} rows{result.duration != null ? ` · ${result.duration}ms` : ''}
              </span>
              <button
                onClick={() => {
                  const ts = new Date().toISOString().replace(/[:.]/g, '-');
                  downloadBlob(
                    rowsToCsv(result.columns, result.rows),
                    `query_results_${ts}.csv`,
                    'text/csv',
                  );
                }}
                className="font-pixel text-lg border border-rim text-fg-2 hover:border-accent hover:text-accent px-2 py-0.5 transition-none"
              >
                CSV
              </button>
              <button
                onClick={() => {
                  const ts = new Date().toISOString().replace(/[:.]/g, '-');
                  downloadBlob(
                    JSON.stringify(result.rows, null, 2) + '\n',
                    `query_results_${ts}.json`,
                    'application/json',
                  );
                }}
                className="font-pixel text-lg border border-rim text-fg-2 hover:border-accent hover:text-accent px-2 py-0.5 transition-none"
              >
                JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="bg-bg-2 border border-rim shadow-px p-4">
          {result.error ? (
            <div className="font-mono text-sm text-danger bg-bg border border-danger px-3 py-2">
              {result.error}
            </div>
          ) : result.rows.length === 0 ? (
            <div className="font-pixel text-xl text-fg-2">No rows returned.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr>
                    {result.columns.map((col) => (
                      <th
                        key={col}
                        className="text-left px-2 py-1 font-pixel text-lg text-fg-2 border-b border-rim whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-bg border-b border-rim">
                      {result.columns.map((col) => (
                        <td key={col} className="px-2 py-1 text-fg whitespace-nowrap max-w-xs truncate">
                          {row[col] == null ? (
                            <span className="text-fg-2">NULL</span>
                          ) : (
                            String(row[col])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function QueryPage() {
  return (
    <Suspense fallback={<p className="text-fg-2 text-xs font-mono">Loading…</p>}>
      <QueryPageContent />
    </Suspense>
  );
}
