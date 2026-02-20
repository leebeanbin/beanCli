import { RiskScore } from './RiskScore';

describe('RiskScore', () => {
  it('clamps points between 0 and 100', () => {
    const low = RiskScore.of(-10, 'L0', 0);
    expect(low.points).toBe(0);

    const high = RiskScore.of(150, 'L2', 0);
    expect(high.points).toBe(100);
  });

  it('isBulkChange is true when >= 1000 rows', () => {
    expect(RiskScore.of(50, 'L1', 999).isBulkChange).toBe(false);
    expect(RiskScore.of(50, 'L1', 1000).isBulkChange).toBe(true);
    expect(RiskScore.of(50, 'L1', 5000).isBulkChange).toBe(true);
  });

  it('requiresBackup is true only for L2', () => {
    expect(RiskScore.of(20, 'L0', 1).requiresBackup).toBe(false);
    expect(RiskScore.of(50, 'L1', 1).requiresBackup).toBe(false);
    expect(RiskScore.of(80, 'L2', 1).requiresBackup).toBe(true);
  });

  it('equals compares points and level', () => {
    const a = RiskScore.of(50, 'L1', 100);
    const b = RiskScore.of(50, 'L1', 200);
    const c = RiskScore.of(51, 'L1', 100);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
