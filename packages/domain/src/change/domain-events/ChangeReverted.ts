import type { DomainEvent } from '@tfsdc/kernel';
import type { ChangeId } from '../value-objects/ChangeId.js';

export class ChangeReverted implements DomainEvent {
  readonly eventType = 'CHANGE_REVERTED';
  readonly occurredAt: Date;

  constructor(
    readonly changeId: ChangeId,
    readonly correlationId: string,
    readonly snapshotId?: string,
  ) {
    this.occurredAt = new Date();
  }
}
