'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient, getToken } from '../../lib/api';

interface TableRow {
  table_name: string;
  row_count?: number;
}

interface StateRow {
  [key: string]: unknown;
}

interface StateResponse {
  rows: StateRow[];
  total: number;
}

interface SchemaTable {
  name: string;
}

export default function ExplorePage() {
  const [tables, setTables] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<StateRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<StateRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 50;

  useEffect(() => {
    void (async () => {
      const res = await apiClient.get<{ tables: SchemaTable[] } | TableRow[]>('/api/v1/schema/tables');
      if (res.ok && res.data) {
        const data = res.data;
        if (Array.isArray(data)) {
          setTables(data.map((t) => t.table_name));
        } else if ('tables' in data) {
          setTables(data.tables.map((t: SchemaTable) => t.name));
        }
      }
    })();
  }, []);

  const loadRows = useCallback(
    async (table: string, p: number) => {
      setLoading(true);
      setError(null);
      const offset = p * PAGE_SIZE;
      const res = await apiClient.get<StateResponse>(
        `/api/v1/state/${table}?limit=${PAGE_SIZE}&offset=${offset}`,
      );
      if (res.ok && res.data) {
        const r = res.data.rows ?? [];
        setRows(r);
        setTotal(res.data.total ?? 0);
        setColumns(r.length > 0 ? Object.keys(r[0]!) : []);
      } else {
        setError(res.error ?? 'Failed to load rows');
      }
      setLoading(false);
    },
    [],
  );

  function selectTable(t: string) {
    setSelected(t);
    setPage(0);
    setDetail(null);
    void loadRows(t, 0);
  }

  async function deleteRow(row: StateRow) {
    if (!selected) return;
    const id = row['id'] ?? row['entity_id_hash'];
    if (!id) return;
    await apiClient.post(`/api/v1/state/${selected}/${String(id)}/delete`, {});
    void loadRows(selected, page);
  }

  const isLoggedIn = !!getToken();

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ Data Explorer ]</h1>

      <div className="flex gap-4">
        {/* Table list */}
        <div className="w-48 shrink-0">
          <div className="bg-bg-2 border border-rim shadow-px p-2">
            <div className="font-pixel text-xl text-fg-2 mb-2">Tables</div>
            {tables.length === 0 && (
              <div className="font-mono text-xs text-fg-2">Loading…</div>
            )}
            {tables.map((t) => (
              <div
                key={t}
                onClick={() => selectTable(t)}
                className={`font-mono text-xs px-2 py-1 cursor-pointer truncate ${
                  selected === t
                    ? 'bg-accent text-bg'
                    : 'text-fg hover:bg-bg hover:text-accent'
                }`}
              >
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* Data panel */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="bg-bg-2 border border-rim shadow-px p-6">
              <div className="font-pixel text-xl text-fg-2">Select a table to explore.</div>
            </div>
          ) : (
            <div className="bg-bg-2 border border-rim shadow-px p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-pixel text-xl text-fg-2">
                  [ {selected} ] — {total} rows
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const p = Math.max(0, page - 1);
                      setPage(p);
                      void loadRows(selected, p);
                    }}
                    disabled={page === 0}
                    className="font-pixel text-lg text-fg-2 border border-rim px-2 py-0.5 disabled:opacity-40"
                  >
                    ◀
                  </button>
                  <span className="font-pixel text-lg text-fg-2">
                    {page + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                  </span>
                  <button
                    onClick={() => {
                      const p = page + 1;
                      setPage(p);
                      void loadRows(selected, p);
                    }}
                    disabled={(page + 1) * PAGE_SIZE >= total}
                    className="font-pixel text-lg text-fg-2 border border-rim px-2 py-0.5 disabled:opacity-40"
                  >
                    ▶
                  </button>
                </div>
              </div>

              {error && <p className="text-danger text-xs font-mono mb-2">{error}</p>}

              {loading ? (
                <p className="text-fg-2 text-xs font-mono">Loading…</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono border-collapse">
                    <thead>
                      <tr>
                        {columns.map((col) => (
                          <th
                            key={col}
                            className="text-left px-2 py-1 font-pixel text-lg text-fg-2 border-b border-rim whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                        <th className="px-2 py-1 border-b border-rim" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-rim hover:bg-bg cursor-pointer"
                          onClick={() => setDetail(row)}
                        >
                          {columns.map((col) => (
                            <td key={col} className="px-2 py-1 text-fg whitespace-nowrap max-w-xs truncate">
                              {row[col] == null ? (
                                <span className="text-fg-2">NULL</span>
                              ) : (
                                String(row[col])
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-1">
                            {isLoggedIn && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void deleteRow(row);
                                }}
                                className="font-pixel text-lg text-danger hover:text-bg hover:bg-danger px-1 border border-danger transition-none"
                              >
                                Del
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row detail modal */}
      {detail && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-bg-2 border border-accent shadow-px p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-pixel text-xl text-accent">[ Row Detail ]</div>
              <button
                onClick={() => setDetail(null)}
                className="font-pixel text-xl text-fg-2 hover:text-accent"
              >
                ✕
              </button>
            </div>
            <pre className="font-mono text-xs text-fg whitespace-pre-wrap break-all">
              {JSON.stringify(detail, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
