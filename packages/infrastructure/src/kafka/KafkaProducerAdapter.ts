import { Kafka, type Producer } from 'kafkajs';
import type { IKafkaNotifier } from '@tfsdc/application';

export class KafkaProducerAdapter implements IKafkaNotifier {
  private producer: Producer;

  constructor(brokers: string[]) {
    const kafka = new Kafka({ clientId: 'tfsdc-api', brokers });
    this.producer = kafka.producer();
  }

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async send(topic: string, messages: { value: string }[]): Promise<void> {
    await this.producer.send({
      topic,
      messages: messages.map((m) => ({ value: m.value })),
    });
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }
}
