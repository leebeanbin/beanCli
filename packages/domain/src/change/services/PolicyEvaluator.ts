import type { Environment, ExecutionMode, RiskLevel, UserRole } from '@tfsdc/kernel';
import { InsufficientPermissionError } from '@tfsdc/kernel';
import { ExecutionPolicy } from '../value-objects/ExecutionPolicy.js';
import type { RiskScore } from '../value-objects/RiskScore.js';

const POLICY_TABLE: Record<Environment, Record<RiskLevel, ExecutionMode>> = {
  LOCAL: { L0: 'AUTO', L1: 'AUTO', L2: 'AUTO' },
  DEV: { L0: 'AUTO', L1: 'AUTO', L2: 'CONFIRM' },
  PROD: { L0: 'CONFIRM', L1: 'CONFIRM', L2: 'MANUAL' },
};

/**
 * Stateless policy evaluation — no exception thrown.
 * Use for tooling, CLI, and tests.
 */
export function evaluatePolicy(
  env: Environment,
  _role: UserRole,
  risk: RiskLevel,
  isBulkChange = false,
): { mode: ExecutionMode; requiresApproval: boolean } {
  let mode = POLICY_TABLE[env][risk];
  if (isBulkChange && mode === 'AUTO') mode = 'CONFIRM';
  const requiresApproval = mode === 'MANUAL' || (mode === 'CONFIRM' && env === 'PROD');
  return { mode, requiresApproval };
}

export class PolicyEvaluator {
  evaluate(params: {
    environment: Environment;
    role: UserRole;
    riskScore: RiskScore;
    isBulkChange: boolean;
  }): ExecutionPolicy {
    if (params.role === 'ANALYST') {
      throw new InsufficientPermissionError('ANALYST cannot create change requests');
    }

    let mode = POLICY_TABLE[params.environment][params.riskScore.level];

    if (params.isBulkChange && mode === 'AUTO') {
      mode = 'CONFIRM';
    }

    const requiresApproval =
      mode === 'MANUAL' || (mode === 'CONFIRM' && params.environment === 'PROD');

    return new ExecutionPolicy(mode, requiresApproval);
  }
}
