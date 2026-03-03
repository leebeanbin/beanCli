import type { RawEvent } from '../entities/RawEvent.js';

export interface IDlqPublisher {
  publish(event: RawEvent, error: Error): Promise<void>;
}
