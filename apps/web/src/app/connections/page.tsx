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
  postgresql: 5432, mysql: 3306, sqlite: undefined, mongodb: 27017, redis: 6379,
};
const DB_TYPE_ICONS: Record<DbType, string> = {
  postgresql: 'PG', mysql: 'MY', sqlite: 'SQ', mongodb: 'MG', redis: 'RD',
};
const DB_TYPE_COLORS: Record<DbType, string> = {
  postgresql: 'text-blue-400',
  mysql:      'text-orange-400',
  sqlite:     'text-cyan-400',
  mongodb:    'text-green-400',
  redis:      'text-red-400',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

const BLANK: Omit<DbConnection, 'id'> = {
  label: '', type: 'postgresql', host: 'localhost', port: 5432,
  database: '', username: '', password: '',
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
  const hostStr = conn.type === 'sqlite'
    ? (conn.database ?? ':memory:')
    : `${conn.host ?? 'localhost'}:${conn.port ?? DEFAULT_PORTS[conn.type] ?? ''}`;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-gray-700 hover:bg-gray-700 transition-colors group ${selected ? 'bg-gray-700' : ''}`}
    >
      <DbTypeBadge type={conn.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-gray-100 truncate">{conn.label || conn.id}</span>
          {conn.isDefault && (
            <span className="text-xs text-yellow-400 font-bold">★</span>
          )}
        </div>
        <div className="text-xs text-gray-400 font-mono truncate">{hostStr}</div>
      </div>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all text-xs px-1"
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
      <div className="mt-4 p-3 bg-gray-800 rounded border border-gray-700 font-mono text-sm text-brand animate-pulse">
        ⟳ &nbsp;CONNECTING...
      </div>
    );
  }

  if (status === 'error' || (status === 'ok' && result && !result.ok)) {
    return (
      <div className="mt-4 p-3 bg-red-950 rounded border border-red-700 font-mono text-sm text-red-400">
        ✕ &nbsp;{result?.error ?? 'Connection failed'}
      </div>
    );
  }

  return (
    <div className="mt-4 p-3 bg-green-950 rounded border border-green-700 font-mono text-sm">
      <div className="text-green-400 mb-2">✓ &nbsp;Connected successfully</div>
      {result?.tables && result.tables.length > 0 && (
        <div className="text-gray-300 text-xs">
          <span className="text-gray-500">Tables ({result.tables.length}):</span>{' '}
          {result.tables.slice(0, 8).join(', ')}
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
  const [isEditing, setIsEditing] = useState(false);      // true = editing existing
  const [showForm, setShowForm] = useState(false);        // true = form panel open
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const conns = loadConnections();
    setConnections(conns);
    if (conns.length > 0) setSelectedId(conns[0].id);
  }, []);

  const selected = connections.find(c => c.id === selectedId) ?? null;

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
      label: conn.label, type: conn.type,
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
    setForm(f => ({
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
    const updated = connections.map(c => ({ ...c, isDefault: c.id === conn.id ? !wasDefault : false }));
    updated.forEach(c => upsertConnection(c));
    setConnections(loadConnections());
  }

  const handleTest = useCallback(async (connOverride?: DbConnection) => {
    const target = connOverride ?? selected;
    if (!target) return;
    setTestStatus('testing');
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/connections/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:     target.type,
          host:     target.host,
          port:     target.port,
          database: target.database,
          username: target.username,
          password: target.password,
        }),
      });
      const data = await res.json() as TestResult;
      setTestResult(data);
      setTestStatus(data.ok ? 'ok' : 'error');
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : 'Network error' });
      setTestStatus('error');
    }
  }, [selected]);

  // Test from form (before saving)
  async function handleTestForm() {
    const tempConn: DbConnection = { id: '__test__', ...form };
    await handleTest(tempConn);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-0 h-[calc(100vh-8rem)] max-w-5xl">

      {/* ── Left: Connection list ────────────────────────────── */}
      <div className="w-72 flex-shrink-0 bg-gray-900 rounded-l-lg border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-gray-700 flex items-center justify-between">
          <span className="font-mono text-xs font-bold text-green-400 tracking-widest">
            DATABASE CONNECTIONS
          </span>
          <button
            onClick={openNew}
            className="text-xs text-gray-400 hover:text-green-400 font-mono transition-colors"
            title="New connection"
          >
            + NEW
          </button>
        </div>

        {/* Connection list */}
        <div className="flex-1 overflow-y-auto">
          {connections.length === 0 ? (
            <div className="px-3 py-8 text-center text-gray-500 font-mono text-xs">
              <div className="mb-2 text-2xl">⊕</div>
              No saved connections.
              <br />Press + NEW to add one.
            </div>
          ) : (
            connections.map(conn => (
              <ConnectionRow
                key={conn.id}
                conn={conn}
                selected={selectedId === conn.id && !showForm}
                onClick={() => { setSelectedId(conn.id); setShowForm(false); setTestStatus('idle'); setTestResult(null); }}
                onDelete={(e) => handleDelete(conn.id, e)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: Detail / Form panel ───────────────────────── */}
      <div className="flex-1 bg-gray-800 rounded-r-lg border border-l-0 border-gray-700 flex flex-col">

        {showForm ? (
          /* ── Add / Edit form ── */
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-mono text-sm font-bold text-green-400 tracking-wide">
                {isEditing ? '[ EDIT CONNECTION ]' : '[ ADD CONNECTION ]'}
              </h2>
              <button onClick={cancelForm} className="text-gray-500 hover:text-gray-300 font-mono text-xs">
                ESC
              </button>
            </div>

            <div className="space-y-4">
              {/* Type selector */}
              <div>
                <label className="block font-mono text-xs text-gray-400 mb-1.5">TYPE</label>
                <div className="flex gap-2 flex-wrap">
                  {DB_TYPES.map(t => (
                    <button
                      key={t}
                      onClick={() => handleTypeChange(t)}
                      className={`px-3 py-1.5 rounded font-mono text-xs border transition-colors ${
                        form.type === t
                          ? 'bg-green-900 border-green-500 text-green-300'
                          : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Label */}
              <FormField label="LABEL" placeholder="my-local-pg">
                <input
                  type="text"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="my-local-pg"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 font-mono text-sm text-gray-100 focus:outline-none focus:border-green-500 placeholder-gray-600"
                />
              </FormField>

              {/* Host + Port (hidden for sqlite) */}
              {form.type !== 'sqlite' && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <FormField label="HOST">
                      <input
                        type="text"
                        value={form.host ?? ''}
                        onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                        placeholder="localhost"
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 font-mono text-sm text-gray-100 focus:outline-none focus:border-green-500 placeholder-gray-600"
                      />
                    </FormField>
                  </div>
                  <FormField label="PORT">
                    <input
                      type="number"
                      value={form.port ?? ''}
                      onChange={e => setForm(f => ({ ...f, port: e.target.value ? Number(e.target.value) : undefined }))}
                      placeholder={String(DEFAULT_PORTS[form.type] ?? '')}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 font-mono text-sm text-gray-100 focus:outline-none focus:border-green-500 placeholder-gray-600"
                    />
                  </FormField>
                </div>
              )}

              {/* Database / file path */}
              <FormField label={form.type === 'sqlite' ? 'FILE PATH' : form.type === 'redis' ? 'DB INDEX' : 'DATABASE'}>
                <input
                  type="text"
                  value={form.database ?? ''}
                  onChange={e => setForm(f => ({ ...f, database: e.target.value }))}
                  placeholder={form.type === 'sqlite' ? ':memory:' : form.type === 'redis' ? '0' : 'tfsdc'}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 font-mono text-sm text-gray-100 focus:outline-none focus:border-green-500 placeholder-gray-600"
                />
              </FormField>

              {/* Username + Password (hidden for sqlite/redis-no-auth) */}
              {form.type !== 'sqlite' && (
                <>
                  <FormField label="USERNAME">
                    <input
                      type="text"
                      value={form.username ?? ''}
                      onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                      placeholder="postgres"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 font-mono text-sm text-gray-100 focus:outline-none focus:border-green-500 placeholder-gray-600"
                    />
                  </FormField>

                  <FormField label="PASSWORD">
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={form.password ?? ''}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        placeholder="••••••••"
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 font-mono text-sm text-gray-100 focus:outline-none focus:border-green-500 placeholder-gray-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs font-mono"
                      >
                        {showPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </FormField>
                </>
              )}
            </div>

            {/* Test result */}
            <TestResultPanel status={testStatus} result={testResult} />

            {/* Action buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleTestForm}
                disabled={testStatus === 'testing'}
                className="flex-1 bg-gray-700 text-gray-200 rounded px-4 py-2 text-sm font-mono hover:bg-gray-600 disabled:opacity-50 transition-colors border border-gray-600"
              >
                TEST
              </button>
              <button
                onClick={handleSave}
                className="flex-1 bg-green-700 text-white rounded px-4 py-2 text-sm font-mono hover:bg-green-600 transition-colors"
              >
                SAVE
              </button>
            </div>
          </div>

        ) : selected ? (
          /* ── Connection detail ── */
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <DbTypeBadge type={selected.type} />
                <h2 className="font-mono text-sm font-bold text-gray-100">{selected.label || selected.id}</h2>
                {selected.isDefault && <span className="text-xs text-yellow-400">★ default</span>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleDefault(selected)}
                  className="text-xs font-mono text-gray-400 hover:text-yellow-400 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-yellow-600"
                >
                  {selected.isDefault ? '★ default' : '☆ set default'}
                </button>
                <button
                  onClick={() => openEdit(selected)}
                  className="text-xs font-mono text-gray-400 hover:text-blue-400 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-blue-600"
                >
                  EDIT
                </button>
              </div>
            </div>

            {/* Connection details grid */}
            <div className="bg-gray-900 rounded border border-gray-700 divide-y divide-gray-700 mb-5">
              <DetailRow label="Type"     value={selected.type} mono />
              {selected.type !== 'sqlite' && <DetailRow label="Host" value={`${selected.host ?? 'localhost'}:${selected.port ?? ''}`} mono />}
              {selected.database && <DetailRow label={selected.type === 'sqlite' ? 'File' : 'Database'} value={selected.database} mono />}
              {selected.username && <DetailRow label="Username" value={selected.username} mono />}
              {selected.password && <DetailRow label="Password" value={'•'.repeat(selected.password.length)} mono />}
            </div>

            {/* Test result */}
            <TestResultPanel status={testStatus} result={testResult} />

            {/* Test button */}
            <button
              onClick={() => handleTest()}
              disabled={testStatus === 'testing'}
              className="mt-5 w-full bg-green-800 text-green-200 rounded px-4 py-2.5 text-sm font-mono hover:bg-green-700 disabled:opacity-50 transition-colors border border-green-700"
            >
              {testStatus === 'testing' ? '⟳  CONNECTING...' : 'TEST CONNECTION'}
            </button>

            {testResult?.ok && testResult.tables && testResult.tables.length > 0 && (
              <div className="mt-4">
                <div className="font-mono text-xs text-gray-400 mb-2 uppercase tracking-wide">Tables</div>
                <div className="bg-gray-900 rounded border border-gray-700 max-h-48 overflow-y-auto">
                  {testResult.tables.map(t => (
                    <div key={t} className="px-3 py-1.5 font-mono text-xs text-gray-300 border-b border-gray-700 last:border-0 hover:bg-gray-800">
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
            <div className="text-center font-mono text-gray-600">
              <div className="text-4xl mb-3">⊗</div>
              <div className="text-sm">No connection selected</div>
              <button
                onClick={openNew}
                className="mt-4 text-xs text-green-500 hover:text-green-400 border border-green-800 hover:border-green-600 rounded px-4 py-2 transition-colors"
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

function FormField({ label, children }: { label: string; placeholder?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-xs text-gray-400 mb-1.5 tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center px-3 py-2 gap-4">
      <span className="text-xs text-gray-500 w-20 flex-shrink-0">{label}</span>
      <span className={`text-xs text-gray-200 ${mono ? 'font-mono' : ''} break-all`}>{value}</span>
    </div>
  );
}
