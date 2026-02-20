import { Pool, type PoolConfig, type PoolClient } from 'pg';
import type { DbTransaction } from '@tfsdc/domain';
import type { IProjectorDb } from '@tfsdc/application';
import type { IDbSession } from '@tfsdc/application';

export class PgPool implements IProjectorDb {
  private readonly pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  async query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> {
    const result = await this.pool.query(sql, params);
    return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount };
  }

  async transaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx: DbTransaction = {
        query: async (sql: string, params?: unknown[]) => {
          const result = await client.query(sql, params);
          return { rowCount: result.rowCount };
        },
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  createSession(): IDbSession {
    return {
      query: async (sql: string, params?: unknown[]) => {
        const result = await this.pool.query(sql, params);
        return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount };
      },
    };
  }

  async getMetrics(): Promise<{ p95LatencyMs: number; poolUsagePct: number }> {
    const total = this.pool.totalCount;
    const idle = this.pool.idleCount;
    const waiting = this.pool.waitingCount;
    const usage = total > 0 ? Math.round(((total - idle) / total) * 100) : 0;
    return { p95LatencyMs: waiting > 0 ? 100 : 10, poolUsagePct: usage };
  }

  async healthCheck(): Promise<{ status: string; p95LatencyMs: number }> {
    try {
      const start = Date.now();
      await this.pool.query('SELECT 1');
      return { status: 'ok', p95LatencyMs: Date.now() - start };
    } catch {
      return { status: 'error', p95LatencyMs: 999 };
    }
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}
