'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '../../lib/api';

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  duration?: number;
  error?: string;
}

export default function QueryPage() {
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);

  const execute = useCallback(async () => {
    if (!sql.trim() || running) return;
    setRunning(true);
    const res = await apiClient.post<QueryResult>('/api/v1/sql/execute', { sql });
    if (res.ok && res.data) {
      setResult(res.data);
    } else {
      setResult({ columns: [], rows: [], rowCount: 0, error: res.error ?? 'Query failed' });
    }
    setRunning(false);
  }, [sql, running]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void execute();
    }
  }

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ SQL Query ]</h1>

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
          <span className="font-pixel text-lg text-fg-2">Ctrl+Enter to run</span>
          {result && !result.error && (
            <span className="font-pixel text-lg text-ok ml-auto">
              {result.rowCount} rows{result.duration != null ? ` · ${result.duration}ms` : ''}
            </span>
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
