import { Pool } from 'pg';
import type { IDbAdapter } from './IDbAdapter.js';

export interface PgAdapterConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

export class PgAdapter implements IDbAdapter {
  private readonly pool: Pool;

  constructor(config: PgAdapterConfig) {
    this.pool = new Pool({
      host: config.host ?? 'localhost',
      port: config.port ?? 5432,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 2,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 1000,
    });
  }

  async listTables(): Promise<string[]> {
    const res = await this.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    return res.rows.map(r => r.table_name);
  }

  async queryRows(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    const res = await this.pool.query(sql, params);
    return res.rows as Record<string, unknown>[];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
