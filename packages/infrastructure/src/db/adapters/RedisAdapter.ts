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

  /** Returns key/value pairs matching the FROM clause prefix.
   *  Uses two ioredis pipelines to avoid N+1 RTT:
   *  pipeline-1 → TYPE all keys in one round-trip
   *  pipeline-2 → fetch values in one round-trip based on types
   */
  async queryRows(sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> {
    const match = /FROM\s+(\S+)/i.exec(sql);
    const prefix = match ? match[1] : '';
    const client = await this.getRedis() as {
      keys:     (p: string) => Promise<string[]>;
      pipeline: () => {
        type:     (k: string) => unknown;
        get:      (k: string) => unknown;
        hgetall:  (k: string) => unknown;
        lrange:   (k: string, s: number, e: number) => unknown;
        smembers: (k: string) => unknown;
        zrange:   (k: string, s: number, e: number) => unknown;
        exec:     () => Promise<[Error | null, unknown][]>;
      };
    };
    const pattern = prefix ? `${prefix}:*` : '*';
    const keys = (await client.keys(pattern)).sort().slice(0, 100);
    if (keys.length === 0) return [];

    // Pipeline 1: fetch all types in one round-trip
    const p1 = client.pipeline();
    keys.forEach(k => p1.type(k));
    const typeResults = await p1.exec();
    const types = typeResults.map(r => (r[1] as string) ?? 'string');

    // Pipeline 2: fetch all values in one round-trip based on types
    const p2 = client.pipeline();
    keys.forEach((k, i) => {
      switch (types[i]) {
        case 'hash':  p2.hgetall(k);           break;
        case 'list':  p2.lrange(k, 0, -1);     break;
        case 'set':   p2.smembers(k);           break;
        case 'zset':  p2.zrange(k, 0, -1);     break;
        default:      p2.get(k);               break;
      }
    });
    const valResults = await p2.exec();

    return keys.map((key, i) => {
      const keyType = types[i] ?? 'string';
      const val     = valResults[i]?.[1];
      switch (keyType) {
        case 'hash':
          // Spread hash fields as flat table columns for a proper row-like view
          return { key, ...((val as Record<string, string> | null) ?? {}) };
        case 'list': {
          const items = (val as string[]) ?? [];
          return { key, type: 'list', value: items.join(' | '), length: items.length };
        }
        case 'set': {
          const members = (val as string[]) ?? [];
          return { key, type: 'set', value: members.join(' | '), length: members.length };
        }
        case 'zset': {
          const members = (val as string[]) ?? [];
          return { key, type: 'zset', value: members.join(' | '), length: members.length };
        }
        default:
          return { key, type: keyType, value: (val as string | null) ?? '' };
      }
    });
  }

  async close(): Promise<void> {
    if (this.redis) {
      (this.redis as { disconnect: () => void }).disconnect();
      this.redis = null;
    }
  }
}
