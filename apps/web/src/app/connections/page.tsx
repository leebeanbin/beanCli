'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  type DbConnection,
  type DbType,
  loadConnections,
  upsertConnection,
  removeConnection,
  generateId,
  getActiveConnection,
  setActiveConnection,
  clearActiveConnection,
} from '../../lib/connections';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

/* ── Diagnostics helper ───────────────────────────────────────────────────── */
type DiagLog = { ts: string; level: 'info' | 'ok' | 'error' | 'warn'; msg: string };

function diagMsg(level: DiagLog['level'], msg: string): DiagLog {
  return { ts: new Date().toISOString().slice(11, 23), level, msg };
}

/** Classify a fetch error into a human-readable message */
function classifyFetchError(err: unknown, url: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return `Timeout — API server at ${url} did not respond within 8s`;
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'Request cancelled';
  }
  // Firefox: "NetworkError when attempting to fetch"
  // Chrome: "Failed to fetch"
  // Safari: "Load failed"
  if (/failed to fetch|networkerror|load failed|connection refused/i.test(msg)) {
    return `Cannot reach API server at ${url} — is it running? (pnpm dev:api)`;
  }
  return msg;
}

type ApiHealth = 'unknown' | 'checking' | 'up' | 'down';

/* ── DB type metadata ─────────────────────────────────────────────────────── */
const DB_TYPES: DbType[] = [
  'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis',
  'kafka', 'rabbitmq', 'elasticsearch', 'nats',
];

const DB_BADGE: Record<DbType, { abbr: string; color: string }> = {
  postgresql:    { abbr: 'PG', color: '#336791' },
  mysql:         { abbr: 'MY', color: '#e48e00' },
  sqlite:        { abbr: 'SQ', color: '#44a347' },
  mongodb:       { abbr: 'MG', color: '#13aa52' },
  redis:         { abbr: 'RD', color: '#d92b21' },
  kafka:         { abbr: 'KF', color: '#231f20' },
  rabbitmq:      { abbr: 'RB', color: '#ff6600' },
  elasticsearch: { abbr: 'ES', color: '#005571' },
  nats:          { abbr: 'NT', color: '#27aee0' },
};

interface DbConfig {
  defaultPort: string;
  hostLabel: string;
  dbLabel: string;
  hasDb: boolean;
  hasUsername: boolean;
  hasPassword: boolean;
}

const DB_CONFIG: Record<DbType, DbConfig> = {
  postgresql:    { defaultPort: '5432',  hostLabel: 'Host',    dbLabel: 'Database',          hasDb: true,  hasUsername: true,  hasPassword: true  },
  mysql:         { defaultPort: '3306',  hostLabel: 'Host',    dbLabel: 'Database',          hasDb: true,  hasUsername: true,  hasPassword: true  },
  sqlite:        { defaultPort: '',      hostLabel: 'File',    dbLabel: '',                  hasDb: false, hasUsername: false, hasPassword: false },
  mongodb:       { defaultPort: '27017', hostLabel: 'Host',    dbLabel: 'Database',          hasDb: true,  hasUsername: true,  hasPassword: true  },
  redis:         { defaultPort: '6379',  hostLabel: 'Host',    dbLabel: '',                  hasDb: false, hasUsername: false, hasPassword: true  },
  kafka:         { defaultPort: '9092',  hostLabel: 'Brokers', dbLabel: 'Topic (optional)',   hasDb: true,  hasUsername: false, hasPassword: false },
  rabbitmq:      { defaultPort: '5672',  hostLabel: 'Host',    dbLabel: 'VHost',             hasDb: true,  hasUsername: true,  hasPassword: true  },
  elasticsearch: { defaultPort: '9200',  hostLabel: 'Host',    dbLabel: 'Index (optional)',  hasDb: true,  hasUsername: false, hasPassword: false },
  nats:          { defaultPort: '4222',  hostLabel: 'Host',    dbLabel: 'Stream (optional)', hasDb: true,  hasUsername: false, hasPassword: false },
};

