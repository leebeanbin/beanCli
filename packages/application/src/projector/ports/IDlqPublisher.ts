import type { RawEvent } from '@tfsdc/domain';

export interface IDlqPublisher {
  publish(event: RawEvent, error: Error): Promise<void>;
}
