import type { IDbAdapter } from './IDbAdapter.js';

export interface SqliteAdapterConfig {
  database?: string; // file path, or ':memory:'
}

/**
 * SQLite adapter using the built-in node:sqlite module (Node.js ≥22.5).
 * No external dependencies — zero npm packages required.
 */
export class SqliteAdapter implements IDbAdapter {
  private db: unknown = null;
  private readonly config: SqliteAdapterConfig;

  constructor(config: SqliteAdapterConfig) {
    this.config = config;
  }

  private async getDb(): Promise<{
    prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>> };
    close: () => void;
  }> {
    if (!this.db) {
      // node:sqlite is a built-in module in Node.js ≥22.5.0
      // @types/node includes its type declarations
      const { DatabaseSync } = await import('node:sqlite');
      this.db = new DatabaseSync(this.config.database ?? ':memory:');
    }
    return this.db as {
      prepare: (sql: string) => { all: (...args: unknown[]) => Array<Record<string, unknown>> };
      close: () => void;
    };
  }

  async listTables(): Promise<string[]> {
    const db = await this.getDb();
    const rows = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    ).all();
    return rows.map(r => String(r['name'] ?? ''));
  }

  async queryRows(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    const db = await this.getDb();
    return db.prepare(sql).all(...(params ?? []));
  }

  async close(): Promise<void> {
    if (this.db) {
      (this.db as { close: () => void }).close();
      this.db = null;
    }
  }
}
