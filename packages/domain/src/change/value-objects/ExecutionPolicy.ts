import type { ExecutionMode } from '@tfsdc/kernel';
import type { RiskScore } from './RiskScore.js';

export class ExecutionPolicy {
  constructor(
    readonly mode: ExecutionMode,
    readonly requiresApproval: boolean,
  ) {}

  needsApprovalFor(_riskScore: RiskScore): boolean {
    return this.requiresApproval;
  }

  equals(other: ExecutionPolicy): boolean {
    return this.mode === other.mode && this.requiresApproval === other.requiresApproval;
  }
}
