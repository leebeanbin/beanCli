/**
 * ConnectionPickerOverlay
 *
 * IntelliJ IDEA–style two-pane data source manager:
 *   LEFT  pane — saved connection list (j/k to navigate)
 *   RIGHT pane — inline form for the selected connection (Tab to focus)
 *
 * Keys:
 *   List pane:  j/k   navigate  |  n  add new  |  d  delete  |  *  set default
 *               Tab   focus right pane  |  Enter  connect  |  Esc  skip to main
 *   Form pane:  Tab   next field  |  ↑↓  prev/next field  |  ←→  cycle DB type
 *               t     test connection  |  Enter  save + connect  |  Esc  back to list
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { useAppContext } from '../../context/AppContext.js';
import type { DbConnection, DbType } from '../../services/types.js';

// ── DB type metadata ──────────────────────────────────────────────────────────

const DB_TYPES: DbType[] = ['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis'];

const DB_META: Record<DbType, { color: string; icon: string; label: string; defaultPort?: number }> = {
  postgresql: { color: '#3b82f6', icon: 'PG', label: 'PostgreSQL', defaultPort: 5432 },
  mysql:      { color: '#f59e0b', icon: 'MY', label: 'MySQL',      defaultPort: 3306 },
  sqlite:     { color: '#10b981', icon: 'SQ', label: 'SQLite'                        },
  mongodb:    { color: '#22c55e', icon: 'MG', label: 'MongoDB',    defaultPort: 27017 },
  redis:      { color: '#ef4444', icon: 'RD', label: 'Redis',      defaultPort: 6379  },
};

// ── Form field types ──────────────────────────────────────────────────────────

type Field = 'label' | 'type' | 'host' | 'port' | 'database' | 'username' | 'password';

const FIELD_LABEL: Record<Field, string> = {
  label:    'Name',
  type:     'Driver',
  host:     'Host',
  port:     'Port',
  database: 'Database',
  username: 'User',
  password: 'Password',
};

// Prefix pre-filled in the URL input field (changes with driver type)
const URL_PREFIX: Record<DbType, string> = {
  postgresql: 'postgres://',
  mysql:      'mysql://',
  sqlite:     'sqlite:',
  mongodb:    'mongodb://',
  redis:      'redis://',
};

// Example placeholder values shown dimly in empty fields
const FIELD_EXAMPLE: Partial<Record<Field, string>> = {
  label:    'my-local',
  host:     'localhost',
  database: '(optional — pick after connect)',
  username: 'postgres',
  password: '••••••',
};

const ALL_FIELDS:    Field[] = ['label', 'type', 'host', 'port', 'database', 'username', 'password'];
const SQLITE_FIELDS: Field[] = ['label', 'type', 'database'];
const REDIS_FIELDS:  Field[] = ['label', 'type', 'host', 'port', 'database', 'password'];

function fieldsFor(dbType: DbType): Field[] {
  if (dbType === 'sqlite') return SQLITE_FIELDS;
  if (dbType === 'redis')  return REDIS_FIELDS;
  return ALL_FIELDS;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

type TestStatus  = 'idle' | 'testing' | 'ok' | 'error';
type PaneFocus   = 'list' | 'form';

interface FormVals extends Record<Field, string> {}

function genId(): string { return crypto.randomUUID().slice(0, 10); }

function toFormVals(conn: DbConnection | null): FormVals {
  return {
    label:    conn?.label    ?? '',
    type:     conn?.type     ?? 'postgresql',
    host:     conn?.host     ?? 'localhost',
    port:     conn?.port     != null ? String(conn.port) : '5432',
    database: conn?.database ?? '',
    username: conn?.username ?? '',
    password: conn?.password ?? '',
  };
}

function fromFormVals(vals: FormVals, original: DbConnection | null): DbConnection {
  const dbType = vals.type as DbType;
  return {
    id:        original?.id ?? genId(),
    label:     vals.label.trim() || `${vals.type}-${genId().slice(0, 4)}`,
    type:      dbType,
    host:      dbType !== 'sqlite' ? (vals.host.trim() || undefined) : undefined,
    port:      vals.port ? Number(vals.port) : undefined,
    database:  vals.database.trim() || undefined,
    username:  vals.username.trim() || undefined,
    password:  vals.password || undefined,
    isDefault: original?.isDefault,
  };
}

// ── ConnectionPickerOverlay ───────────────────────────────────────────────────

export const ConnectionPickerOverlay: React.FC = () => {
  const { stdout }    = useStdout();
  const termW         = stdout?.columns ?? 80;

  const {
    connectionService,
    connections, setConnections,
    setStartupPhase,
    setActiveConnection,
    setTables,
    setConnection,
  } = useAppContext();

  // ── Pane state ──────────────────────────────────────────────────────────────
  const [pane,      setPane]      = useState<PaneFocus>('list');
  const [cursor,    setCursor]    = useState(() => {
    const defIdx = connections.findIndex(c => c.isDefault);
    return defIdx >= 0 ? defIdx : 0;
  });

  // ── Form state ──────────────────────────────────────────────────────────────
  const [isNew,     setIsNew]     = useState(connections.length === 0);
  const [vals,      setVals]      = useState<FormVals>(() =>
    toFormVals(connections[0] ?? null),
  );
  // -1 = URL field active; 0..n = regular field index
  const [fieldIdx,  setFieldIdx]  = useState(-1);
  // URL input field — user types the part AFTER the prefix
  const [urlBuf,    setUrlBuf]    = useState('');

  // ── Test / connect state ─────────────────────────────────────────────────────
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMsg,    setTestMsg]    = useState('');
  const [spinIdx,    setSpinIdx]    = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [connectErr, setConnectErr] = useState<string | null>(null);

  // Spinner tick
  useEffect(() => {
    if (testStatus !== 'testing' && !connecting) return;
    const id = setInterval(() => setSpinIdx(i => (i + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, [testStatus, connecting]);

  // Mirror selected connection into form when cursor moves (list pane)
  useEffect(() => {
    if (!isNew) {
      setVals(toFormVals(connections[cursor] ?? null));
      setTestStatus('idle');
      setConnectErr(null);
    }
  }, [cursor, isNew]); // intentionally omits `connections` to avoid re-triggering on saves

  const dbType    = vals.type as DbType;
  const fields    = fieldsFor(dbType);
  // -1 stays -1 (URL field); 0..n clamped to fields range
  const safeFieldIdx = fieldIdx < 0 ? -1 : Math.min(fieldIdx, fields.length - 1);
  const meta      = DB_META[dbType] ?? { color: '#6b7280', icon: '??', label: dbType };
  const urlPrefix = URL_PREFIX[dbType] ?? 'postgres://';

  // Parse urlBuf → fill individual form fields (called on Tab/Enter from URL field)
  const applyUrl = useCallback(() => {
    const full = urlPrefix + urlBuf.trim();
    try {
      const u  = new URL(full);
      const db = u.pathname.replace(/^\//, '');
      setVals(prev => ({
        ...prev,
        host:     u.hostname  || prev.host,
        port:     u.port      || prev.port,
        database: db          || prev.database,
        username: u.username  || prev.username,
        password: u.password  ? decodeURIComponent(u.password) : prev.password,
      }));
      setUrlBuf('');
    } catch { /* keep urlBuf if unparseable */ }
  }, [urlBuf, urlPrefix]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const setVal = (f: Field, v: string) => setVals(p => ({ ...p, [f]: v }));

  const cycleType = (dir: 1 | -1) => {
    const idx  = DB_TYPES.indexOf(vals.type as DbType);
    const next = DB_TYPES[(idx + dir + DB_TYPES.length) % DB_TYPES.length]!;
    const m    = DB_META[next];
    setVals(p => ({
      ...p,
      type: next,
      port: m.defaultPort != null ? String(m.defaultPort) : '',
      host: next === 'sqlite' ? '' : (p.host || 'localhost'),
    }));
    setTestStatus('idle');
  };

  const reloadConns = useCallback((): DbConnection[] => {
    if (!connectionService) return [];
    const updated = connectionService.loadConnections();
    setConnections(updated);
    return updated;
  }, [connectionService, setConnections]);

  const saveForm = useCallback((): DbConnection => {
    const original = isNew ? null : (connections[cursor] ?? null);
    const conn = fromFormVals(vals, original);
    connectionService?.saveConnection(conn);
    const updated = reloadConns();
    const newIdx = updated.findIndex(c => c.id === conn.id);
    if (newIdx >= 0) setCursor(newIdx);
    setIsNew(false);
    return conn;
  }, [isNew, connections, cursor, vals, connectionService, reloadConns]);

  const runTest = useCallback(async () => {
    if (!connectionService || testStatus === 'testing') return;
    const original = isNew ? null : (connections[cursor] ?? null);
    const conn = fromFormVals(vals, original);
    setTestStatus('testing');
    setTestMsg('');
    const t0 = Date.now();
    const result = await connectionService.testConnection(conn);
    const ms = Date.now() - t0;
    if (result.error) {
      setTestStatus('error');
      setTestMsg(result.error);
    } else {
      setTestStatus('ok');
      setTestMsg(`${result.tables.length} tables · ${ms}ms`);
    }
  }, [connectionService, testStatus, isNew, connections, cursor, vals]);

  const doConnect = useCallback(async (conn: DbConnection) => {
    if (!connectionService || connecting) return;
    setConnecting(true);
    setConnectErr(null);
    const result = await connectionService.testConnection(conn);
    setConnecting(false);
    if (result.error) {
      setConnectErr(result.error);
      setPane('form');
    } else {
      setActiveConnection(conn);
      // sqlite / redis skip the DB picker (database = file path or index)
      const skipDbPicker = conn.type === 'sqlite' || conn.type === 'redis';
      if (skipDbPicker) {
        setTables(result.tables);
        setConnection(conn.label);
        setStartupPhase('table-picker');
      } else {
        // mysql / postgresql / mongodb — always verify first, then pick DB
        setStartupPhase('database-picker');
      }
    }
  }, [connectionService, connecting, setActiveConnection, setTables, setConnection, setStartupPhase]);

  // ── Input handling ──────────────────────────────────────────────────────────

  useInput((inp, key) => {
    if (connecting || testStatus === 'testing') return;

    // ── LIST pane ────────────────────────────────────────────────────────────
    if (pane === 'list') {
      if (key.upArrow   || inp === 'k') {
        setCursor(c => Math.max(0, c - 1));
        setIsNew(false);
        return;
      }
      if (key.downArrow || inp === 'j') {
        setCursor(c => Math.min(connections.length - 1, c + 1));
        setIsNew(false);
        return;
      }

      // n — add new draft
      if (inp === 'n') {
        setIsNew(true);
        setVals(toFormVals(null));
        setUrlBuf('');
        setTestStatus('idle');
        setConnectErr(null);
        setFieldIdx(-1);   // start at URL field
        setPane('form');
        return;
      }

      // d — delete selected
      if (inp === 'd' && connections.length > 0 && !isNew) {
        const conn = connections[cursor];
        if (conn) connectionService?.deleteConnection(conn.id);
        const updated = reloadConns();
        setCursor(c => Math.min(c, Math.max(0, updated.length - 1)));
        return;
      }

      // * — toggle default
      if (inp === '*' && connections.length > 0 && !isNew) {
        const conn = connections[cursor];
        if (conn) {
          const next = connections.map(c => ({
            ...c,
            isDefault: c.id === conn.id ? !c.isDefault : false,
          }));
          next.forEach(c => connectionService?.saveConnection(c));
          reloadConns();
        }
        return;
      }

      // Tab / → — focus form for editing (start at URL field)
      if (key.tab || key.rightArrow) {
        setPane('form');
        setFieldIdx(-1);
        setUrlBuf('');
        return;
      }

      // Esc — skip to main UI
      if (key.escape) {
        setStartupPhase('ready');
        return;
      }

      // Enter — connect to selected connection
      if (key.return && connections.length > 0 && !isNew) {
        const conn = connections[cursor];
        if (conn) void doConnect(conn);
        return;
      }
    }

    // ── FORM pane ────────────────────────────────────────────────────────────
    if (pane === 'form') {
      // t — test
      if (inp === 't' && !key.ctrl) { void runTest(); return; }

      // Esc — back to list
      if (key.escape) {
        if (isNew && connections.length > 0) {
          setIsNew(false);
          setVals(toFormVals(connections[cursor] ?? null));
        }
        setPane('list');
        return;
      }

      // Enter — save + connect
      if (key.return) {
        if (safeFieldIdx === -1) { applyUrl(); setFieldIdx(0); return; }
        const conn = saveForm();
        void doConnect(conn);
        return;
      }

      // Tab — cycle through URL field (-1) then regular fields
      if (key.tab && !key.shift) {
        if (safeFieldIdx === -1) { applyUrl(); setFieldIdx(0); }
        else setFieldIdx(i => (i + 1) % fields.length);
        return;
      }
      if (key.tab && key.shift) {
        if (safeFieldIdx === 0)  { setFieldIdx(-1); }
        else if (safeFieldIdx < 0) { setFieldIdx(fields.length - 1); }
        else setFieldIdx(i => i - 1);
        return;
      }

      // ── URL field input (fieldIdx === -1) ──────────────────────────────────
      if (safeFieldIdx === -1) {
        if (key.backspace || key.delete) { setUrlBuf(s => s.slice(0, -1)); return; }
        if (inp && inp.length === 1 && inp >= ' ' && !key.ctrl && !key.meta) {
          setUrlBuf(s => s + inp);
          return;
        }
        return;
      }

      const activeField = fields[safeFieldIdx]!;

      // Type field: ←→ cycles driver
      if (activeField === 'type') {
        if (key.leftArrow  || key.upArrow)   { cycleType(-1); return; }
        if (key.rightArrow || key.downArrow) { cycleType(1);  return; }
        return;
      }

      // Other fields: ↑↓ navigate
      if (key.upArrow)   { setFieldIdx(i => Math.max(-1, i - 1)); return; }
      if (key.downArrow) { setFieldIdx(i => Math.min(fields.length - 1, i + 1)); return; }

      // Text input
      if (key.backspace || key.delete) {
        setVal(activeField, vals[activeField].slice(0, -1));
        setTestStatus('idle');
        return;
      }
      if (inp && inp.length === 1 && inp >= ' ' && !key.ctrl && !key.meta) {
        setVal(activeField, vals[activeField] + inp);
        setTestStatus('idle');
      }
    }
  });

  // ── Layout metrics ──────────────────────────────────────────────────────────

  const W       = Math.min(termW - 2, 90);
  const LEFT_W  = 22;
  const RIGHT_W = W - LEFT_W - 4; // 4 = outer box padding (L+R) and separator

  // ── Connecting spinner ──────────────────────────────────────────────────────

  if (connecting) {
    const conn = isNew
      ? fromFormVals(vals, null)
      : (connections[cursor] ?? fromFormVals(vals, null));
    return (
      <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
        <Box
          flexDirection="column"
          borderStyle="double"
          borderColor="#00d4ff"
          width={50}
          paddingX={2}
          paddingY={1}
        >
          <Text color="#00d4ff" bold>  Connecting...</Text>
          <Text>{' '}</Text>
          <Text color="#f59e0b">{SPINNER[spinIdx]}  {conn.label}</Text>
          <Text color="#4a5568">
            {'   '}{conn.type}
            {conn.host ? ` · ${conn.host}` : ''}
            {conn.port ? `:${conn.port}` : ''}
            {conn.database ? `/${conn.database}` : ''}
          </Text>
        </Box>
      </Box>
    );
  }

  // ── Two-pane layout ─────────────────────────────────────────────────────────

  const listActive = pane === 'list';
  const formActive = pane === 'form';

  // Cursor blink for active text field
  const blink = Math.floor(Date.now() / 600) % 2 === 0 ? '█' : '▌';

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor="#00d4ff"
        width={W}
      >

        {/* ── Title ──────────────────────────────────────────────────────────── */}
        <Box paddingX={2} paddingY={0}>
          <Text color="#00d4ff" bold>DATA SOURCES</Text>
          <Text color="#1e3a5f">  ·  beanCLI</Text>
        </Box>

        {/* ── Two panes ──────────────────────────────────────────────────────── */}
        <Box flexDirection="row">

          {/* LEFT: connection list */}
          <Box
            flexDirection="column"
            width={LEFT_W + 2}
            borderStyle="single"
            borderColor={listActive ? '#00d4ff' : '#1e3a5f'}
          >

            {/* "+ Add new" row */}
            <Box>
              <Text
                color={isNew && formActive ? '#00d4ff' : (listActive ? '#10b981' : '#374151')}
                bold={isNew && formActive}
              >
                {isNew && pane === 'form' ? '▶ ' : '  '}
                {'+ Add new...'}
              </Text>
            </Box>
            <Text color="#1a2a3a">{'─'.repeat(LEFT_W)}</Text>

            {/* Connection entries */}
            {connections.length === 0 && !isNew && (
              <Text color="#374151" dimColor>  (no connections)</Text>
            )}
            {connections.map((conn, i) => {
              const isSel  = i === cursor && !isNew;
              const m      = DB_META[conn.type] ?? { color: '#6b7280', icon: '??' };
              const bg     = isSel && listActive ? '#00d4ff' : undefined;
              const fg     = isSel && listActive ? '#0a1628' : '#e0e0e0';
              const fgType = isSel && listActive ? '#0a1628' : m.color;
              const star   = conn.isDefault ? '★' : ' ';
              const arrow  = isSel ? '▶' : ' ';
              // Highlight selected in list pane even when form is focused
              const fgInactive = isSel ? '#00d4ff' : '#a0aec0';

              return (
                <Box key={conn.id}>
                  <Text
                    color={listActive ? fgType : (isSel ? m.color : '#4a5568')}
                    backgroundColor={bg}
                    bold={isSel && listActive}
                  >
                    {`${arrow}${star}${m.icon} `}
                  </Text>
                  <Text
                    color={listActive ? fg : fgInactive}
                    backgroundColor={bg}
                    bold={isSel && listActive}
                  >
                    {conn.label.slice(0, LEFT_W - 5)}
                  </Text>
                </Box>
              );
            })}
          </Box>

          {/* RIGHT: inline form */}
          <Box
            flexDirection="column"
            flexGrow={1}
            borderStyle="single"
            borderColor={formActive ? '#00d4ff' : '#1e3a5f'}
            paddingX={1}
          >
            {/* DB type header */}
            <Box gap={1}>
              <Text color={meta.color} bold>{'●'}</Text>
              <Text color={meta.color} bold>{meta.label}</Text>
              {!formActive && connections.length > 0 && (
                <Text color="#374151" dimColor>Tab / → to edit</Text>
              )}
              {isNew && formActive && (
                <Text color="#f59e0b"> (new — unsaved)</Text>
              )}
            </Box>
            <Text color="#1a2a3a">{'─'.repeat(RIGHT_W - 2)}</Text>

            {/* Form fields */}
            {(connections.length > 0 || isNew) ? (
              <>
              {/* URL quick-fill field — always first, fieldIdx === -1 */}
              <Box>
                <Text color={formActive && safeFieldIdx === -1 ? '#00d4ff' : '#4a5568'}>
                  {'  URL        '}
                </Text>
                <Text color="#374151" dimColor>{urlPrefix}</Text>
                <Text color={formActive && safeFieldIdx === -1 ? '#e0e0e0' : '#4a5568'}>
                  {urlBuf}
                  {formActive && safeFieldIdx === -1 ? blink : ''}
                </Text>
              </Box>
              {fields.map((field, i) => {
                const isActiveField = formActive && i === safeFieldIdx;
                const raw           = vals[field];
                const display       = field === 'password' ? '•'.repeat(raw.length) : raw;
                const label         = FIELD_LABEL[field] ?? field;

                return (
                  <Box key={field}>
                    <Text color={isActiveField ? '#00d4ff' : '#4a5568'}>
                      {`  ${label.padEnd(9)}  `}
                    </Text>
                    {field === 'type' ? (
                      <Text color={isActiveField ? meta.color : '#6b7280'} bold={isActiveField}>
                        {isActiveField
                          ? `◀  ${meta.label.padEnd(12)} ▶`
                          : meta.label}
                      </Text>
                    ) : (
                      <Text color={isActiveField ? '#e0e0e0' : '#6b7280'}>
                        {display
                          ? display
                          : (isActiveField
                              ? ''
                              : (FIELD_EXAMPLE[field]
                                  ? <Text color="#374151" dimColor>{FIELD_EXAMPLE[field]}</Text>
                                  : <Text color="#374151" dimColor>—</Text>)
                            )
                        }
                        {isActiveField ? blink : ''}
                      </Text>
                    )}
                  </Box>
                );
              })}
              </>
            ) : (
              <Box flexDirection="column" paddingY={1}>
                <Text color="#374151" dimColor>  No connection selected.</Text>
                <Text color="#4a5568">  Press <Text color="#10b981" bold>n</Text> to add a new connection.</Text>
              </Box>
            )}

            <Text color="#1a2a3a">{'─'.repeat(RIGHT_W - 2)}</Text>

            {/* Test button + result */}
            <Box flexDirection="column">
              <Box gap={2}>
                <Text color={formActive ? '#00d4ff' : '#2d4a6e'} bold={formActive}>
                  {testStatus === 'testing'
                    ? `  ${SPINNER[spinIdx]} Testing...`
                    : '  t: Test Connection'}
                </Text>
              </Box>
              {testStatus === 'ok' && (
                <Text color="#10b981">{'  ✓ Connected · '}{testMsg}</Text>
              )}
              {testStatus === 'error' && (
                <Box flexDirection="column">
                  <Text color="#ef4444" bold>{'  ✗ Connection failed'}</Text>
                  <Text color="#ef4444" wrap="wrap">{'  '}{testMsg}</Text>
                </Box>
              )}
              {connectErr && testStatus !== 'error' && (
                <Box flexDirection="column">
                  <Text color="#ef4444" bold>{'  ✗ Connect failed'}</Text>
                  <Text color="#ef4444" wrap="wrap">{'  '}{connectErr}</Text>
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        {/* ── Footer hints ───────────────────────────────────────────────────── */}
        <Box paddingX={2}>
          {pane === 'list' ? (
            <Text color="#374151">
              {'j/k:move  Tab:edit  n:add  d:delete  ★:default  Enter:connect  Esc:skip'}
            </Text>
          ) : (
            <Text color="#374151">
              {'Tab:next field  ←→:driver  ↑↓:fields  t:test  Enter:connect  Esc:back'}
            </Text>
          )}
        </Box>

      </Box>
    </Box>
  );
};
