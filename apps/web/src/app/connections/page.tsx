'use client';

import { useState, useEffect } from 'react';
import {
  type DbConnection,
  type DbType,
  loadConnections,
  upsertConnection,
  removeConnection,
  generateId,
} from '../../lib/connections';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

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

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function ConnectionsPage() {
  const [conns, setConns] = useState<DbConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<DbConnection>(emptyForm);
  const [isNew, setIsNew] = useState(true);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMsg, setTestMsg] = useState('');

  useEffect(() => {
    const list = loadConnections();
    setConns(list);
    if (list.length > 0) {
      setSelectedId(list[0].id);
      setForm({ ...list[0] });
      setIsNew(false);
    }
  }, []);

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
    try {
      const res = await fetch(`${API_BASE}/api/v1/connections/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json() as { tables?: string[]; latency?: number; error?: string };
        if (data.error) {
          setTestStatus('error');
          setTestMsg(data.error);
        } else {
          setTestStatus('ok');
          setTestMsg(`Connected · ${data.tables?.length ?? 0} tables · ${data.latency ?? '?'}ms`);
        }
      } else if (res.status === 404) {
        /* endpoint not yet implemented — fall back to raw TCP via /health */
        setTestStatus('error');
        setTestMsg('API server does not support connection testing yet (404)');
      } else {
        setTestStatus('error');
        setTestMsg(`HTTP ${res.status}`);
      }
    } catch (err) {
      setTestStatus('error');
      setTestMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  const cfg = DB_CONFIG[form.type];
  const badge = DB_BADGE[form.type];

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 160px)', minHeight: '500px' }}>
      <h1 className="font-pixel text-3xl text-fg shrink-0">[ Connections ]</h1>

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
              const active = selectedId === conn.id;
              return (
                <button
                  key={conn.id}
                  onClick={() => selectConn(conn)}
                  className={`w-full text-left px-2 py-2 border-b border-rim/30 flex items-center gap-2 transition-none ${active ? 'bg-accent' : 'hover:bg-rim/30'}`}
                >
                  <span
                    className="font-pixel text-xs shrink-0 px-1 py-0.5"
                    style={{ background: b.color, color: '#fff', minWidth: '26px', textAlign: 'center' }}
                  >
                    {b.abbr}
                  </span>
                  <div className="overflow-hidden min-w-0">
                    <div className={`font-pixel text-base leading-tight truncate ${active ? 'text-bg' : 'text-fg'}`}>
                      {conn.label || '(unnamed)'}
                    </div>
                    <div className={`font-mono text-[10px] truncate ${active ? 'text-bg/70' : 'text-fg-2'}`}>
                      {conn.type === 'sqlite'
                        ? (conn.host ?? '—')
                        : `${conn.host ?? 'localhost'}:${conn.port ?? ''}`}
                    </div>
                  </div>
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
              onClick={() => void testConn()}
              disabled={testStatus === 'testing'}
              className="font-pixel text-lg border-2 border-accent text-accent px-4 py-1 hover:bg-accent hover:text-bg transition-none disabled:opacity-40"
            >
              {testStatus === 'testing' ? '◌ Testing...' : '◈ Test'}
            </button>
            <button
              onClick={save}
              className="font-pixel text-lg bg-ok text-bg px-4 py-1 hover:opacity-80 transition-none shadow-px-o"
            >
              ✓ Save
            </button>
            {!isNew && (
              <button
                onClick={del}
                className="font-pixel text-lg border border-danger/50 text-danger px-4 py-1 hover:bg-danger hover:text-bg transition-none"
              >
                ✗ Delete
              </button>
            )}
          </div>

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
