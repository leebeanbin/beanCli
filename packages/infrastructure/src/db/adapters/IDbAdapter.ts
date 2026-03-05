export interface IDbAdapter {
  listTables(): Promise<string[]>;
  listDatabases?(): Promise<string[]>;
  queryRows(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}
