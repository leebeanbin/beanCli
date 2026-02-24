import {
  ChangeRequest,
  ChangeId,
  SqlStatement,
  RiskScore,
  ExecutionPolicy,
} from '@tfsdc/domain';
import type { IAuditWriter, IDbSession } from '@tfsdc/application';

// ── ChangeRequest stub ──────────────────────────────────────

export function makeChangeRequest(overrides?: Partial<{
  id: string;
  actor: string;
  role: import('@tfsdc/kernel').UserRole;
  sql: string;
  environment: import('@tfsdc/kernel').Environment;
  riskPoints: number;
  riskLevel: import('@tfsdc/kernel').RiskLevel;
  affectedRows: number;
  mode: import('@tfsdc/kernel').ExecutionMode;
  requiresApproval: boolean;
}>): ChangeRequest {
  const id = overrides?.id ?? 'test-change-id-1234';
  const riskScore = makeRiskScore({
    points: overrides?.riskPoints,
    level: overrides?.riskLevel,
    affectedRowsEstimate: overrides?.affectedRows,
  });
  const executionPolicy = new ExecutionPolicy(
    overrides?.mode ?? 'AUTO',
    overrides?.requiresApproval ?? false,
  );
  const ast = {
    operation: 'SELECT' as const,
    targetTable: 'state_users',
    hasWhereClause: true,
    astHash: 'test-hash',
  };
  const sqlStatement = SqlStatement.reconstitute(overrides?.sql ?? 'SELECT 1', ast);

  return ChangeRequest.reconstitute({
    id: ChangeId.from(id),
    actor: overrides?.actor ?? 'test-actor',
    role: overrides?.role ?? 'DBA',
    sqlStatement,
    riskScore,
    executionPolicy,
    environment: overrides?.environment ?? 'DEV',
    status: 'DRAFT',
    correlationId: 'test-correlation-id',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
}

// ── RiskScore stub ──────────────────────────────────────────

export function makeRiskScore(overrides?: Partial<{
  points: number;
  level: import('@tfsdc/kernel').RiskLevel;
  affectedRowsEstimate: number;
}>): RiskScore {
  return RiskScore.of(
    overrides?.points ?? 0,
    overrides?.level ?? 'L0',
    overrides?.affectedRowsEstimate ?? 0,
  );
}

// ── Mock DB session ─────────────────────────────────────────

export function makeMockDb(): jest.Mocked<IDbSession> {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  };
}

// ── Mock AuditWriter ────────────────────────────────────────

export function makeMockAuditWriter(): jest.Mocked<IAuditWriter> {
  return {
    write: jest.fn().mockResolvedValue(undefined),
  };
}

// ── MockCanvas (TUI testing) ─────────────────────────────────
export { MockCanvas } from './MockCanvas.js';
