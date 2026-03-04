import type { IDbAdapter } from './IDbAdapter.js';

export interface KafkaAdapterConfig {
  host?: string;
  port?: number;
}

export class KafkaAdapter implements IDbAdapter {
  private kafka: unknown = null;
  private readonly config: KafkaAdapterConfig;

  constructor(config: KafkaAdapterConfig) {
    this.config = config;
  }

  private async getKafka(): Promise<unknown> {
    if (!this.kafka) {
      const { Kafka } = await import('kafkajs');
      this.kafka = new Kafka({
        clientId: 'beanCli',
        brokers: [`${this.config.host ?? 'localhost'}:${this.config.port ?? 9092}`],
        connectionTimeout: 5000,
        requestTimeout: 10000,
      });
    }
    return this.kafka;
  }

  async listTables(): Promise<string[]> {
    const kafka = (await this.getKafka()) as { admin: () => unknown };
    const admin = kafka.admin() as {
      connect: () => Promise<void>;
      listTopics: () => Promise<string[]>;
      disconnect: () => Promise<void>;
    };
    await admin.connect();
    try {
      const topics = await admin.listTopics();
      return topics.sort();
    } finally {
      await admin.disconnect();
    }
  }

  async queryRows(sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> {
    const fromMatch = /FROM\s+(\S+)/i.exec(sql);
    const topic = fromMatch ? fromMatch[1]! : '';
    const limitMatch = /LIMIT\s+(\d+)/i.exec(sql);
    const limit = limitMatch ? Math.min(Number(limitMatch[1]), 1000) : 100;

    if (!topic) return [];

    const kafka = (await this.getKafka()) as {
      consumer: (opts: { groupId: string }) => unknown;
    };
    const groupId = `beancli-read-${Date.now()}`;
    const consumer = kafka.consumer({ groupId }) as {
      connect: () => Promise<void>;
      subscribe: (opts: { topic: string; fromBeginning: boolean }) => Promise<void>;
      run: (opts: {
        eachMessage: (payload: {
          topic: string;
          partition: number;
          message: { offset: string; key: Buffer | null; value: Buffer | null; timestamp: string };
        }) => Promise<void>;
      }) => Promise<void>;
      stop: () => Promise<void>;
      disconnect: () => Promise<void>;
    };

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });

    const rows: Record<string, unknown>[] = [];
    let done = false;

    await Promise.race([
      consumer.run({
        eachMessage: async ({ partition, message }) => {
          if (rows.length >= limit) {
            done = true;
            return;
          }
          const value = message.value?.toString() ?? '';
          let parsed: unknown = value;
          try {
            parsed = JSON.parse(value);
          } catch {
            /* keep as string */
          }
          rows.push({
            offset: message.offset,
            partition,
            key: message.key?.toString() ?? null,
            timestamp: message.timestamp,
            value: typeof parsed === 'object' ? JSON.stringify(parsed) : parsed,
          });
          if (rows.length >= limit) done = true;
        },
      }),
      new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (done || rows.length >= limit) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        // Max 5s wait
        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 5000);
      }),
    ]);

    await consumer.stop();
    await consumer.disconnect();
    return rows;
  }

  async close(): Promise<void> {
    // Kafka admin/consumer are disconnected after each operation
    this.kafka = null;
  }
}
