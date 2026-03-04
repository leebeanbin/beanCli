import type { IDbAdapter } from './IDbAdapter.js';

export interface NatsAdapterConfig {
  host?: string;
  port?: number;
}

export class NatsAdapter implements IDbAdapter {
  private nc: unknown = null;
  private readonly config: NatsAdapterConfig;

  constructor(config: NatsAdapterConfig) {
    this.config = config;
  }

  private async getConn(): Promise<unknown> {
    if (!this.nc) {
      const natsLib = (await import('nats')) as unknown as {
        connect: (opts: unknown) => Promise<unknown>;
      };
      this.nc = await natsLib.connect({
        servers: `${this.config.host ?? 'localhost'}:${this.config.port ?? 4222}`,
        timeout: 5000,
      });
    }
    return this.nc;
  }

  async listTables(): Promise<string[]> {
    const nc = (await this.getConn()) as {
      jetstreamManager: () => Promise<{
        streams: { list: () => AsyncIterable<{ config: { name: string } }> };
      }>;
    };
    const jsm = await nc.jetstreamManager();
    const streams: string[] = [];
    for await (const info of jsm.streams.list()) {
      streams.push(info.config.name);
    }
    return streams.sort();
  }

  async queryRows(sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> {
    const fromMatch = /FROM\s+(\S+)/i.exec(sql);
    const streamName = fromMatch ? fromMatch[1]! : '';
    const limitMatch = /LIMIT\s+(\d+)/i.exec(sql);
    const limit = limitMatch ? Math.min(Number(limitMatch[1]), 1000) : 100;

    if (!streamName) return [];

    const nc = (await this.getConn()) as {
      jetstreamManager: () => Promise<{
        consumers: {
          add: (stream: string, opts: unknown) => Promise<unknown>;
          delete: (stream: string, name: string) => Promise<unknown>;
        };
      }>;
      jetstream: () => {
        consumers: {
          get: (stream: string, name: string) => Promise<{
            fetch: (opts: unknown) => Promise<AsyncIterable<{
              seq: number;
              subject: string;
              info: { timestampNanos: bigint };
              data: Uint8Array;
            }>>;
          }>;
        };
      };
    };

    const natsLib = (await import('nats')) as unknown as {
      AckPolicy: Record<string, unknown>;
      DeliverPolicy: Record<string, unknown>;
    };

    const jsm = await nc.jetstreamManager();
    const consumerName = `beancli-${Date.now()}`;
    await jsm.consumers.add(streamName, {
      durable_name: consumerName,
      deliver_policy: natsLib.DeliverPolicy['All'],
      ack_policy: natsLib.AckPolicy['None'],
    });

    const js = nc.jetstream();
    const consumer = await js.consumers.get(streamName, consumerName);
    const rows: Record<string, unknown>[] = [];

    try {
      const messages = await consumer.fetch({ max_messages: limit, expires: 3000 });
      for await (const msg of messages) {
        const raw = new TextDecoder().decode(msg.data);
        let parsed: unknown = raw;
        try {
          parsed = JSON.parse(raw);
        } catch {
          /* keep string */
        }
        rows.push({
          seq: msg.seq,
          subject: msg.subject,
          timestamp: String(msg.info.timestampNanos),
          data: typeof parsed === 'object' ? JSON.stringify(parsed) : parsed,
        });
      }
    } finally {
      await jsm.consumers.delete(streamName, consumerName).catch(() => {});
    }

    return rows;
  }

  async close(): Promise<void> {
    if (this.nc) {
      await (this.nc as { drain: () => Promise<void> }).drain().catch(() => {});
      this.nc = null;
    }
  }
}
