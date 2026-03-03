import {
  RenderLoop,
  TerminalCanvas,
  EventBus,
  Layout,
  AppState,
  ViewportState,
  OptimisticPatchManager,
  ExploreScene,
  MonitorScene,
  AuditScene,
  RecoveryScene,
  IndexLabScene,
  AiChatScene,
  TuiWsClient,
  NodeWsTransport,
  StatusBar,
  CommandLine,
  SceneTabBar,
  SplashScene,
  TableSelectScene,
  ConnectionScene,
} from '@tfsdc/ui-tui';
import type { IScene, StreamHealthStat, IndexInfo, TableMeta, TableStatRow, DbConnection, DbType } from '@tfsdc/ui-tui';
import { loadConnections, upsertConnection, removeConnection } from './connections.js';
import { createAdapter, initDbAdapters } from '@tfsdc/infrastructure';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const API_URL = process.env.API_URL ?? 'http://localhost:3100';
const WS_URL = process.env.WS_URL ?? 'ws://localhost:3100/ws';
const CLI_ENV = (process.env.APP_ENV?.toUpperCase() ?? 'DEV') as string;
const schemaLoaded = new Set<string>();

const DEFAULT_TABLES: TableMeta[] = [
  { name: 'state_orders',    rowEstimate: 0, sizeBytes: 0, sizeHuman: '?' },
  { name: 'state_users',     rowEstimate: 0, sizeBytes: 0, sizeHuman: '?' },
  { name: 'state_products',  rowEstimate: 0, sizeBytes: 0, sizeHuman: '?' },
  { name: 'state_payments',  rowEstimate: 0, sizeBytes: 0, sizeHuman: '?' },
  { name: 'state_shipments', rowEstimate: 0, sizeBytes: 0, sizeHuman: '?' },
];

