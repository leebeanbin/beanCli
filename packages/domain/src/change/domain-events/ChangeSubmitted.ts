import type { DomainEvent } from '@tfsdc/kernel';
import type { ChangeId } from '../value-objects/ChangeId.js';
import type { RiskScore } from '../value-objects/RiskScore.js';

export class ChangeSubmitted implements DomainEvent {
  readonly eventType = 'CHANGE_SUBMITTED';
  readonly occurredAt: Date;

  constructor(
    readonly changeId: ChangeId,
    readonly actor: string,
    readonly riskScore: RiskScore,
    readonly correlationId: string,
  ) {
    this.occurredAt = new Date();
  }
}
