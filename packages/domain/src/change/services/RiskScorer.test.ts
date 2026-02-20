import { RiskScorer } from './RiskScorer';
import type { SqlAst } from '../value-objects/SqlStatement';

const makeAst = (operation: string, hasWhere = true): SqlAst => ({
  operation: operation as SqlAst['operation'],
  targetTable: 'test_table',
  hasWhereClause: hasWhere,
  astHash: 'test-hash',
});

describe('RiskScorer', () => {
  const scorer = new RiskScorer();

  it('SELECT gets L0 (base 0)', () => {
    const score = scorer.score({
      ast: makeAst('SELECT'),
      environment: 'DEV',
      affectedRowsEstimate: 1,
    });
    expect(score.level).toBe('L0');
    expect(score.points).toBe(0);
  });

  it('INSERT gets L0 (base 20)', () => {
    const score = scorer.score({
      ast: makeAst('INSERT'),
      environment: 'DEV',
      affectedRowsEstimate: 1,
    });
    expect(score.level).toBe('L0');
    expect(score.points).toBe(20);
  });

  it('UPDATE gets L1 (base 40)', () => {
    const score = scorer.score({
      ast: makeAst('UPDATE'),
      environment: 'DEV',
      affectedRowsEstimate: 1,
    });
    expect(score.level).toBe('L1');
    expect(score.points).toBe(40);
  });

  it('DELETE gets L1 (base 60)', () => {
    const score = scorer.score({
      ast: makeAst('DELETE'),
      environment: 'DEV',
      affectedRowsEstimate: 1,
    });
    expect(score.level).toBe('L1');
    expect(score.points).toBe(60);
  });

  it('adds +30 for >= 1000 rows', () => {
    const score = scorer.score({
      ast: makeAst('UPDATE'),
      environment: 'DEV',
      affectedRowsEstimate: 1000,
    });
    expect(score.points).toBe(70); // 40 + 30
    expect(score.level).toBe('L2');
  });

  it('adds +20 more for >= 10000 rows', () => {
    const score = scorer.score({
      ast: makeAst('UPDATE'),
      environment: 'DEV',
      affectedRowsEstimate: 10000,
    });
    expect(score.points).toBe(90); // 40 + 30 + 20
    expect(score.level).toBe('L2');
  });

  it('adds +10 for PROD environment', () => {
    const score = scorer.score({
      ast: makeAst('UPDATE'),
      environment: 'PROD',
      affectedRowsEstimate: 1,
    });
    expect(score.points).toBe(50); // 40 + 10
    expect(score.level).toBe('L1');
  });

  it('clamps at 100 max', () => {
    const score = scorer.score({
      ast: makeAst('DELETE'),
      environment: 'PROD',
      affectedRowsEstimate: 50000,
    });
    expect(score.points).toBe(100); // 60+10+30+20 = 120 → clamped 100
    expect(score.level).toBe('L2');
  });
});
