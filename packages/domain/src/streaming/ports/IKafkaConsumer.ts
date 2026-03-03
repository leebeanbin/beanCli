import type { RawEvent } from '../entities/RawEvent.js';

export interface IKafkaConsumer {
  subscribe(topics: string[]): Promise<void>;
  poll(maxMessages: number): Promise<RawEvent[]>;
  commitOffset(event: RawEvent): Promise<void>;
  disconnect(): Promise<void>;
}
