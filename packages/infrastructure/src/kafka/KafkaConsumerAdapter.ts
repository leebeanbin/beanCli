import { Kafka, type Consumer, type EachMessagePayload } from 'kafkajs';
import type { RawEvent, IKafkaConsumer } from '@tfsdc/domain';

const CONSUMER_CONFIG = {
  groupId: 'tfsdc-projector',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
};

export class KafkaConsumerAdapter implements IKafkaConsumer {
  private consumer: Consumer;
  private buffer: RawEvent[] = [];
  private resolveWait: (() => void) | null = null;

  constructor(brokers: string[], groupId?: string) {
    const kafka = new Kafka({ clientId: 'tfsdc-projector', brokers });
    this.consumer = kafka.consumer({
      groupId: groupId ?? CONSUMER_CONFIG.groupId,
      sessionTimeout: CONSUMER_CONFIG.sessionTimeout,
      heartbeatInterval: CONSUMER_CONFIG.heartbeatInterval,
    });
  }

  async subscribe(topics: string[]): Promise<void> {
    await this.consumer.connect();
    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, partition, message } = payload;
        if (!message.value) return;

        try {
          const parsed = JSON.parse(message.value.toString());
          const event: RawEvent = {
            sourceTopic: topic,
            partition,
            offset: Number(message.offset),
            eventTimeMs: Number(message.timestamp) || Date.now(),
            entityType: parsed.entityType ?? topic.split('.').pop() ?? 'unknown',
            canonicalId: parsed.canonicalId ?? parsed.id ?? '',
            payload: parsed.payload ?? parsed,
          };
          this.buffer.push(event);
          this.resolveWait?.();
        } catch {
          // skip unparseable messages
        }
      },
    });
  }

  async poll(maxMessages: number): Promise<RawEvent[]> {
    if (this.buffer.length === 0) {
      await new Promise<void>((resolve) => {
        this.resolveWait = resolve;
        setTimeout(resolve, 1000);
      });
    }
    const batch = this.buffer.splice(0, maxMessages);
    return batch;
  }

  async commitOffset(event: RawEvent): Promise<void> {
    await this.consumer.commitOffsets([
      {
        topic: event.sourceTopic,
        partition: event.partition,
        offset: String(event.offset + 1),
      },
    ]);
  }

  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }
}
