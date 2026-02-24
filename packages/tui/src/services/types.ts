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

// ── Service interface (implemented in apps/cli, injected into TUI) ───────────

export interface IConnectionService {
  /** Load saved connections from local store (sync). */
  loadConnections(): DbConnection[];

  /** Persist a new or updated connection. */
  saveConnection(conn: DbConnection): void;

  /** Remove a connection by id. */
  deleteConnection(id: string): void;

  /**
   * Open a real connection, run listTables(), then close.
   * Returns null error + tables on success, error string on failure.
   */
  testConnection(conn: DbConnection): Promise<ConnectResult>;
}
