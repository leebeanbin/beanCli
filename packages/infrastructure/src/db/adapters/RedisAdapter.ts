import type { IDbAdapter } from './IDbAdapter.js';

export interface RedisAdapterConfig {
  host?: string;
  port?: number;
  password?: string;
  database?: string; // db index as string, e.g. "0"
}

export class RedisAdapter implements IDbAdapter {
  private redis: unknown = null;
  private readonly config: RedisAdapterConfig;

  constructor(config: RedisAdapterConfig) {
    this.config = config;
  }

  private async getRedis(): Promise<unknown> {
    if (!this.redis) {
      const { Redis } = await import('ioredis');
      const client = new Redis({
        host: this.config.host ?? 'localhost',
        port: this.config.port ?? 6379,
        password: this.config.password,
        db: this.config.database ? Number(this.config.database) : 0,
        connectTimeout: 5000,
        lazyConnect: true,
      });
      await client.connect();
      this.redis = client;
    }
    return this.redis;
  }

  /** Returns key patterns as "virtual table names" */
  async listTables(): Promise<string[]> {
    const client = await this.getRedis() as { keys: (pattern: string) => Promise<string[]> };
    const keys = await client.keys('*');
    // Group by prefix (first token before ':') as pseudo-table
    const prefixes = new Set(keys.map(k => k.split(':')[0] ?? k));
    return [...prefixes].sort();
  }

  /** Returns key/value pairs matching the FROM clause prefix */
  async queryRows(sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> {
    const match = /FROM\s+(\S+)/i.exec(sql);
    const prefix = match ? match[1] : '';
    const client = await this.getRedis() as {
      keys:     (p: string) => Promise<string[]>;
      type:     (k: string) => Promise<string>;
      get:      (k: string) => Promise<string | null>;
      hgetall:  (k: string) => Promise<Record<string, string> | null>;
      lrange:   (k: string, start: number, stop: number) => Promise<string[]>;
      smembers: (k: string) => Promise<string[]>;
      zrange:   (k: string, start: number, stop: number) => Promise<string[]>;
    };
    const pattern = prefix ? `${prefix}:*` : '*';
    const keys = (await client.keys(pattern)).sort().slice(0, 100);
    const rows: Record<string, unknown>[] = [];
    for (const key of keys) {
      const keyType = await client.type(key);
      switch (keyType) {
        case 'hash': {
          const fields = await client.hgetall(key);
          // Spread hash fields as flat table columns for a proper row-like view
          rows.push({ key, ...(fields ?? {}) });
          break;
        }
        case 'list': {
          const items = await client.lrange(key, 0, -1);
          rows.push({ key, type: 'list', value: items.join(' | '), length: items.length });
          break;
        }
        case 'set': {
          const members = await client.smembers(key);
          rows.push({ key, type: 'set', value: members.join(' | '), length: members.length });
          break;
        }
        case 'zset': {
          const members = await client.zrange(key, 0, -1);
          rows.push({ key, type: 'zset', value: members.join(' | '), length: members.length });
          break;
        }
        default: {
          // string or unknown
          const val = await client.get(key);
          rows.push({ key, type: keyType, value: val ?? '' });
        }
      }
    }
    return rows;
  }

  async close(): Promise<void> {
    if (this.redis) {
      (this.redis as { disconnect: () => void }).disconnect();
      this.redis = null;
    }
  }
}