function emptyForm(): DbConnection {
  return { id: generateId(), label: '', type: 'postgresql', host: 'localhost', port: 5432, database: '', username: '', password: '' };
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';
type ConfirmAction = 'test' | 'connect';

/* ── Security Confirm Modal ──────────────────────────────────────────────── */
function SecurityConfirmModal({
  conn,
  action,
  onConfirm,
  onCancel,
}: {
  conn: DbConnection;
  action: ConfirmAction;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const target = conn.type === 'sqlite'
    ? (conn.host ?? 'local file')
    : `${conn.host ?? 'localhost'}:${conn.port ?? ''}${conn.database ? `/${conn.database}` : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg border-2 border-warn shadow-px-a max-w-md w-full mx-4 font-pixel">
        {/* Header */}
        <div className="border-b-2 border-warn px-4 py-2 flex items-center gap-2">
          <span className="text-warn text-xl">⚠</span>
          <span className="text-warn text-xl">[ Security Confirmation ]</span>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          <div className="font-mono text-sm text-fg-2 leading-relaxed">
            You are about to{' '}
            <span className="text-accent">{action === 'connect' ? 'connect to' : 'test'}</span>{' '}
            the following external data source:
          </div>

          {/* Connection details */}
          <div className="bg-bg-2 border border-rim px-3 py-2 space-y-1">
            <div className="flex gap-2">
              <span className="text-fg-2 text-sm w-20 shrink-0">Type</span>
              <span className="text-accent text-sm">{conn.type.toUpperCase()}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-fg-2 text-sm w-20 shrink-0">Target</span>
              <span className="text-fg text-sm font-mono break-all">{target}</span>
            </div>
            {conn.username && (
              <div className="flex gap-2">
                <span className="text-fg-2 text-sm w-20 shrink-0">User</span>
                <span className="text-fg text-sm font-mono">{conn.username}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-fg-2 text-sm w-20 shrink-0">Label</span>
              <span className="text-fg text-sm">{conn.label || '(unnamed)'}</span>
            </div>
          </div>

          {/* Warning */}
          <div className="border border-warn/40 bg-warn/5 px-3 py-2 font-mono text-xs text-warn space-y-1">
            <div>• Only connect to databases you own or are authorized to access.</div>
            <div>• Credentials are stored locally in your browser (localStorage).</div>
            <div>• Queries you run will be visible in the API server logs.</div>
            {action === 'connect' && (
              <div>• All subsequent queries on Query/Explore pages will use this connection.</div>
            )}
          </div>

          {/* Checkbox */}
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span className="font-mono text-xs text-fg leading-relaxed">
              I confirm I am authorized to access this data source and understand the above.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="border-t border-rim px-4 py-3 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="font-pixel text-base border border-rim text-fg-2 px-4 py-1 hover:border-accent hover:text-accent transition-none"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!checked}
            className="font-pixel text-base border-2 border-ok text-ok px-4 py-1 hover:bg-ok hover:text-bg transition-none disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {action === 'connect' ? '▶ Connect' : '◈ Test'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function ConnectionsPage() {
  const [conns, setConns] = useState<DbConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<DbConnection>(emptyForm);
  const [isNew, setIsNew] = useState(true);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState<ApiHealth>('unknown');
  const [diagLogs, setDiagLogs] = useState<DiagLog[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const pushLog = useCallback((level: DiagLog['level'], msg: string) => {
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      `[BeanCLI ${level.toUpperCase()}]`, msg
    );
    setDiagLogs((prev) => [...prev.slice(-49), diagMsg(level, msg)]);
  }, []);

  const checkApiHealth = useCallback(async () => {
    setApiHealth('checking');
    try {
      const r = await fetch(`${API_BASE}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (r.ok) {
        setApiHealth('up');
        try {
          const h = await r.json() as { status?: string; db?: string; kafka?: string };
          pushLog('ok', `API server up — db:${h.db ?? '?'} kafka:${h.kafka ?? '?'}`);
        } catch {
          pushLog('ok', `API server is reachable at ${API_BASE}`);
        }
      } else {
        setApiHealth('down');
        pushLog('warn', `API server returned HTTP ${r.status}`);
      }
    } catch (err) {
      setApiHealth('down');
      pushLog('error', classifyFetchError(err, API_BASE));
    }
  }, [pushLog]);

  useEffect(() => {
    const list = loadConnections();
    setConns(list);
    const active = getActiveConnection();
    setActiveId(active?.id ?? null);
    if (list.length > 0) {
      const toSelect = active ? (list.find((c) => c.id === active.id) ?? list[0]) : list[0];
      setSelectedId(toSelect!.id);
      setForm({ ...toSelect! });
      setIsNew(false);
    }
    void checkApiHealth();
  }, [checkApiHealth]);

  function selectConn(conn: DbConnection) {
    setSelectedId(conn.id);
    setForm({ ...conn });
    setIsNew(false);
    setTestStatus('idle');
    setTestMsg('');
  }

  function startNew() {
    const f = emptyForm();
    setSelectedId(null);
    setForm(f);
    setIsNew(true);
    setTestStatus('idle');
    setTestMsg('');
  }

  function changeType(type: DbType) {
    const cfg = DB_CONFIG[type];
    setForm((f) => ({
      ...f,
      type,
      port: cfg.defaultPort ? parseInt(cfg.defaultPort) : undefined,
    }));
  }

  function save() {
    if (!form.label.trim()) { alert('Label is required'); return; }
    upsertConnection(form);
    const updated = loadConnections();
    setConns(updated);
    setSelectedId(form.id);
    setIsNew(false);
  }

  function del() {
    if (!window.confirm(`Delete "${form.label}"?`)) return;
    removeConnection(form.id);
    const updated = loadConnections();
    setConns(updated);
    if (updated.length > 0) {
      selectConn(updated[0]);
    } else {
      startNew();
    }
  }

  async function testConn() {
    setTestStatus('testing');
    setTestMsg('');
    const url = `${API_BASE}/api/v1/connections/test`;
    pushLog('info', `Testing connection: ${form.type}://${form.host ?? ''}:${form.port ?? ''}`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json() as { tables?: string[]; databases?: string[]; ok?: boolean; latency?: number; error?: string };
        if (data.error) {
          setTestStatus('error');
          setTestMsg(data.error);
          pushLog('error', `DB error: ${data.error}`);
        } else {
          const tableCount = data.tables?.length ?? 0;
          const dbList = data.databases;
          let msg = `Connected · ${tableCount} tables`;
          if (!form.database && dbList?.length) {
            msg += ` · ${dbList.length} databases: ${dbList.slice(0, 5).join(', ')}${dbList.length > 5 ? ` +${dbList.length - 5}` : ''}`;
          }
          setTestStatus('ok');
          setTestMsg(msg);
          pushLog('ok', msg);
          if (!form.database && dbList?.length) {
            pushLog('info', `Tip: Set the "Database" field to one of: ${dbList.join(', ')}`);
          }
        }
      } else if (res.status === 404) {
        const msg = 'API server does not support connection testing (404)';
        setTestStatus('error');
        setTestMsg(msg);
        pushLog('error', msg);
      } else {
        let detail = `HTTP ${res.status}`;
        try { const d = await res.json() as { error?: string }; if (d.error) detail = d.error; } catch { /* ignore */ }
        setTestStatus('error');
        setTestMsg(detail);
        pushLog('error', `Test failed: ${detail}`);
      }
    } catch (err) {
      const msg = classifyFetchError(err, API_BASE);
      setTestStatus('error');
      setTestMsg(msg);
      pushLog('error', msg);
      if (apiHealth !== 'up') void checkApiHealth();
    }
  }

  async function connectConn() {
    setTestStatus('testing');
    setTestMsg('');
    const url = `${API_BASE}/api/v1/connections/test`;
    pushLog('info', `Connecting: ${form.type}://${form.host ?? ''}:${form.port ?? ''}/${form.database ?? ''}`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        signal: AbortSignal.timeout(8000),
      });
      let data: { tables?: string[]; databases?: string[]; ok?: boolean; error?: string } = {};
      try { data = await res.json() as typeof data; } catch { /* ignore */ }
      if (!res.ok || data.error) {
        const msg = data.error ?? `HTTP ${res.status}`;
        setTestStatus('error');
        setTestMsg(msg);
        pushLog('error', `Connect failed: ${msg}`);
        return;
      }
      upsertConnection(form);
      setActiveConnection(form);
      setActiveId(form.id);
      setConns(loadConnections());
      setIsNew(false);
      const tableCount = data.tables?.length ?? 0;
      const dbList = data.databases;
      let connMsg = `Connected · ${tableCount} tables · active`;
      if (!form.database && dbList?.length) {
        connMsg += ` (no DB selected — ${dbList.length} DBs available)`;
        pushLog('info', `Available databases: ${dbList.join(', ')}`);
        pushLog('info', `Set "Database" field and reconnect to scope to a specific DB`);
      }
      setTestStatus('ok');
      setTestMsg(connMsg);
      pushLog('ok', `Connection set as active — ${tableCount} tables`);
    } catch (err) {
      const msg = classifyFetchError(err, API_BASE);
      setTestStatus('error');
      setTestMsg(msg);
      pushLog('error', msg);
      if (apiHealth !== 'up') void checkApiHealth();
    }
  }

  function disconnect() {
    clearActiveConnection();
    setActiveId(null);
    setTestStatus('idle');
    setTestMsg('');
    pushLog('info', 'Disconnected — active connection cleared');
  }

  const cfg = DB_CONFIG[form.type];
  const badge = DB_BADGE[form.type];

  function handleConfirm() {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === 'test') void testConn();
    else if (action === 'connect') void connectConn();
  }

  const healthColor = apiHealth === 'up' ? 'text-ok border-ok/30 bg-ok/5'
    : apiHealth === 'down' ? 'text-danger border-danger/30 bg-danger/5'
    : apiHealth === 'checking' ? 'text-warn border-warn/30 bg-warn/5'
    : 'text-fg-2 border-rim';
  const healthDot = apiHealth === 'up' ? '●' : apiHealth === 'down' ? '●' : '◌';
  const healthLabel = apiHealth === 'up' ? `API server up — ${API_BASE}`
    : apiHealth === 'down' ? `API server unreachable — ${API_BASE} (run: pnpm dev:api)`
    : apiHealth === 'checking' ? 'Checking API server...'
    : 'API server status unknown';

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 160px)', minHeight: '500px' }}>
      {confirmAction && (
        <SecurityConfirmModal
          conn={form}
          action={confirmAction}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      <div className="flex items-center gap-3 shrink-0">
        <h1 className="font-pixel text-3xl text-fg">[ Connections ]</h1>
        {/* API health badge */}
        <button
          onClick={() => void checkApiHealth()}
          className={`font-mono text-xs px-2 py-0.5 border ${healthColor} hover:opacity-80 transition-none`}
          title="Click to recheck API server health"
        >
          {healthDot} {healthLabel}
        </button>
      </div>

      {/* ── API server down banner ─── */}
      {apiHealth === 'down' && (
        <div className="shrink-0 border border-danger/40 bg-danger/5 px-4 py-3 font-mono text-xs text-danger space-y-1">
          <div className="font-pixel text-base text-danger">✗ API server is not running</div>
          <div>The web console requires the BeanCLI API server to proxy database connections.</div>
          <div className="mt-1 text-fg-2">
            <span className="text-warn">Start it with:</span>{' '}
            <code className="bg-bg px-1">pnpm dev:api</code>
            {' '}or{' '}
            <code className="bg-bg px-1">pnpm dev:all</code>
          </div>
          <div className="text-fg-2">
            For <span className="text-accent">mock mode</span> (no DB needed), use the TUI:{' '}
            <code className="bg-bg px-1">beancli --mock</code>
          </div>
        </div>
      )}

      <div className="flex-1 flex border-2 border-rim overflow-hidden shadow-px">
        {/* ── Left pane: list ─────────────────────────────────────────────── */}
        <div className="w-52 shrink-0 flex flex-col border-r-2 border-rim bg-bg-2">
          <div className="font-pixel text-base text-fg-2 px-3 py-1.5 border-b border-rim shrink-0">
            Saved ({conns.length})
          </div>

          <div className="flex-1 overflow-y-auto">
            {conns.length === 0 && (
              <div className="font-mono text-xs text-fg-2 p-3 opacity-50">
                No connections saved.
              </div>
            )}
            {conns.map((conn) => {
              const b = DB_BADGE[conn.type];
              const selected = selectedId === conn.id;
              const isActive = activeId === conn.id;
              return (
                <button
                  key={conn.id}
                  onClick={() => selectConn(conn)}
                  className={`w-full text-left px-2 py-2 border-b border-rim/30 flex items-center gap-2 transition-none ${selected ? 'bg-accent' : 'hover:bg-rim/30'}`}
                >
                  <span
                    className="font-pixel text-xs shrink-0 px-1 py-0.5"
                    style={{ background: b.color, color: '#fff', minWidth: '26px', textAlign: 'center' }}
                  >
                    {b.abbr}
                  </span>
                  <div className="overflow-hidden min-w-0 flex-1">
                    <div className={`font-pixel text-base leading-tight truncate ${selected ? 'text-bg' : 'text-fg'}`}>
                      {conn.label || '(unnamed)'}
                    </div>
                    <div className={`font-mono text-[10px] truncate ${selected ? 'text-bg/70' : 'text-fg-2'}`}>
                      {conn.type === 'sqlite'
                        ? (conn.host ?? '—')
                        : `${conn.host ?? 'localhost'}:${conn.port ?? ''}`}
                    </div>
                  </div>
                  {isActive && (
                    <span className="font-pixel text-[10px] text-ok shrink-0">●</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={startNew}
            className="font-pixel text-base text-ok border-t-2 border-rim px-3 py-2 hover:bg-ok hover:text-bg transition-none shrink-0"
          >
            + New Connection
          </button>
        </div>

        {/* ── Right pane: form ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-bg p-5 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center gap-3 shrink-0">
            <span
              className="font-pixel text-lg px-2 py-0.5"
              style={{ background: badge.color, color: '#fff' }}
            >
              {badge.abbr}
            </span>
            <span className="font-pixel text-xl text-accent">
              {isNew ? '[ New Connection ]' : `[ ${form.label || 'Edit'} ]`}
            </span>
          </div>

          {/* DB type selector */}
          <div className="shrink-0">
            <div className="font-pixel text-base text-fg-2 mb-2">Type</div>
            <div className="flex flex-wrap gap-1">
              {DB_TYPES.map((t) => {
                const b = DB_BADGE[t];
                const active = form.type === t;
                return (
                  <button
                    key={t}
                    onClick={() => changeType(t)}
                    className="font-pixel text-sm px-2 py-1 transition-none"
                    style={{
                      background: active ? b.color : 'transparent',
                      color: active ? '#fff' : b.color,
                      border: `1px solid ${b.color}`,
                      opacity: active ? 1 : 0.55,
                    }}
                  >
                    {b.abbr} {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Label */}
          <FormField
            label="Label *"
            value={form.label}
            onChange={(v) => setForm((f) => ({ ...f, label: v }))}
            placeholder="My Postgres"
          />

          {/* Host / File / Brokers */}
          <div className="flex gap-3">
            <div className="flex-1">
              <FormField
                label={cfg.hostLabel}
                value={form.host ?? ''}
                onChange={(v) => setForm((f) => ({ ...f, host: v }))}
                placeholder={
                  form.type === 'kafka'
                    ? 'localhost:9092'
                    : form.type === 'sqlite'
                      ? '/path/to/db.sqlite'
                      : 'localhost'
                }
              />
            </div>
            {form.type !== 'sqlite' && (
              <div className="w-24">
                <FormField
                  label="Port"
                  value={form.port?.toString() ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, port: v ? parseInt(v) : undefined }))}
                  placeholder={cfg.defaultPort}
                  type="number"
                />
              </div>
            )}
          </div>

          {/* Database / VHost / Topic / Index */}
          {cfg.hasDb && (
            <FormField
              label={cfg.dbLabel}
              value={form.database ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, database: v }))}
              placeholder=""
            />
          )}

          {/* Username */}
          {cfg.hasUsername && (
            <FormField
              label="Username"
              value={form.username ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, username: v }))}
              placeholder="postgres"
            />
          )}

          {/* Password */}
          {cfg.hasPassword && (
            <FormField
              label={cfg.hasUsername ? 'Password' : 'Password (optional)'}
              value={form.password ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, password: v }))}
              placeholder=""
              type="password"
            />
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap pt-1 shrink-0">
            <button
              onClick={() => setConfirmAction('connect')}
              disabled={testStatus === 'testing'}
              className="font-pixel text-lg border-2 border-ok text-ok px-4 py-1 hover:bg-ok hover:text-bg transition-none disabled:opacity-40 shadow-px-o"
            >
              {testStatus === 'testing' ? '◌ Connecting...' : '▶ Connect'}
            </button>
            <button
              onClick={() => setConfirmAction('test')}
              disabled={testStatus === 'testing'}
              className="font-pixel text-lg border-2 border-accent text-accent px-4 py-1 hover:bg-accent hover:text-bg transition-none disabled:opacity-40"
            >
              ◈ Test
            </button>
            <button
              onClick={save}
              className="font-pixel text-lg border border-rim text-fg-2 px-4 py-1 hover:border-accent hover:text-accent transition-none"
            >
              ✓ Save
            </button>
            {activeId === form.id && (
              <button
                onClick={disconnect}
                className="font-pixel text-lg border border-ok/40 text-ok/70 px-4 py-1 hover:border-danger hover:text-danger transition-none"
              >
                ◻ Disconnect
              </button>
            )}
            {!isNew && (
              <button
                onClick={del}
                className="font-pixel text-lg border border-danger/50 text-danger px-4 py-1 hover:bg-danger hover:text-bg transition-none"
              >
                ✗ Delete
              </button>
            )}
          </div>

          {/* Active badge */}
          {activeId === form.id && (
            <div className="font-pixel text-base text-ok bg-ok/10 border border-ok/30 px-3 py-1.5 shrink-0">
              ● ACTIVE — queries use this connection
            </div>
          )}

          {/* Test result */}
          {testStatus !== 'idle' && (
            <div
              className={`font-mono text-sm px-3 py-2 border shrink-0 ${
                testStatus === 'ok'
                  ? 'border-ok/40 text-ok bg-ok/5'
                  : testStatus === 'error'
                    ? 'border-danger/40 text-danger bg-danger/5'
                    : 'border-warn/30 text-warn'
              }`}
            >
              {testStatus === 'ok' && `✓ ${testMsg}`}
              {testStatus === 'error' && `✗ ${testMsg}`}
              {testStatus === 'testing' && '◌ Connecting...'}
            </div>
          )}
        </div>
      </div>

      {/* ── Diagnostic log ──────────────────────────────────────────────────── */}
      {diagLogs.length > 0 && (
        <div className="shrink-0 border border-rim bg-bg-2">
          <div className="flex items-center justify-between px-3 py-1 border-b border-rim">
            <span className="font-pixel text-base text-fg-2">[ Diagnostic Log ]</span>
            <button
              onClick={() => setDiagLogs([])}
              className="font-mono text-xs text-fg-2 hover:text-danger transition-none"
            >
              clear
            </button>
          </div>
          <div className="overflow-y-auto max-h-36 px-3 py-1 space-y-0.5">
            {diagLogs.map((log, i) => (
              <div key={i} className="flex gap-2 font-mono text-xs">
                <span className="text-fg-2 shrink-0">{log.ts}</span>
                <span className={
                  log.level === 'ok' ? 'text-ok'
                  : log.level === 'error' ? 'text-danger'
                  : log.level === 'warn' ? 'text-warn'
                  : 'text-fg-2'
                }>
                  {log.level === 'ok' ? '✓' : log.level === 'error' ? '✗' : log.level === 'warn' ? '!' : '·'}
                </span>
                <span className="text-fg">{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared form field ──────────────────────────────────────────────────────── */
function FormField({
  label, value, onChange, placeholder = '', type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="font-pixel text-base text-fg-2 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full font-mono text-sm bg-bg-2 border border-rim text-fg px-3 py-1.5 focus:outline-none focus:border-accent"
      />
    </div>
  );
}
