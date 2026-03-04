import type { IDbAdapter } from './IDbAdapter.js';

export interface ElasticsearchAdapterConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

export class ElasticsearchAdapter implements IDbAdapter {
  private client: unknown = null;
  private readonly config: ElasticsearchAdapterConfig;

  constructor(config: ElasticsearchAdapterConfig) {
    this.config = config;
  }

  private async getClient(): Promise<unknown> {
    if (!this.client) {
      const { Client } = await import('@elastic/elasticsearch');
      const node = `http://${this.config.host ?? 'localhost'}:${this.config.port ?? 9200}`;
      const auth =
        this.config.username && this.config.password
          ? { username: this.config.username, password: this.config.password }
          : undefined;
      this.client = new Client({ node, auth, requestTimeout: 10000 });
    }
    return this.client;
  }

  async listTables(): Promise<string[]> {
    const client = await this.getClient();
    const es = client as {
      cat: {
        indices: (opts: { format: string }) => Promise<
          { name?: string }[]
        >;
      };
    };
    const indices = await es.cat.indices({ format: 'json' });
    return (indices as { name?: string }[])
      .map((i) => i.name ?? '')
      .filter(Boolean)
      .sort();
  }

  async queryRows(sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> {
    const client = await this.getClient();
    const es = client as {
      search: (opts: unknown) => Promise<{
        hits: { hits: { _id: string; _index: string; _source?: Record<string, unknown> }[] };
      }>;
    };

    // If SQL starts with '{', treat as native ES query JSON
    const trimmed = sql.trim();
    if (trimmed.startsWith('{')) {
      try {
        const body = JSON.parse(trimmed) as Record<string, unknown>;
        const index = (body['index'] as string | undefined) ?? '_all';
        delete body['index'];
        const result = await es.search({ index, body });
        return result.hits.hits.map((h) => ({
          _id: h._id,
          _index: h._index,
          ...(h._source ?? {}),
        }));
      } catch (err) {
        throw new Error(`ES query error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const fromMatch = /FROM\s+(\S+)/i.exec(sql);
    const index = fromMatch ? fromMatch[1]! : '_all';
    const limitMatch = /LIMIT\s+(\d+)/i.exec(sql);
    const size = limitMatch ? Math.min(Number(limitMatch[1]), 1000) : 100;

    const result = await es.search({ index, body: { query: { match_all: {} }, size } });
    return result.hits.hits.map((h) => ({
      _id: h._id,
      _index: h._index,
      ...(h._source ?? {}),
    }));
  }

  async close(): Promise<void> {
    if (this.client) {
      await (this.client as { close: () => Promise<void> }).close().catch(() => {});
      this.client = null;
    }
  }
}
