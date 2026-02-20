import type { DomainEvent } from '@tfsdc/kernel';
import type { ChangeId } from '../value-objects/ChangeId.js';

export class ChangeApproved implements DomainEvent {
  readonly eventType = 'CHANGE_APPROVED';
  readonly occurredAt: Date;

  constructor(
    readonly changeId: ChangeId,
    readonly approver: string,
    readonly correlationId: string,
  ) {
    this.occurredAt = new Date();
  }
}