/** Parse a postgres/mysql/mongodb URL into a partial DbConnection */
function parseDbUrl(url: string): Partial<DbConnection> | null {
  try {
    const u = new URL(url);
    const proto = u.protocol.replace(':', '');
    const typeMap: Record<string, DbType> = {
      postgres: 'postgresql', postgresql: 'postgresql',
      mysql: 'mysql',
      mongodb: 'mongodb',
      redis: 'redis',
      rediss: 'redis',
    };
    const type = typeMap[proto];
    if (!type) return null;
    return {
      type,
      host:     u.hostname || 'localhost',
      port:     u.port ? Number(u.port) : undefined,
      database: u.pathname.replace(/^\//, '') || undefined,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    };
  } catch { return null; }
}

// ── Session token management ──────────────────────────────────
const SESSION_DIR  = join(homedir(), '.config', 'beanCli');
const SESSION_FILE = join(SESSION_DIR, 'session.json');

interface Session {
  token:    string;
  username: string;
  role:     string;
}

function loadSession(): Session | null {
  try {
    if (!existsSync(SESSION_FILE)) return null;
    return JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as Session;
  } catch { return null; }
}

function _saveSession(session: Session): void {
  mkdirSync(SESSION_DIR, { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
}

function _clearSession(): void {
  try { writeFileSync(SESSION_FILE, '{}'); } catch { /* ignore */ }
}

let _session: Session | null = null;
let _activeConnectionId: string | null = null;

function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_session?.token) h['Authorization'] = `Bearer ${_session.token}`;
  if (_activeConnectionId) h['X-Connection-Id'] = _activeConnectionId;
  return h;
}

const INTROSPECT_SQL = `
  SELECT
    c.relname AS name,
    c.reltuples::bigint AS row_estimate,
    pg_total_relation_size(c.oid) AS size_bytes,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS size_human
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY c.relname
`.trim();

type BootPhase = 'connection' | 'splash' | 'table-select' | 'main';

async function main() {
  // Register all DB adapters for direct connection testing (no API required)
  initDbAdapters();

  // Quick session check from disk — no network call at startup
  const savedSession = loadSession();
  if (savedSession?.token) {
    _session = savedSession;
  }

  const CLI_ACTOR = _session?.username ?? 'local';
  const CLI_ROLE  = _session?.role ?? 'DBA';

  const appState = new AppState();
  const viewportState = new ViewportState();
  const eventBus = new EventBus();
  const layout = new Layout();

  const canvas = new TerminalCanvas(process.stdout as unknown as { write: (d: string) => void; columns?: number; rows?: number });
  canvas.enterAltScreen();

  function cleanup(): void {
    renderLoop?.stop();
    canvas.leaveAltScreen();
  }

  // ── Scenes ───────────────────────────────────────────
  const scenes: Record<string, IScene> = {};
  const exploreScene = new ExploreScene(viewportState);
  exploreScene.setOnTableChange((table) => {
    loadTableSchema(table)
      .catch(() => {})
      .finally(() => { loadTableData(table).catch(() => {}); });
  });
  exploreScene.setMarkDirty(() => renderLoop.markDirty());
  exploreScene.setEditCallbacks({
    onUpdateCell: async (table, id, field, value) => {
      const res = await fetch(`${API_URL}/api/v1/state/${table}/update`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ id, field, value }),
      });
      const body = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) return { success: false, error: body.error ?? `HTTP ${res.status}` };
      return { success: true };
    },
    onDeleteRow: async (table, id) => {
      // Uses DELETE /api/v1/state/:table/:id — parameterized on server, no SQL injection risk
      const res = await fetch(`${API_URL}/api/v1/state/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
      const body = await res.json().catch(() => ({})) as { deleted?: boolean; error?: string };
      if (!res.ok) return { success: false, error: body.error ?? `HTTP ${res.status}` };
      return { success: true };
    },
    onInsertRow: async (table, data) => {
      // Uses POST /api/v1/state/:table — field whitelist enforced on server
      const res = await fetch(`${API_URL}/api/v1/state/${encodeURIComponent(table)}`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({})) as { inserted?: boolean; error?: string };
      if (!res.ok) return { success: false, error: body.error ?? `HTTP ${res.status}` };
      return { success: true };
    },
  });
  scenes.explore = exploreScene;
  scenes.monitor = new MonitorScene(appState);
  scenes.audit = new AuditScene();
  scenes.recovery = new RecoveryScene();
  scenes.indexlab = new IndexLabScene();

  const aiChatScene = new AiChatScene();
  scenes.aichat = aiChatScene;

  (scenes.recovery as RecoveryScene).setOnReprocess(async (id: string) => {
    const res = await fetch(`${API_URL}/api/v1/changes/${id}/revert`, {
      method: 'POST',
      headers: apiHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    await loadRecoveryItems();
  });

  // ── Boot scenes ──────────────────────────────────────
  const connectionScene = new ConnectionScene();
  const splashScene = new SplashScene();
  const tableSelectScene = new TableSelectScene();

  // Load saved connections into connection scene
  let savedConns = loadConnections();

  // If no saved connections, auto-fill from DATABASE_URL env var
  if (savedConns.length === 0) {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const defaults = parseDbUrl(dbUrl);
      if (defaults?.type) {
        const autoConn: DbConnection = {
          id:       `auto-${Date.now()}`,
          label:    'local (from .env)',
          isDefault: true,
          type:     defaults.type,
          host:     defaults.host,
          port:     defaults.port,
          database: defaults.database,
          username: defaults.username,
          password: defaults.password,
        };
        upsertConnection(autoConn);
        savedConns = [autoConn];
      }
    }
  }

  connectionScene.setConnections(savedConns);

  // ── Command line ────────────────────────────────────
  const commandLine = new CommandLine();
  commandLine.configure({ actor: CLI_ACTOR, role: CLI_ROLE, environment: CLI_ENV });

  // ── Render loop ─────────────────────────────────────
  const sceneNames = ['explore', 'monitor', 'audit', 'recovery', 'indexlab', 'aichat'];
  let sceneIndex = 0;

  // Always start with ConnectionScene (DB connection picker)
  const renderLoop = new RenderLoop(canvas, connectionScene);
  const statusBar = new StatusBar();
  const sceneTabBar = new SceneTabBar();

  // ── Boot phase state ─────────────────────────────────
  let phase: BootPhase = 'connection';
  let selectedTables: string[] = [];
  let _connectedTables: string[] = [];   // tables obtained from adapter.listTables() at connect time

  // Only show chrome (status bar, scene tab bar) during main phase
  renderLoop.setPostRender((c) => {
    if (phase !== 'main') return;

    const { rows, cols } = c.getSize();

    sceneTabBar.setActive(appState.currentScene);
    sceneTabBar.render(c, 0);

    if (commandLine.isActive()) {
      commandLine.render(c);
    } else {
      statusBar.render(
        c,
        { x: 0, y: rows - 1, width: cols, height: 1 },
        {
          scene: appState.currentScene,
          streamMode: appState.streamMode,
          wsConnected: appState.wsConnected,
          overloadWarning: appState.overloadWarning,
          role: CLI_ROLE,
          environment: CLI_ENV,
        },
      );
      commandLine.render(c);
    }
  });

  // ── Optimistic patch manager ────────────────────────
  const patchManager = new OptimisticPatchManager(
    renderLoop,
    {
      reloadViewport: (table) => { loadTableData(table).catch(() => {}); },
      refetchRows: (_table, _pks) => {},
    },
  );

  // ── Data loading ────────────────────────────────────
  async function loadTableData(table: string): Promise<void> {
    viewportState.setLoading(table, true);
    renderLoop.markDirty();
    try {
      const res = await fetch(`${API_URL}/api/v1/state/${table}?limit=100`, { headers: apiHeaders() });
      if (res.ok) {
        const data = await res.json() as { items: Record<string, unknown>[]; total: number };
        viewportState.set(table, {
          table,
          offset: 0,
          limit: 100,
          totalRows: data.total ?? data.items.length,
          rows: data.items,
          isLoading: false,
        });
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
        viewportState.setError(table, body.error ?? body.message ?? `API error ${res.status} — ${table}`);
      }
    } catch {
      viewportState.setError(table, 'API offline — check server connection');
    }
    renderLoop.markDirty();
  }

  async function loadTableSchema(table: string): Promise<void> {
    if (schemaLoaded.has(table)) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/state/${table}/schema`, { headers: apiHeaders() });
      if (!res.ok) return;
      const data = await res.json() as {
        table: string;
        writableFields: string[];
        fieldMeta?: Record<string, { enum?: string[]; min?: number; max?: number; maxLen?: number; pattern?: string; uppercase?: boolean; hint?: string }>;
      };
      if (data.fieldMeta) {
        exploreScene.setServerFieldSchema(table, data.fieldMeta);
      }
      schemaLoaded.add(table);
    } catch {
      // best effort only
    }
  }

  async function loadRecoveryItems(): Promise<void> {
    try {
      const res = await fetch(`${API_URL}/api/v1/changes?status=FAILED&limit=50`);
      if (res.ok) {
        const data = await res.json() as { items: Record<string, unknown>[] };
        (scenes.recovery as RecoveryScene).setItems(data.items ?? []);
        renderLoop.markDirty();
      }
    } catch { /* non-fatal */ }
  }

  async function loadIndexData(): Promise<void> {
    try {
      const res = await fetch(`${API_URL}/api/v1/schema/indexes`);
      if (res.ok) {
        const data = await res.json() as {
          indexes: { name: string; table: string; columns: string; isUnique: boolean; sizeHuman: string }[];
          usage: { name: string; scans: number }[];
        };
        const usageMap = new Map(data.usage.map(u => [u.name, u.scans]));
        const merged: IndexInfo[] = data.indexes.map(idx => ({
          name: idx.name,
          table: idx.table,
          columns: idx.columns,
          isUnique: idx.isUnique,
          sizeHuman: idx.sizeHuman,
          scans: usageMap.get(idx.name) ?? 0,
        }));
        (scenes.indexlab as IndexLabScene).setIndexes(merged);
        renderLoop.markDirty();
      }
    } catch { /* non-fatal */ }
  }

  async function loadTableStats(): Promise<void> {
    try {
      const res = await fetch(`${API_URL}/api/v1/sql/execute`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          sql: `
            SELECT
              relname                                                        AS "table",
              COALESCE(seq_scan, 0)                                          AS seq_scans,
              COALESCE(idx_scan, 0)                                          AS idx_scans,
              COALESCE(n_live_tup, 0)                                        AS live_rows,
              COALESCE(n_dead_tup, 0)                                        AS dead_rows,
              CASE
                WHEN COALESCE(seq_scan,0) + COALESCE(idx_scan,0) > 0
                THEN ROUND(100.0 * COALESCE(idx_scan,0)
                         / (COALESCE(seq_scan,0) + COALESCE(idx_scan,0)), 1)
                ELSE 0
              END                                                            AS idx_ratio_pct
            FROM pg_stat_user_tables
            ORDER BY COALESCE(seq_scan,0) + COALESCE(idx_scan,0) DESC
            LIMIT 40
          `,
          readonly: true,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { rows: Record<string, unknown>[] };
        const stats: TableStatRow[] = (data.rows ?? []).map(r => ({
          table:        String(r['table'] ?? ''),
          seqScans:     Number(r['seq_scans'] ?? 0),
          idxScans:     Number(r['idx_scans'] ?? 0),
          idxRatioPct:  Number(r['idx_ratio_pct'] ?? 0),
          liveRows:     Number(r['live_rows'] ?? 0),
          deadRows:     Number(r['dead_rows'] ?? 0),
        }));
        (scenes.indexlab as IndexLabScene).setTableStats(stats);
        renderLoop.markDirty();
      }
    } catch { /* non-fatal */ }
  }

  async function loadInitialData(): Promise<void> {
    if (selectedTables.length === 0) return;
    await Promise.allSettled(selectedTables.map(loadTableData));

    try {
      const res = await fetch(`${API_URL}/api/v1/audit?limit=50`, { headers: apiHeaders() });
      if (res.ok) {
        const data = await res.json() as { items: Record<string, unknown>[] };
        (scenes.audit as AuditScene).setLogs(data.items ?? []);
      }
    } catch { /* non-fatal */ }

    await loadRecoveryItems();

    try {
      const res = await fetch(`${API_URL}/api/v1/monitoring/stream-stats`);
      if (res.ok) {
        const data = await res.json() as { items: StreamHealthStat[] };
        (scenes.indexlab as IndexLabScene).setStats(data.items ?? []);
      }
    } catch { /* non-fatal */ }

    await loadIndexData();
    await loadTableStats();

    renderLoop.markDirty();
  }

  // ── SQL submit ──────────────────────────────────────
  async function submitSql(sql: string): Promise<void> {
    commandLine.showFeedback('Submitting...', 'info');
    renderLoop.markDirty();
    try {
      const res = await fetch(`${API_URL}/api/v1/changes`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          sql,
          actor: CLI_ACTOR,
          role: CLI_ROLE,
          environment: CLI_ENV,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { id?: string; status?: string; riskLevel?: string; executionMode?: string };
        const risk = data.riskLevel ?? '?';
        const mode = data.executionMode ?? '?';
        commandLine.showFeedback(
          `OK id=${data.id?.slice(0, 8) ?? '?'} risk=${risk} mode=${mode}`,
          'ok',
          5000,
        );
        setTimeout(() => { loadInitialData().catch(() => {}); }, 500);
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
        commandLine.showFeedback(
          `ERR: ${body.error ?? body.message ?? `HTTP ${res.status}`}`,
          'err',
          6000,
        );
      }
    } catch (err) {
      commandLine.showFeedback(`ERR: Network ${String(err).slice(0, 50)}`, 'err', 6000);
    }
    renderLoop.markDirty();
  }

  // ── AI via beanllm sidecar (SSE streaming) ──────────
  async function aiStreamChat(
    messages: { role: string; content: string }[],
    opts?: { model?: string; mode?: 'stream' | 'agentic' },
  ): Promise<void> {
    const endpoint = opts?.mode === 'agentic' ? '/api/v1/ai/agentic' : '/api/v1/ai/stream';
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        messages,
        model: opts?.model,
        includeSchema: true,
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6)) as {
            type: string;
            content?: string;
            sql?: string | null;
            model?: string;
            intent?: string;
            error?: string;
            confidence?: number;
          };

          if (evt.type === 'chunk' && evt.content) {
            aiChatScene.appendStreamChunk(evt.content);
          } else if (evt.type === 'intent' && evt.intent) {
            aiChatScene.setStreamIntent(evt.intent);
          } else if (evt.type === 'done') {
            aiChatScene.finalizeStream(
              evt.content ?? '',
              evt.sql ?? null,
              evt.model ?? '',
              evt.intent,
            );
          } else if (evt.type === 'error') {
            aiChatScene.setStreamError(evt.error ?? 'Unknown error');
          }
        } catch { /* malformed SSE */ }
      }
    }
  }

  async function fetchAiModels(): Promise<{ models: { name: string; provider: string; active: boolean }[]; default: string; providers: string[] }> {
    const res = await fetch(`${API_URL}/api/v1/ai/models`, { headers: apiHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as { models: { name: string; provider: string; active: boolean }[]; default: string; providers: string[] };
  }

  async function handleAiQuery(prompt: string): Promise<void> {
    commandLine.showFeedback('AI thinking...', 'info');
    renderLoop.markDirty();

    const currentSceneName = appState.currentScene;
    const scene = scenes[currentSceneName];
    let contextPrefix = '';
    if (scene?.getContext) {
      const ctx = scene.getContext();
      contextPrefix = `[Current view: ${ctx.summary}]\n`;
      if (ctx.details) {
        contextPrefix += `[Data: ${JSON.stringify(ctx.details).slice(0, 500)}]\n`;
      }
    }

    try {
      const res = await fetch(`${API_URL}/api/v1/ai/chat`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          messages: [{ role: 'user', content: contextPrefix + prompt }],
          includeSchema: true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json() as { content: string; sql?: string | null };
      if (result.sql) {
        commandLine.showAiSqlResult(result.sql);
      } else {
        const preview = result.content.slice(0, 80);
        commandLine.showFeedback(`AI: ${preview}`, 'info', 8000);
      }
    } catch {
      commandLine.showFeedback('AI not available - use : for direct SQL', 'err', 5000);
    }
    renderLoop.markDirty();
  }

  // ── Direct SQL execution (returns results) ─────────
  async function executeSqlDirect(sql: string): Promise<{
    type: 'query' | 'dml' | 'ddl' | 'other';
    rows?: Record<string, unknown>[];
    rowCount?: number;
    columns?: string[];
    message?: string;
    error?: string;
  }> {
    const res = await fetch(`${API_URL}/api/v1/sql/execute`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ sql }),
    });
    const body = await res.json() as {
      type: 'query' | 'dml' | 'ddl' | 'other';
      rows?: Record<string, unknown>[];
      rowCount?: number;
      columns?: string[];
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      return { type: 'other', error: body.error ?? `HTTP ${res.status}` };
    }
    return body;
  }

  // ── AI Chat Scene callbacks ─────────────────────────
  aiChatScene.setMarkDirty(() => renderLoop.markDirty());
  aiChatScene.setCallbacks({
    onSendStream: aiStreamChat,
    onExecuteSql: async (sql) => {
      renderLoop.markDirty();
      const result = await executeSqlDirect(sql);
      // Refresh data tables after DML/DDL
      if (result.type === 'dml' || result.type === 'ddl') {
        setTimeout(() => { loadInitialData().catch(() => {}); }, 500);
      }
      renderLoop.markDirty();
      return result;
    },
    onFetchModels: fetchAiModels,
  });

  // Load AI model info on startup with retry
  async function tryConnectAi(): Promise<void> {
    try {
      const data = await fetchAiModels();
      aiChatScene.setModelInfo(data.default, data.providers, data.models);
      aiChatScene.setConnectionStatus('connected');
    } catch {
      aiChatScene.setConnectionStatus('disconnected');
    }
    renderLoop.markDirty();
  }

  void tryConnectAi();

  // Retry AI connection every 30s if disconnected
  setInterval(() => {
    if (aiChatScene.getConnectionStatus() === 'disconnected') {
      aiChatScene.setConnectionStatus('checking');
      renderLoop.markDirty();
      tryConnectAi().catch(() => {});
    }
  }, 30_000);

  // ── WebSocket ───────────────────────────────────────
  const wsClient = new TuiWsClient(new NodeWsTransport(), {
    onChangeApplied: (e) => {
      patchManager.confirm(e.event.changeId, {
        changeId: e.event.changeId,
        tableName: e.event.tableName,
        affectedCount: e.event.affectedCount,
        pkList: e.event.pkList,
        pkListTruncated: e.event.pkListTruncated,
      });
      renderLoop.markDirty();
    },
    onStreamEvent: (e) => {
      appState.updateStreamStats(e.entityType, e.count);
      renderLoop.markDirty();
    },
    onOverloadWarning: (reason) => {
      appState.setOverloadWarning(reason);
      renderLoop.markDirty();
    },
    onConnected: () => {
      appState.setWsConnected(true);
      loadInitialData().catch(() => {});
      renderLoop.markDirty();
    },
    onDisconnected: () => {
      appState.setWsConnected(false);
      renderLoop.markDirty();
    },
  });

  // ── Boot state machine ──────────────────────────────

  // ConnectionScene → SplashScene on successful DB connection
  connectionScene.setMarkDirty(() => renderLoop.markDirty());

  connectionScene.onSave = (conn: DbConnection) => {
    upsertConnection(conn);
    // Refresh the scene's list from disk
    connectionScene.setConnections(loadConnections());
  };

  connectionScene.onDelete = (id: string) => {
    removeConnection(id);
    connectionScene.setConnections(loadConnections());
  };

  connectionScene.onConnect = async (conn: DbConnection): Promise<{ error: string | null; tables: string[] }> => {
    // Test directly with the adapter — no API server required at this stage
    let adapter;
    try {
      adapter = createAdapter({
        type:     conn.type,
        host:     conn.host,
        port:     conn.port,
        database: conn.database,
        username: conn.username,
        password: conn.password,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Unknown DB type: ${conn.type}`;
      return { error: msg, tables: [] };
    }

    try {
      const tables = await adapter.listTables();   // throws on connection failure
      _connectedTables = tables;
      _activeConnectionId = conn.id;
      phase = 'splash';
      renderLoop.setScene(splashScene);
      renderLoop.markDirty();
      return { error: null, tables };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      return { error: msg, tables: [] };
    } finally {
      await adapter.close().catch(() => {});
    }
  };

  // Phase 1 → 2: SplashScene → TableSelectScene
  splashScene.onProceed = () => {
    phase = 'table-select';
    renderLoop.setScene(tableSelectScene);
    renderLoop.markDirty();

    // Use tables already obtained via adapter.listTables() during ConnectionScene.onConnect
    if (_connectedTables.length > 0) {
      tableSelectScene.setTables(
        _connectedTables.map(name => ({ name, rowEstimate: 0, sizeBytes: 0, sizeHuman: '?' })),
      );
      renderLoop.markDirty();
      return;
    }

    // Fallback: try API (works when API server is running for PostgreSQL)
    executeSqlDirect(INTROSPECT_SQL).then(result => {
      const rows = result.rows ?? [];
      const tables: TableMeta[] = rows.map(r => ({
        name: String(r['name'] ?? ''),
        rowEstimate: Number(r['row_estimate'] ?? 0),
        sizeBytes: Number(r['size_bytes'] ?? 0),
        sizeHuman: String(r['size_human'] ?? '?'),
      })).filter(t => t.name.length > 0);

      tableSelectScene.setTables(tables.length > 0 ? tables : DEFAULT_TABLES);
      renderLoop.markDirty();
    }).catch(() => {
      tableSelectScene.setTables(DEFAULT_TABLES);
      renderLoop.markDirty();
    });
  };

  // Phase 2 → 3: TableSelectScene → Main app
  tableSelectScene.setOnConfirm((tables) => {
    selectedTables = tables;
    phase = 'main';

    exploreScene.setDynamicTables(tables);
    Promise.allSettled(tables.map(loadTableSchema)).catch(() => {});
    sceneIndex = 0;
    appState.setScene('explore');
    renderLoop.setScene(scenes.explore);

    // Connect WebSocket for selected tables
    wsClient.connect(WS_URL, tables);

    renderLoop.markDirty();
  });

  // ── Input handling ──────────────────────────────────
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', (key: string) => {
      if (key === '\u0003') {
        cleanup();
        process.exit(0);
      }

      // During boot phases, route keys only to the current boot scene
      if (phase !== 'main') {
        const bootScene = phase === 'connection' ? connectionScene
          : phase === 'splash' ? splashScene
          : tableSelectScene;
        if (key === '\u001b[A') bootScene.onKeyPress('up');
        else if (key === '\u001b[B') bootScene.onKeyPress('down');
        else if (key === '\u001b[C') bootScene.onKeyPress('right');
        else if (key === '\u001b[D') bootScene.onKeyPress('left');
        else bootScene.onKeyPress(key);
        renderLoop.markDirty();
        return;
      }

      if (commandLine.isActive() || commandLine.isResultVisible()) {
        const result = commandLine.handleKey(key);
        if (result?.type === 'execute') {
          executeSqlDirect(result.sql).then(execResult => {
            commandLine.showQueryResult(execResult);
            if (execResult.type === 'dml' || execResult.type === 'ddl') {
              setTimeout(() => { loadInitialData().catch(() => {}); }, 500);
            }
            renderLoop.markDirty();
          }).catch(err => {
            commandLine.showFeedback(
              `✕ ${err instanceof Error ? err.message : String(err)}`,
              'err',
              6000,
            );
            renderLoop.markDirty();
          });
        } else if (result?.type === 'ai-query') {
          handleAiQuery(result.prompt).catch(() => {});
        } else if (result?.type === 'quit') {
          cleanup();
          process.exit(0);
        }
        renderLoop.markDirty();
        return;
      }

      if (key === ':') {
        const pending = commandLine.getPendingSql();
        if (pending) {
          commandLine.activateWithPrefill(pending);
          commandLine.clearPendingSql();
        } else {
          commandLine.activate('sql');
        }
        renderLoop.markDirty();
        return;
      }

      if (key === '?') {
        const currentSceneName = appState.currentScene;
        if (currentSceneName === 'aichat') {
          // Already in AI chat, just focus the input
          scenes.aichat.onKeyPress(' ');
        } else {
          const scene = scenes[currentSceneName];
          if (scene?.getContext) {
            const ctx = scene.getContext();
            const ctxStr = `[Context: ${ctx.summary}]\n${ctx.details ? JSON.stringify(ctx.details, null, 2) : ''}`;
            aiChatScene.setSceneContext(ctxStr);
          }
          commandLine.activate('ai');
        }
        renderLoop.markDirty();
        return;
      }

      if (key === '\t') {
        sceneIndex = (sceneIndex + 1) % sceneNames.length;
        const name = sceneNames[sceneIndex];
        appState.setScene(name);
        renderLoop.setScene(scenes[name]);
        renderLoop.markDirty();
        return;
      }

      if (key >= '1' && key <= '6') {
        const idx = Number(key) - 1;
        if (idx < sceneNames.length) {
          sceneIndex = idx;
          const name = sceneNames[sceneIndex];
          appState.setScene(name);
          renderLoop.setScene(scenes[name]);
          renderLoop.markDirty();
        }
        return;
      }

      if (key === ' ') {
        appState.toggleStreamMode();
        wsClient.togglePause();
        renderLoop.markDirty();
        return;
      }

      const scene = scenes[appState.currentScene];
      if (key === '\u001b[A') scene.onKeyPress('up');
      else if (key === '\u001b[B') scene.onKeyPress('down');
      else if (key === '\u001b[C') scene.onKeyPress('right');
      else if (key === '\u001b[D') scene.onKeyPress('left');
      else if (key === '\u001b[5~') scene.onKeyPress('pageup');
      else if (key === '\u001b[6~') scene.onKeyPress('pagedown');
      else scene.onKeyPress(key);

      renderLoop.markDirty();
    });
  }

  process.stdout.on('resize', () => {
    const { columns = 80, rows = 24 } = process.stdout;
    (canvas as TerminalCanvas).updateSize(columns, rows);
    renderLoop.markDirty();
  });

  // Start with SplashScene
  renderLoop.enableAnimation(250);
  renderLoop.markDirty();
  renderLoop.start();

  void eventBus;
  void layout;
  void submitSql;
}

main().catch((err) => {
  console.error('[tui] Fatal error:', err);
  process.exit(1);
});
