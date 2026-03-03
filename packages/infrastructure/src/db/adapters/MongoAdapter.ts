import type { IDbAdapter } from './IDbAdapter.js';

export interface MongoAdapterConfig {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

export class MongoAdapter implements IDbAdapter {
  private client: unknown = null;
  private readonly config: MongoAdapterConfig;

  constructor(config: MongoAdapterConfig) {
    this.config = config;
  }

  private buildUri(): string {
    const { host = 'localhost', port = 27017, username, password } = this.config;
    const auth = username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : '';
    return `mongodb://${auth}${host}:${port}`;
  }

  private async getClient(): Promise<unknown> {
    if (!this.client) {
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(this.buildUri(), { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      this.client = client;
    }
    return this.client;
  }

  async listTables(): Promise<string[]> {
    const client = await this.getClient() as {
      db: (name?: string) => { listCollections: () => { toArray: () => Promise<Array<{ name: string }>> } };
    };
    const db = client.db(this.config.database);
    const cols = await db.listCollections().toArray();
    return cols.map(c => c.name);
  }

  async queryRows(sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> {
    // MongoDB doesn't use SQL — parse a minimal "SELECT * FROM <collection>" pattern
    // Special case: SHOW DATABASES → list all databases via admin interface
    if (/SHOW\s+DATABASES/i.test(sql)) {
      const client = await this.getClient() as {
        db: (name?: string) => {
          admin: () => {
            listDatabases: () => Promise<{ databases: Array<{ name: string; sizeOnDisk?: number }> }>;
          };
        };
      };
      const result = await client.db().admin().listDatabases();
      return result.databases.map(db => ({ name: db.name, sizeOnDisk: db.sizeOnDisk ?? 0 }));
    }

    const match = /FROM\s+(\w+)/i.exec(sql);
    if (!match) return [];
    const client = await this.getClient() as {
      db: (name?: string) => { collection: (name: string) => { find: () => { limit: (n: number) => { toArray: () => Promise<Record<string, unknown>[]> } } } };
    };
    const db = client.db(this.config.database);
    return db.collection(match[1]!).find().limit(100).toArray();
  }

  async close(): Promise<void> {
    if (this.client) {
      await (this.client as { close: () => Promise<void> }).close();
      this.client = null;
    }
  }
}
