import type { IDbAdapter } from './IDbAdapter.js';

const MAX_ROWS_SENTINEL = 5001;
function injectLimit(sql: string): string {
  if (/^\s*SELECT\b/i.test(sql) && !/\bLIMIT\s+\d+/i.test(sql)) {
    return `${sql} LIMIT ${MAX_ROWS_SENTINEL}`;
  }
  return sql;
}

export interface MySqlAdapterConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

export class MySqlAdapter implements IDbAdapter {
  // Lazily loaded to avoid hard dependency when mysql2 is not installed
  private connection: unknown = null;
  private readonly config: MySqlAdapterConfig;

  constructor(config: MySqlAdapterConfig) {
    this.config = config;
  }

  private async getConnection(): Promise<unknown> {
    if (!this.connection) {
      // Dynamic import — mysql2 is an optional peer dependency
      const mysql = await import('mysql2/promise');
      this.connection = await (
        mysql as { createConnection: (cfg: unknown) => Promise<unknown> }
      ).createConnection({
        host: this.config.host ?? 'localhost',
        port: this.config.port ?? 3306,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        connectTimeout: 5000,
      });
    }
    return this.connection;
  }

  async listDatabases(): Promise<string[]> {
    const conn = (await this.getConnection()) as {
      execute: (sql: string, values: unknown[]) => Promise<[Array<Record<string, unknown>>, unknown]>;
    };
    const [rows] = await conn.execute(
      `SELECT SCHEMA_NAME AS db FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME`,
      [],
    );
    return (rows as Array<{ db: string }>).map((r) => r.db);
  }

  async listTables(): Promise<string[]> {
    const conn = (await this.getConnection()) as {
      execute: (sql: string, values: unknown[]) => Promise<[Array<Record<string, unknown>>, unknown]>;
    };
    const db = this.config.database?.trim() ?? '';

    if (db) {
      // database 지정됨 — 해당 스키마의 테이블만
      const [rows] = await conn.execute(
        `SELECT TABLE_NAME AS table_name FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ?
           AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
         ORDER BY TABLE_NAME`,
        [db],
      );
      return (rows as Array<{ table_name: string }>).map((r) => r.table_name);
    }

    // database 미지정 — 접근 가능한 모든 DB의 테이블을 'db.table' 형식으로 반환
    const [rows] = await conn.execute(
      `SELECT CONCAT(TABLE_SCHEMA, '.', TABLE_NAME) AS table_name
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA NOT IN ('information_schema','performance_schema','mysql','sys')
         AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
       ORDER BY TABLE_SCHEMA, TABLE_NAME`,
      [],
    );
    return (rows as Array<{ table_name: string }>).map((r) => r.table_name);
  }

  async queryRows(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    const conn = (await this.getConnection()) as {
      execute: (opts: {
        sql: string;
        timeout: number;
        values: unknown[];
      }) => Promise<[Array<Record<string, unknown>>, unknown]>;
    };
    const [rows] = await conn.execute({
      sql: injectLimit(sql),
      timeout: 30_000,
      values: params ?? [],
    });
    return rows as Record<string, unknown>[];
  }

  async close(): Promise<void> {
    if (this.connection) {
      await (this.connection as { end: () => Promise<void> }).end();
      this.connection = null;
    }
  }
}
