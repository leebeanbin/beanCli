export { PolicyEvaluator, RiskScorer } from '@tfsdc/domain';
import type { Environment, ExecutionMode, RiskLevel, UserRole } from '@tfsdc/kernel';

const POLICY_TABLE: Record<Environment, Record<RiskLevel, ExecutionMode>> = {
  LOCAL: { L0: 'AUTO', L1: 'AUTO', L2: 'AUTO' },
  DEV: { L0: 'AUTO', L1: 'AUTO', L2: 'CONFIRM' },
  PROD: { L0: 'CONFIRM', L1: 'CONFIRM', L2: 'MANUAL' },
};

/**
 * Stateless policy evaluation helper for testing and tooling.
 * Returns `{ mode, requiresApproval }` without throwing.
 */
export function evaluatePolicy(
  env: Environment,
  _role: UserRole,
  risk: RiskLevel,
  isBulkChange = false,
): { mode: ExecutionMode; requiresApproval: boolean } {
  let mode = POLICY_TABLE[env][risk];

  if (isBulkChange && mode === 'AUTO') {
    mode = 'CONFIRM';
  }

  const requiresApproval = mode === 'MANUAL' || (mode === 'CONFIRM' && env === 'PROD');
  return { mode, requiresApproval };
}
