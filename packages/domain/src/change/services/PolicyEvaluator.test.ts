import { InsufficientPermissionError } from '@tfsdc/kernel';
import { PolicyEvaluator } from './PolicyEvaluator';
import { RiskScore } from '../value-objects/RiskScore';

describe('PolicyEvaluator', () => {
  const evaluator = new PolicyEvaluator();

  it('ANALYST cannot create change requests', () => {
    expect(() =>
      evaluator.evaluate({
        environment: 'DEV',
        role: 'ANALYST',
        riskScore: RiskScore.of(10, 'L0', 1),
        isBulkChange: false,
      }),
    ).toThrow(InsufficientPermissionError);
  });

  it('LOCAL always returns AUTO', () => {
    for (const level of ['L0', 'L1', 'L2'] as const) {
      const policy = evaluator.evaluate({
        environment: 'LOCAL',
        role: 'DBA',
        riskScore: RiskScore.of(0, level, 1),
        isBulkChange: false,
      });
      expect(policy.mode).toBe('AUTO');
    }
  });

  it('DEV L2 returns CONFIRM', () => {
    const policy = evaluator.evaluate({
      environment: 'DEV',
      role: 'MANAGER',
      riskScore: RiskScore.of(80, 'L2', 1),
      isBulkChange: false,
    });
    expect(policy.mode).toBe('CONFIRM');
  });

  it('PROD L0/L1 returns CONFIRM', () => {
    const p0 = evaluator.evaluate({
      environment: 'PROD',
      role: 'MANAGER',
      riskScore: RiskScore.of(10, 'L0', 1),
      isBulkChange: false,
    });
    expect(p0.mode).toBe('CONFIRM');

    const p1 = evaluator.evaluate({
      environment: 'PROD',
      role: 'MANAGER',
      riskScore: RiskScore.of(50, 'L1', 1),
      isBulkChange: false,
    });
    expect(p1.mode).toBe('CONFIRM');
  });

  it('PROD L2 returns MANUAL', () => {
    const policy = evaluator.evaluate({
      environment: 'PROD',
      role: 'DBA',
      riskScore: RiskScore.of(80, 'L2', 1),
      isBulkChange: false,
    });
    expect(policy.mode).toBe('MANUAL');
    expect(policy.requiresApproval).toBe(true);
  });

  it('BULK_CHANGE upgrades AUTO to CONFIRM', () => {
    const policy = evaluator.evaluate({
      environment: 'LOCAL',
      role: 'DBA',
      riskScore: RiskScore.of(10, 'L0', 1500),
      isBulkChange: true,
    });
    expect(policy.mode).toBe('CONFIRM');
  });

  it('PROD CONFIRM requires approval', () => {
    const policy = evaluator.evaluate({
      environment: 'PROD',
      role: 'MANAGER',
      riskScore: RiskScore.of(50, 'L1', 1),
      isBulkChange: false,
    });
    expect(policy.requiresApproval).toBe(true);
  });

  it('DEV AUTO does not require approval', () => {
    const policy = evaluator.evaluate({
      environment: 'DEV',
      role: 'MANAGER',
      riskScore: RiskScore.of(10, 'L0', 1),
      isBulkChange: false,
    });
    expect(policy.requiresApproval).toBe(false);
  });
});
