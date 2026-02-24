import { Pool, type PoolConfig, type PoolClient } from 'pg';
import type { DbTransaction } from '@tfsdc/domain';
import type { IProjectorDb, IMetricsProvider } from '@tfsdc/application';
import type { IDbSession } from '@tfsdc/application';

export class PgPool implements IProjectorDb, IMetricsProvider {
  private readonly pool: Pool;
  private readonly latencyWindow: number[] = [];
  private readonly WINDOW_SIZE = 100;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  async query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> {
    const start = Date.now();
    const result = await this.pool.query(sql, params);
    this.recordLatency(Date.now() - start);
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
    return {
      p95LatencyMs: this.computeP95(),
      poolUsagePct: this.computePoolUsagePct(),
    };
  }

  // IMetricsProvider implementation
  async getDbP95LatencyMs(): Promise<number> {
    return this.computeP95();
  }

  async getConnectionPoolUsagePct(): Promise<number> {
    return this.computePoolUsagePct();
  }

  private computePoolUsagePct(): number {
    const total = this.pool.totalCount;
    const idle = this.pool.idleCount;
    return total > 0 ? Math.round(((total - idle) / total) * 100) : 0;
  }

  async healthCheck(): Promise<{ status: string; p95LatencyMs: number }> {
    try {
      const start = Date.now();
      await this.pool.query('SELECT 1');
      const latency = Date.now() - start;
      this.recordLatency(latency);
      return { status: 'ok', p95LatencyMs: latency };
    } catch {
      return { status: 'error', p95LatencyMs: 999 };
    }
  }

  async end(): Promise<void> {
    await this.pool.end();
  }

  private recordLatency(ms: number): void {
    if (this.latencyWindow.length >= this.WINDOW_SIZE) {
      this.latencyWindow.shift();
    }
    this.latencyWindow.push(ms);
  }

  private computeP95(): number {
    if (this.latencyWindow.length === 0) return 0;
    const sorted = [...this.latencyWindow].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.95);
    return sorted[idx] ?? sorted[sorted.length - 1];
  }
}
