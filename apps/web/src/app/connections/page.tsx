'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  type DbConnection,
  type DbType,
  loadConnections,
  upsertConnection,
  removeConnection,
  generateId,
} from '../../lib/connections';

// ── Constants ────────────────────────────────────────────────────────────────

const DB_TYPES: DbType[] = ['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis'];
const DEFAULT_PORTS: Record<DbType, number | undefined> = {
  postgresql: 5432,
  mysql: 3306,
  sqlite: undefined,
  mongodb: 27017,
  redis: 6379,
};
const DB_TYPE_ICONS: Record<DbType, string> = {
  postgresql: 'PG',
  mysql: 'MY',
  sqlite: 'SQ',
  mongodb: 'MG',
  redis: 'RD',
};
const DB_TYPE_COLORS: Record<DbType, string> = {
  postgresql: 'text-accent',
  mysql: 'text-warn',
  sqlite: 'text-ok',
  mongodb: 'text-ok',
  redis: 'text-danger',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

const BLANK: Omit<DbConnection, 'id'> = {
  label: '',
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: '',
  username: '',
  password: '',
};

// ── Types ────────────────────────────────────────────────────────────────────

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

interface TestResult {
  ok: boolean;
  tables?: string[];
  error?: string;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function DbTypeBadge({ type }: { type: DbType }) {
  return (
    <span className={`font-mono text-xs font-bold ${DB_TYPE_COLORS[type]}`}>
      {DB_TYPE_ICONS[type]}
    </span>
  );
}

function ConnectionRow({
  conn,
  selected,
  onClick,
  onDelete,
}: {
  conn: DbConnection;
  selected: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const hostStr =
    conn.type === 'sqlite'
      ? (conn.database ?? ':memory:')
      : `${conn.host ?? 'localhost'}:${conn.port ?? DEFAULT_PORTS[conn.type] ?? ''}`;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-rim hover:bg-bg transition-none group ${selected ? 'bg-bg' : ''}`}
    >
      <DbTypeBadge type={conn.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-fg truncate">{conn.label || conn.id}</span>
          {conn.isDefault && <span className="text-xs text-warn font-bold">★</span>}
        </div>
        <div className="text-xs text-fg-2 font-mono truncate">{hostStr}</div>
      </div>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-fg-2 hover:text-danger transition-none text-xs px-1"
        title="Delete"
      >
        ✕
      </button>
    </button>
  );
}

function TestResultPanel({ status, result }: { status: TestStatus; result: TestResult | null }) {
  if (status === 'idle') return null;

  if (status === 'testing') {
    return (
      <div className="mt-4 p-3 bg-bg border border-rim font-mono text-sm text-accent animate-pulse">
        ⟳ &nbsp;CONNECTING...
      </div>
    );
  }

  if (status === 'error' || (status === 'ok' && result && !result.ok)) {
    return (
      <div className="mt-4 p-3 bg-bg border border-danger font-mono text-sm text-danger shadow-px-d">
        ✕ &nbsp;{result?.error ?? 'Connection failed'}
      </div>
    );
  }

  return (
    <div className="mt-4 p-3 bg-bg border border-ok font-mono text-sm shadow-px-o">
      <div className="text-ok mb-2">✓ &nbsp;Connected successfully</div>
      {result?.tables && result.tables.length > 0 && (
        <div className="text-fg-2 text-xs">
          <span className="text-fg-2">Tables ({result.tables.length}):</span>{' '}
          <span className="text-fg">{result.tables.slice(0, 8).join(', ')}</span>
          {result.tables.length > 8 && ` … +${result.tables.length - 8} more`}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<DbConnection, 'id'>>(BLANK);
  const [isEditing, setIsEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const conns = loadConnections();
    setConnections(conns);
    if (conns.length > 0) setSelectedId(conns[0].id);
  }, []);

  const selected = connections.find((c) => c.id === selectedId) ?? null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openNew() {
    setForm({ ...BLANK });
    setIsEditing(false);
    setShowForm(true);
    setTestStatus('idle');
    setTestResult(null);
  }

  function openEdit(conn: DbConnection) {
    setForm({
      label: conn.label,
      type: conn.type,
      host: conn.host ?? 'localhost',
      port: conn.port ?? DEFAULT_PORTS[conn.type],
      database: conn.database ?? '',
      username: conn.username ?? '',
      password: conn.password ?? '',
      isDefault: conn.isDefault,
    });
    setIsEditing(true);
    setShowForm(true);
    setSelectedId(conn.id);
    setTestStatus('idle');
    setTestResult(null);
  }

  function cancelForm() {
    setShowForm(false);
    setTestStatus('idle');
    setTestResult(null);
  }

  function handleTypeChange(type: DbType) {
    const currentPort = form.port;
    const wasDefault = Object.values(DEFAULT_PORTS).includes(currentPort as number) || !currentPort;
    setForm((f) => ({
      ...f,
      type,
      port: wasDefault ? DEFAULT_PORTS[type] : currentPort,
    }));
  }

  function handleSave() {
    const id = isEditing && selectedId ? selectedId : generateId();
    const conn: DbConnection = { id, ...form };
    upsertConnection(conn);
    const updated = loadConnections();
    setConnections(updated);
    setSelectedId(id);
    setShowForm(false);
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    removeConnection(id);
    const updated = loadConnections();
    setConnections(updated);
    if (selectedId === id) setSelectedId(updated[0]?.id ?? null);
  }

  function toggleDefault(conn: DbConnection) {
    const wasDefault = conn.isDefault;
    const updated = connections.map((c) => ({
      ...c,
      isDefault: c.id === conn.id ? !wasDefault : false,
    }));
    updated.forEach((c) => upsertConnection(c));
    setConnections(loadConnections());
  }

  const handleTest = useCallback(
    async (connOverride?: DbConnection) => {
      const target = connOverride ?? selected;
      if (!target) return;
      setTestStatus('testing');
      setTestResult(null);
      try {
        const res = await fetch(`${API_BASE}/api/v1/connections/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: target.type,
            host: target.host,
            port: target.port,
            database: target.database,
            username: target.username,
            password: target.password,
          }),
        });
        const data = (await res.json()) as TestResult;
        setTestResult(data);
        setTestStatus(data.ok ? 'ok' : 'error');
      } catch (err) {
        setTestResult({ ok: false, error: err instanceof Error ? err.message : 'Network error' });
        setTestStatus('error');
      }
    },
    [selected],
  );

  async function handleTestForm() {
    const tempConn: DbConnection = { id: '__test__', ...form };
    await handleTest(tempConn);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-0 h-[calc(100vh-8rem)] max-w-5xl">
      {/* ── Left: Connection list ─────────────────────────────── */}
      <div className="w-72 flex-shrink-0 bg-bg-2 border border-rim flex flex-col">
        <div className="px-3 py-2.5 border-b border-rim flex items-center justify-between">
          <span className="font-mono text-xs font-bold text-accent tracking-widest">
            DATABASE CONNECTIONS
          </span>
          <button
            onClick={openNew}
            className="text-xs font-mono text-fg-2 hover:text-accent transition-none"
            title="New connection"
          >
            + NEW
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {connections.length === 0 ? (
            <div className="px-3 py-8 text-center text-fg-2 font-mono text-xs">
              <div className="mb-2 text-2xl">⊕</div>
              No saved connections.
              <br />
              Press + NEW to add one.
            </div>
          ) : (
            connections.map((conn) => (
              <ConnectionRow
                key={conn.id}
                conn={conn}
                selected={selectedId === conn.id && !showForm}
                onClick={() => {
                  setSelectedId(conn.id);
                  setShowForm(false);
                  setTestStatus('idle');
                  setTestResult(null);
                }}
                onDelete={(e) => handleDelete(conn.id, e)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: Detail / Form panel ────────────────────────── */}
      <div className="flex-1 bg-bg-2 border border-l-0 border-rim flex flex-col">
        {showForm ? (
          /* ── Add / Edit form ── */
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-mono text-sm font-bold text-accent tracking-wide">
                {isEditing ? '[ EDIT CONNECTION ]' : '[ ADD CONNECTION ]'}
              </h2>
              <button
                onClick={cancelForm}
                className="text-fg-2 hover:text-fg font-mono text-xs transition-none"
              >
                ESC
              </button>
            </div>

            <div className="space-y-4">
              {/* Type selector */}
              <div>
                <label className="block font-mono text-xs text-fg-2 mb-1.5 uppercase tracking-widest">
                  TYPE
                </label>
                <div className="flex gap-2 flex-wrap">
                  {DB_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => handleTypeChange(t)}
                      className={`px-3 py-1.5 font-mono text-xs border transition-none ${
                        form.type === t
                          ? 'border-accent text-accent shadow-px-a'
                          : 'border-rim text-fg-2 hover:border-accent hover:text-accent'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <FormField label="LABEL">
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="my-local-pg"
                  className="w-full bg-bg border border-rim px-3 py-2 font-mono text-sm text-fg focus:outline-none focus:border-accent placeholder-fg-2"
                />
              </FormField>

              {form.type !== 'sqlite' && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <FormField label="HOST">
                      <input
                        type="text"
                        value={form.host ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                        placeholder="localhost"
                        className="w-full bg-bg border border-rim px-3 py-2 font-mono text-sm text-fg focus:outline-none focus:border-accent placeholder-fg-2"
                      />
                    </FormField>
                  </div>
                  <FormField label="PORT">
                    <input
                      type="number"
                      value={form.port ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          port: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                      placeholder={String(DEFAULT_PORTS[form.type] ?? '')}
                      className="w-full bg-bg border border-rim px-3 py-2 font-mono text-sm text-fg focus:outline-none focus:border-accent placeholder-fg-2"
                    />
                  </FormField>
                </div>
              )}

              <FormField
                label={
                  form.type === 'sqlite'
                    ? 'FILE PATH'
                    : form.type === 'redis'
                      ? 'DB INDEX'
                      : 'DATABASE'
                }
              >
                <input
                  type="text"
                  value={form.database ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, database: e.target.value }))}
                  placeholder={
                    form.type === 'sqlite' ? ':memory:' : form.type === 'redis' ? '0' : 'tfsdc'
                  }
                  className="w-full bg-bg border border-rim px-3 py-2 font-mono text-sm text-fg focus:outline-none focus:border-accent placeholder-fg-2"
                />
              </FormField>

              {form.type !== 'sqlite' && (
                <>
                  <FormField label="USERNAME">
                    <input
                      type="text"
                      value={form.username ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                      placeholder="postgres"
                      className="w-full bg-bg border border-rim px-3 py-2 font-mono text-sm text-fg focus:outline-none focus:border-accent placeholder-fg-2"
                    />
                  </FormField>

                  <FormField label="PASSWORD">
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={form.password ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="••••••••"
                        className="w-full bg-bg border border-rim px-3 py-2 font-mono text-sm text-fg focus:outline-none focus:border-accent placeholder-fg-2"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-2 hover:text-fg text-xs font-mono transition-none"
                      >
                        {showPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </FormField>
                </>
              )}
            </div>

            <TestResultPanel status={testStatus} result={testResult} />

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleTestForm}
                disabled={testStatus === 'testing'}
                className="flex-1 border border-rim text-fg-2 hover:border-accent hover:text-accent px-4 py-2 text-sm font-mono disabled:opacity-50 transition-none"
              >
                [ TEST ]
              </button>
              <button
                onClick={handleSave}
                className="flex-1 border border-ok text-ok hover:bg-ok hover:text-bg px-4 py-2 text-sm font-mono shadow-px-o transition-none"
              >
                [ SAVE ]
              </button>
            </div>
          </div>
        ) : selected ? (
          /* ── Connection detail ── */
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <DbTypeBadge type={selected.type} />
                <h2 className="font-mono text-sm font-bold text-fg">
                  {selected.label || selected.id}
                </h2>
                {selected.isDefault && <span className="text-xs text-warn">★ default</span>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleDefault(selected)}
                  className="text-xs font-mono text-fg-2 hover:text-warn transition-none px-2 py-1 border border-rim hover:border-warn"
                >
                  {selected.isDefault ? '★ default' : '☆ set default'}
                </button>
                <button
                  onClick={() => openEdit(selected)}
                  className="text-xs font-mono text-fg-2 hover:text-accent transition-none px-2 py-1 border border-rim hover:border-accent"
                >
                  EDIT
                </button>
              </div>
            </div>

            <div className="bg-bg border border-rim divide-y divide-rim mb-5">
              <DetailRow label="Type" value={selected.type} mono />
              {selected.type !== 'sqlite' && (
                <DetailRow
                  label="Host"
                  value={`${selected.host ?? 'localhost'}:${selected.port ?? ''}`}
                  mono
                />
              )}
              {selected.database && (
                <DetailRow
                  label={selected.type === 'sqlite' ? 'File' : 'Database'}
                  value={selected.database}
                  mono
                />
              )}
              {selected.username && <DetailRow label="Username" value={selected.username} mono />}
              {selected.password && (
                <DetailRow label="Password" value={'•'.repeat(selected.password.length)} mono />
              )}
            </div>

            <TestResultPanel status={testStatus} result={testResult} />

            <button
              onClick={() => handleTest()}
              disabled={testStatus === 'testing'}
              className="mt-5 w-full border border-ok text-ok hover:bg-ok hover:text-bg px-4 py-2.5 text-sm font-mono shadow-px-o disabled:opacity-50 transition-none"
            >
              {testStatus === 'testing' ? '⟳  CONNECTING...' : '[ TEST CONNECTION ]'}
            </button>

            {testResult?.ok && testResult.tables && testResult.tables.length > 0 && (
              <div className="mt-4">
                <div className="font-mono text-xs text-fg-2 mb-2 uppercase tracking-widest">
                  Tables
                </div>
                <div className="bg-bg border border-rim max-h-48 overflow-y-auto">
                  {testResult.tables.map((t) => (
                    <div
                      key={t}
                      className="px-3 py-1.5 font-mono text-xs text-fg border-b border-rim last:border-0 hover:bg-bg-2 transition-none"
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Empty state ── */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center font-mono text-fg-2">
              <div className="font-pixel text-4xl mb-3">⊗</div>
              <div className="text-xs">No connection selected</div>
              <button
                onClick={openNew}
                className="mt-4 text-xs font-mono text-accent border border-accent hover:bg-accent hover:text-bg px-4 py-2 shadow-px-a transition-none"
              >
                + Add Connection
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper components ────────────────────────────────────────────────────────

function FormField({
  label,
  children,
}: {
  label: string;
  placeholder?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-mono text-xs text-fg-2 mb-1.5 uppercase tracking-widest">
        {label}
      </label>
      {children}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center px-3 py-2 gap-4">
      <span className="text-xs text-fg-2 w-20 flex-shrink-0 font-mono">{label}</span>
      <span className={`text-xs text-fg ${mono ? 'font-mono' : ''} break-all`}>{value}</span>
    </div>
  );
}
