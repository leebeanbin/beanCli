// ── Auth types ────────────────────────────────────────────────────────────────

export type UserRole = 'DBA' | 'MANAGER' | 'ANALYST' | 'SECURITY_ADMIN';

export interface LoginResult {
  ok:        boolean;
  token?:    string;
  username?: string;
  role?:     UserRole;
  error?:    string;
}

// ── DB connection types ──────────────────────────────────────────────────────

export type DbType = 'postgresql' | 'mysql' | 'sqlite' | 'mongodb' | 'redis';

export interface DbConnection {
  id:         string;
  label:      string;
  type:       DbType;
  host?:      string;
  port?:      number;
  database?:  string;
  username?:  string;
  password?:  string;
  isDefault?: boolean;
}

export interface ColumnInfo {
  name:      string;
  type:      string;
  nullable?: boolean;
}

export interface ConnectResult {
  error:  string | null;
  tables: string[];
}

// ── Query types ──────────────────────────────────────────────────────────────

export type QueryType = 'select' | 'dml' | 'ddl' | 'other';

export interface QueryResult {
  columns:   string[];
  rows:      Record<string, unknown>[];
  rowCount:  number;
  duration:  number;            // ms
  type:      QueryType;
  message?:  string;            // for DML/DDL feedback
  error?:    string;
  warning?:  string;            // non-fatal notice (e.g. truncation)
}

// ── AI types ─────────────────────────────────────────────────────────────────

export interface AiMessage {
  role:    'user' | 'assistant' | 'system';
  content: string;
}

export interface AiStreamCallbacks {
  onChunk:  (text: string) => void;
  onIntent: (intent: string) => void;
  onDone:   (content: string, sql: string | null, model: string) => void;
  onError:  (error: string) => void;
}

// ── Service interface (implemented in apps/cli, injected into TUI) ───────────

export interface IConnectionService {
  /** Load saved connections from local store (sync). */
  loadConnections(): DbConnection[];

  /** Persist a new or updated connection. */
  saveConnection(conn: DbConnection): void;

  /** Remove a connection by id. */
  deleteConnection(id: string): void;

  /**
   * Test connectivity AND establish a persistent adapter.
   * Returns the table list on success; adapter stays open for executeQuery().
   */
  testConnection(conn: DbConnection): Promise<ConnectResult>;

  /**
   * Execute SQL on the currently open adapter.
   * Returns an error QueryResult if not connected.
   */
  executeQuery(sql: string): Promise<QueryResult>;

  /**
   * Close the persistent adapter.
   */
  disconnect(): Promise<void>;

  /**
   * List all databases on the connected server.
   * Called after connecting without a specific database selected.
   */
  listDatabases?(): Promise<string[]>;

  /**
   * Create a new database on the connected server.
   */
  createDatabase?(name: string): Promise<{ error?: string }>;

  /**
   * Drop (delete) a database on the connected server.
   * This is permanent — callers should confirm with the user first.
   */
  dropDatabase?(name: string): Promise<{ error?: string }>;

  /**
   * Authenticate with the beanCLI API (optional — skipped in dev-only setups).
   * Returns a JWT token and user role on success.
   */
  login?: (username: string, password: string) => Promise<LoginResult>;

  /**
   * Stream an AI chat response via beanllm sidecar (optional — not all envs have AI).
   * Fires callbacks as SSE events arrive.
   */
  streamAi?: (
    messages:  AiMessage[],
    opts:      { model?: string },
    callbacks: AiStreamCallbacks,
  ) => Promise<void>;
}
