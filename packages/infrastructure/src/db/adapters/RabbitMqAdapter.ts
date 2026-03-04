import type { IDbAdapter } from './IDbAdapter.js';

export interface RabbitMqAdapterConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string; // vhost
}

export class RabbitMqAdapter implements IDbAdapter {
  private connection: unknown = null;
  private readonly config: RabbitMqAdapterConfig;

  constructor(config: RabbitMqAdapterConfig) {
    this.config = config;
  }

  private get mgmtBase(): string {
    const host = this.config.host ?? 'localhost';
    return `http://${host}:15672`;
  }

  private get basicAuth(): string {
    const user = this.config.username ?? 'guest';
    const pass = this.config.password ?? 'guest';
    return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  }

  private async getConnection(): Promise<unknown> {
    if (!this.connection) {
      const amqplib = await import('amqplib');
      const vhost = encodeURIComponent(this.config.database ?? '/');
      const user = this.config.username ?? 'guest';
      const pass = this.config.password ?? 'guest';
      const host = this.config.host ?? 'localhost';
      const port = this.config.port ?? 5672;
      const url = `amqp://${user}:${encodeURIComponent(pass)}@${host}:${port}/${vhost}`;
      this.connection = await amqplib.connect(url, { timeout: 5000 });
    }
    return this.connection;
  }

  async listTables(): Promise<string[]> {
    try {
      const res = await fetch(`${this.mgmtBase}/api/queues`, {
        headers: { Authorization: this.basicAuth },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const queues = (await res.json()) as { name: string }[];
      return queues.map((q) => q.name).sort();
    } catch {
      // Fallback: try via AMQP (queue names not directly listable via AMQP — return empty)
      await this.getConnection(); // verify connectivity
      return [];
    }
  }

  async queryRows(sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> {
    const fromMatch = /FROM\s+(\S+)/i.exec(sql);
    const queue = fromMatch ? fromMatch[1]! : '';
    const limitMatch = /LIMIT\s+(\d+)/i.exec(sql);
    const limit = limitMatch ? Math.min(Number(limitMatch[1]), 1000) : 100;

    if (!queue) return [];

    const conn = (await this.getConnection()) as {
      createChannel: () => Promise<{
        get: (queue: string, opts: { noAck: boolean }) => Promise<
          | {
              content: Buffer;
              properties: { messageId?: string; timestamp?: number; contentType?: string };
              fields: { deliveryTag: number; routingKey: string };
            }
          | false
        >;
      }>;
    };
    const channel = await conn.createChannel();

    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < limit; i++) {
      const msg = await channel.get(queue, { noAck: true });
      if (!msg) break;
      const raw = msg.content.toString();
      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* keep string */
      }
      rows.push({
        delivery_tag: msg.fields.deliveryTag,
        routing_key: msg.fields.routingKey,
        message_id: msg.properties.messageId ?? null,
        timestamp: msg.properties.timestamp ?? null,
        content_type: msg.properties.contentType ?? null,
        body: typeof parsed === 'object' ? JSON.stringify(parsed) : parsed,
      });
    }
    return rows;
  }

  async close(): Promise<void> {
    if (this.connection) {
      await (this.connection as { close: () => Promise<void> }).close().catch(() => {});
      this.connection = null;
    }
  }
}
