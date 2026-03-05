'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../lib/api';

interface IndexMeta {
  index_name?: string;
  table_name?: string;
  column_names?: string;
  is_unique?: boolean;
  scan_count?: number;
  idx_scan?: number;
  idx_tup_read?: number;
}

interface SchemaTable {
  name?: string;
  table_name?: string;
}

function usageBar(scanCount: number): string {
  // Cap at 10,000 scans = 100%
  const pct = Math.min(100, Math.round((scanCount / 10_000) * 100));
  const filled = Math.floor(pct / 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${pct}%`;
}

export default function IndexesPage() {
  const [indexes, setIndexes] = useState<IndexMeta[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ table: '', columns: '', name: '' });
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const fetchIndexes = useCallback(async () => {
    const res = await apiClient.get<IndexMeta[]>('/api/v1/schema/indexes');
    if (res.ok && res.data) {
      setIndexes(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } else {
      setError(res.error ?? 'Failed to load indexes');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchIndexes();
    void (async () => {
      const res = await apiClient.get<SchemaTable[] | { tables: SchemaTable[] }>(
        '/api/v1/schema/tables',
      );
      if (res.ok && res.data) {
        const data = res.data;
        const arr = Array.isArray(data) ? data : data.tables ?? [];
        setTables(arr.map((t) => t.name ?? t.table_name ?? ''));
      }
    })();
  }, [fetchIndexes]);

  async function createIndex(e: React.FormEvent) {
    e.preventDefault();
    if (!form.table || !form.columns) return;
    setCreating(true);
    const res = await apiClient.post('/api/v1/indexes/create', {
      table: form.table,
      columns: form.columns.split(',').map((c) => c.trim()),
      name: form.name.trim() || undefined,
    });
    if (res.ok) {
      setForm({ table: '', columns: '', name: '' });
      await fetchIndexes();
    } else {
      setError(res.error ?? 'Failed to create index');
    }
    setCreating(false);
  }

  async function dropIndex(name: string) {
    const res = await apiClient.post('/api/v1/indexes/drop', { name });
    if (res.ok) {
      setDropTarget(null);
      await fetchIndexes();
    } else {
      setError(res.error ?? 'Failed to drop index');
    }
  }

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ Index Manager ]</h1>

      {/* Create form */}
      <form onSubmit={createIndex} className="bg-bg-2 border border-rim shadow-px p-4 mb-4">
        <div className="font-pixel text-xl text-fg-2 mb-3">[ Create Index ]</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block font-pixel text-lg text-fg-2 mb-1">Table</label>
            <select
              value={form.table}
              onChange={(e) => setForm((f) => ({ ...f, table: e.target.value }))}
              className="w-full font-mono text-sm bg-bg border border-rim text-fg px-2 py-1 focus:outline-none focus:border-accent"
            >
              <option value="">— select —</option>
              {tables.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-pixel text-lg text-fg-2 mb-1">Columns (comma-sep)</label>
            <input
              value={form.columns}
              onChange={(e) => setForm((f) => ({ ...f, columns: e.target.value }))}
              className="w-full font-mono text-sm bg-bg border border-rim text-fg px-2 py-1 focus:outline-none focus:border-accent"
              placeholder="col1, col2"
            />
          </div>
          <div>
            <label className="block font-pixel text-lg text-fg-2 mb-1">Name (optional)</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full font-mono text-sm bg-bg border border-rim text-fg px-2 py-1 focus:outline-none focus:border-accent"
              placeholder="idx_table_col"
            />
          </div>
        </div>
        {error && <p className="text-danger text-xs font-mono mb-2">{error}</p>}
        <button
          type="submit"
          disabled={creating || !form.table || !form.columns}
          className="px-3 py-1 font-pixel text-xl border border-accent text-accent hover:bg-accent hover:text-bg shadow-px-a disabled:opacity-40 transition-none"
        >
          {creating ? 'Creating…' : '[ Create ]'}
        </button>
      </form>

      {/* Index list */}
      <div className="bg-bg-2 border border-rim shadow-px p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-pixel text-xl text-fg-2">[ Indexes ({indexes.length}) ]</div>
          <button
            onClick={() => void fetchIndexes()}
            className="font-pixel text-lg text-fg-2 hover:text-accent border border-rim hover:border-accent px-2 py-0.5 transition-none"
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="text-fg-2 text-xs font-mono">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr>
                  {['Index', 'Table', 'Columns', 'Unique', 'Scans', 'Usage', ''].map((h) => (
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
                {indexes.map((idx, i) => {
                  const name = idx.index_name ?? `idx-${i}`;
                  const scans = idx.scan_count ?? idx.idx_scan ?? 0;
                  return (
                    <tr key={i} className="border-b border-rim">
                      <td className="px-2 py-1 text-accent">{name}</td>
                      <td className="px-2 py-1 text-fg">{idx.table_name ?? '—'}</td>
                      <td className="px-2 py-1 text-fg">{idx.column_names ?? '—'}</td>
                      <td className="px-2 py-1 text-fg-2">{idx.is_unique ? 'YES' : 'NO'}</td>
                      <td className="px-2 py-1 text-fg-2">{scans}</td>
                      <td className="px-2 py-1 font-mono text-xs text-ok whitespace-nowrap">{usageBar(scans)}</td>
                      <td className="px-2 py-1">
                        {dropTarget === name ? (
                          <span className="flex gap-1">
                            <button
                              onClick={() => void dropIndex(name)}
                              className="font-pixel text-lg text-danger border border-danger px-1 hover:bg-danger hover:text-bg"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDropTarget(null)}
                              className="font-pixel text-lg text-fg-2 border border-rim px-1"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDropTarget(name)}
                            className="font-pixel text-lg text-fg-2 hover:text-danger border border-rim hover:border-danger px-1 transition-none"
                          >
                            Drop
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
