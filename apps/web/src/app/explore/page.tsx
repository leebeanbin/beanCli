'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient, getToken } from '../../lib/api';
import { getActiveConnection, type DbConnection } from '../../lib/connections';

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

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

// ── Column definition for Create Table ───────────────────────────────────────

interface ColDef {
  name: string;
  type: string;
  notNull: boolean;
  pk: boolean;
}

const COL_TYPES = [
  'TEXT', 'INTEGER', 'BIGINT', 'BOOLEAN', 'NUMERIC', 'REAL',
  'TIMESTAMPTZ', 'UUID', 'JSONB', 'VARCHAR(255)',
];

function generateDdl(tableName: string, cols: ColDef[]): string {
  const lines = cols.map((c) => {
    let def = `  ${c.name} ${c.type}`;
    if (c.pk) def += ' PRIMARY KEY';
    else if (c.notNull) def += ' NOT NULL';
    return def;
  });
  return `CREATE TABLE ${tableName} (\n${lines.join(',\n')}\n);`;
}

// ── CreateTableModal ──────────────────────────────────────────────────────────

function CreateTableModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [tableName, setTableName] = useState('');
  const [cols, setCols] = useState<ColDef[]>([
    { name: 'id', type: 'INTEGER', notNull: true, pk: true },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ddl = tableName.trim() ? generateDdl(tableName.trim(), cols) : '';

  function addCol() {
    setCols((prev) => [...prev, { name: '', type: 'TEXT', notNull: false, pk: false }]);
  }

  function removeCol(i: number) {
    setCols((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateCol(i: number, patch: Partial<ColDef>) {
    setCols((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async function handleCreate() {
    if (!tableName.trim()) { setError('Table name required'); return; }
    if (cols.length === 0) { setError('Add at least one column'); return; }
    if (cols.some((c) => !c.name.trim())) { setError('All columns need a name'); return; }
    setSaving(true);
    setError(null);
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/v1/sql/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ sql: ddl }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `HTTP ${res.status}`);
      setSaving(false);
      return;
    }
    setSaving(false);
    onCreated();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-2 border border-accent shadow-px p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="font-pixel text-xl text-accent">[ Create Table ]</div>
          <button onClick={onClose} className="font-pixel text-xl text-fg-2 hover:text-accent">✕</button>
        </div>

        {/* Table name */}
        <div className="mb-4">
          <label className="font-pixel text-lg text-fg-2 block mb-1">Table Name</label>
          <input
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            className="w-full font-mono text-sm bg-bg border border-rim text-fg px-3 py-1 focus:outline-none focus:border-accent"
            placeholder="my_table"
          />
        </div>

        {/* Columns */}
        <div className="mb-3">
          <div className="font-pixel text-lg text-fg-2 mb-2">Columns</div>
          <div className="space-y-2">
            {cols.map((col, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={col.name}
                  onChange={(e) => updateCol(i, { name: e.target.value })}
                  className="flex-1 font-mono text-xs bg-bg border border-rim text-fg px-2 py-1 focus:outline-none focus:border-accent"
                  placeholder="column_name"
                />
                <select
                  value={col.type}
                  onChange={(e) => updateCol(i, { type: e.target.value })}
                  className="font-mono text-xs bg-bg border border-rim text-fg px-2 py-1 focus:outline-none focus:border-accent"
                >
                  {COL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <label className="font-pixel text-lg text-fg-2 flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={col.notNull}
                    onChange={(e) => updateCol(i, { notNull: e.target.checked })}
                    className="accent-accent"
                  />
                  NN
                </label>
                <label className="font-pixel text-lg text-fg-2 flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={col.pk}
                    onChange={(e) => updateCol(i, { pk: e.target.checked })}
                    className="accent-accent"
                  />
                  PK
                </label>
                <button
                  onClick={() => removeCol(i)}
                  className="font-pixel text-lg text-danger hover:bg-danger hover:text-bg px-1 border border-danger transition-none"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addCol}
            className="mt-2 font-pixel text-lg border border-rim text-fg-2 hover:border-accent hover:text-accent px-2 py-0.5 transition-none"
          >
            + Add Column
          </button>
        </div>

        {/* DDL preview */}
        {ddl && (
          <div className="mb-4">
            <div className="font-pixel text-lg text-fg-2 mb-1">DDL Preview</div>
            <pre className="font-mono text-xs bg-bg border border-rim text-fg px-3 py-2 whitespace-pre-wrap overflow-x-auto">
              {ddl}
            </pre>
          </div>
        )}

        {error && <p className="text-danger text-xs font-mono mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => void handleCreate()}
            disabled={saving || !tableName.trim()}
            className="font-pixel text-xl border border-accent text-accent hover:bg-accent hover:text-bg px-3 py-1 shadow-px-a disabled:opacity-40 disabled:cursor-not-allowed transition-none"
          >
            {saving ? 'Creating…' : '[ Create ]'}
          </button>
          <button
            onClick={onClose}
            className="font-pixel text-xl border border-rim text-fg-2 hover:border-accent hover:text-accent px-3 py-1 transition-none"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RowDetailModal (with Edit support) ────────────────────────────────────────

function RowDetailModal({
  row,
  table,
  onClose,
  onSaved,
}: {
  row: StateRow;
  table: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    const vals: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      vals[k] = v == null ? '' : String(v);
    }
    setEditValues(vals);
    setEditing(true);
    setError(null);
  }

  async function handleSave() {
    const id = row['id'] ?? row['entity_id_hash'];
    const pkCol = row['id'] != null ? 'id' : 'entity_id_hash';
    if (!id) { setError('No primary key to update'); return; }
    setSaving(true);
    setError(null);

    // Build UPDATE SQL
    const setClauses = Object.entries(editValues)
      .filter(([k]) => k !== pkCol)
      .map(([k, v]) => `"${k}" = '${v.replace(/'/g, "''")}'`)
      .join(', ');
    const sql = `UPDATE "${table}" SET ${setClauses} WHERE "${pkCol}" = '${String(id).replace(/'/g, "''")}'`;

    const token = getToken();
    const res = await fetch(`${API_BASE}/api/v1/sql/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ sql }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `HTTP ${res.status}`);
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-2 border border-accent shadow-px p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="font-pixel text-xl text-accent">[ Row Detail ]</div>
          <div className="flex gap-2">
            {!editing && getToken() && (
              <button
                onClick={startEdit}
                className="font-pixel text-lg border border-accent text-accent hover:bg-accent hover:text-bg px-2 py-0.5 transition-none"
              >
                [ Edit ]
              </button>
            )}
            <button onClick={onClose} className="font-pixel text-xl text-fg-2 hover:text-accent">✕</button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-2">
            {Object.keys(row).map((col) => (
              <div key={col} className="flex gap-2 items-center">
                <span className="font-pixel text-lg text-fg-2 w-40 shrink-0">{col}</span>
                <input
                  value={editValues[col] ?? ''}
                  onChange={(e) => setEditValues((prev) => ({ ...prev, [col]: e.target.value }))}
                  className="flex-1 font-mono text-xs bg-bg border border-rim text-fg px-2 py-1 focus:outline-none focus:border-accent"
                />
              </div>
            ))}
            {error && <p className="text-danger text-xs font-mono">{error}</p>}
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="font-pixel text-xl border border-accent text-accent hover:bg-accent hover:text-bg px-3 py-1 shadow-px-a disabled:opacity-40 transition-none"
              >
                {saving ? 'Saving…' : '[ Save ]'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="font-pixel text-xl border border-rim text-fg-2 hover:border-accent hover:text-accent px-3 py-1 transition-none"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <pre className="font-mono text-xs text-fg whitespace-pre-wrap break-all">
            {JSON.stringify(row, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── ExplorePage ───────────────────────────────────────────────────────────────

const CONN_API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

async function connExecute(conn: DbConnection, sql: string): Promise<{ rows: StateRow[]; error?: string }> {
  try {
    const res = await fetch(`${CONN_API}/api/v1/connections/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection: conn, sql }),
    });
    const data = (await res.json()) as { rows?: StateRow[]; error?: string };
    if (!res.ok || data.error) return { rows: [], error: data.error ?? `HTTP ${res.status}` };
    return { rows: data.rows ?? [] };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : 'Network error' };
  }
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
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [activeConn, setActiveConn] = useState<DbConnection | null>(null);

  const PAGE_SIZE = 50;

  useEffect(() => {
    setActiveConn(getActiveConnection());
  }, []);

  const loadTables = useCallback(async (conn?: DbConnection | null) => {
    const c = conn ?? activeConn;
    if (c) {
      // Load tables via connections/execute using information_schema
      const { rows: r, error: e } = await connExecute(
        c,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      );
      if (!e) {
        setTables(r.map((row) => String(row['table_name'] ?? '')).filter(Boolean));
        return;
      }
    }
    // Fallback: API server schema endpoint
    const res = await apiClient.get<{ tables: SchemaTable[] } | TableRow[]>('/api/v1/schema/tables');
    if (res.ok && res.data) {
      const data = res.data;
      if (Array.isArray(data)) {
        setTables(data.map((t) => t.table_name));
      } else if ('tables' in data) {
        setTables(data.tables.map((t: SchemaTable) => t.name));
      }
    }
  }, [activeConn]);

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  const loadRows = useCallback(
    async (table: string, p: number) => {
      setLoading(true);
      setError(null);
      const offset = p * PAGE_SIZE;

      const conn = getActiveConnection();
      if (conn) {
        const sql = `SELECT * FROM "${table}" LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
        const { rows: r, error: e } = await connExecute(conn, sql);
        if (e) {
          setError(e);
        } else {
          setRows(r);
          // For total count with active connection
          const { rows: countRows } = await connExecute(conn, `SELECT COUNT(*) AS n FROM "${table}"`);
          setTotal(Number(countRows[0]?.['n'] ?? r.length));
          setColumns(r.length > 0 ? Object.keys(r[0]!) : []);
        }
        setLoading(false);
        return;
      }

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
    [activeConn],
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
    const token = getToken();
    await fetch(`${API_BASE}/api/v1/state/${selected}/${String(id)}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    void loadRows(selected, page);
  }

  const isLoggedIn = !!getToken();

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ Data Explorer ]</h1>

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

      <div className="flex gap-4">
        {/* Table list */}
        <div className="w-48 shrink-0">
          <div className="bg-bg-2 border border-rim shadow-px p-2">
            <div className="flex items-center justify-between mb-2">
              <div className="font-pixel text-xl text-fg-2">Tables</div>
              {isLoggedIn && (
                <button
                  onClick={() => setShowCreateTable(true)}
                  className="font-pixel text-lg text-accent border border-accent hover:bg-accent hover:text-bg px-1 transition-none"
                  title="Create Table"
                >
                  +
                </button>
              )}
            </div>
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
                  {rows.length > 0 && (
                    <>
                      <button
                        onClick={() => {
                          const ts = new Date().toISOString().replace(/[:.]/g, '-');
                          downloadBlob(rowsToCsv(columns, rows), `${selected}_${ts}.csv`, 'text/csv');
                        }}
                        className="font-pixel text-lg border border-rim text-fg-2 hover:border-accent hover:text-accent px-2 py-0.5 transition-none"
                      >
                        CSV
                      </button>
                      <button
                        onClick={() => {
                          const ts = new Date().toISOString().replace(/[:.]/g, '-');
                          downloadBlob(JSON.stringify(rows, null, 2) + '\n', `${selected}_${ts}.json`, 'application/json');
                        }}
                        className="font-pixel text-lg border border-rim text-fg-2 hover:border-accent hover:text-accent px-2 py-0.5 transition-none"
                      >
                        JSON
                      </button>
                    </>
                  )}
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

      {/* Create Table modal */}
      {showCreateTable && (
        <CreateTableModal
          onClose={() => setShowCreateTable(false)}
          onCreated={() => void loadTables()}
        />
      )}

      {/* Row detail modal */}
      {detail && selected && (
        <RowDetailModal
          row={detail}
          table={selected}
          onClose={() => setDetail(null)}
          onSaved={() => selected && void loadRows(selected, page)}
        />
      )}
    </div>
  );
}
