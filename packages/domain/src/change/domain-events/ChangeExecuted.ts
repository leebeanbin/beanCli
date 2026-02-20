import type { DomainEvent } from '@tfsdc/kernel';
import { CONSTANTS } from '@tfsdc/kernel';
import type { ChangeId } from '../value-objects/ChangeId.js';

export class ChangeExecuted implements DomainEvent {
  readonly eventType = 'CHANGE_EXECUTED';
  readonly occurredAt: Date;
  readonly pkListTruncated: boolean;

  constructor(
    readonly changeId: ChangeId,
    readonly affectedRows: number,
    readonly correlationId: string,
    readonly pkList?: string[],
  ) {
    this.occurredAt = new Date();
    this.pkListTruncated = affectedRows > CONSTANTS.CHANGE_APPLIED_PK_LIST_MAX;
  }
}
