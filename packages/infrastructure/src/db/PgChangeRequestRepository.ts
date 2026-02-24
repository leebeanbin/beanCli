import type { IChangeRequestRepository } from '@tfsdc/domain';
import type { ChangeRequestStatus, Environment, ExecutionMode, RiskLevel, UserRole } from '@tfsdc/kernel';
import {
  ChangeRequest,
  ChangeId,
  SqlStatement,
  RiskScore,
  ExecutionPolicy,
} from '@tfsdc/domain';
import type { ISqlAstValidator } from '@tfsdc/domain';
import type { PgPool } from './PgPool.js';

export class PgChangeRequestRepository implements IChangeRequestRepository {
  constructor(
    private readonly pool: PgPool,
    private readonly validator: ISqlAstValidator,
  ) {}

  async save(cr: ChangeRequest): Promise<void> {
    await this.pool.query(
      `INSERT INTO change_requests (
        id, status, actor, role, target_table, sql_statement,
        ast_hash, risk_score, risk_level, execution_mode, environment, is_bulk_change,
        affected_rows_estimate, affected_rows_actual, approved_by, approved_at,
        executed_at, reverted_at, failure_reason, correlation_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      ON CONFLICT (id) DO UPDATE SET
        status              = EXCLUDED.status,
        approved_by         = EXCLUDED.approved_by,
        approved_at         = EXCLUDED.approved_at,
        executed_at         = EXCLUDED.executed_at,
        reverted_at         = EXCLUDED.reverted_at,
        failure_reason      = EXCLUDED.failure_reason,
        affected_rows_actual = EXCLUDED.affected_rows_actual,
        updated_at          = now()`,
      [
        cr.id.value,
        cr.status,
        cr.actor,
        cr.role,
        cr.sqlStatement.targetTable,
        cr.sqlStatement.raw,
        cr.sqlStatement.ast.astHash,
        cr.riskScore.points,
        cr.riskScore.level,
        cr.executionPolicy.mode,
        cr.environment,
        cr.isBulkChange,
        cr.riskScore.affectedRowsEstimate,
        cr.affectedRowsActual ?? null,
        cr.approvedBy ?? null,
        cr.approvedAt ?? null,
        cr.executedAt ?? null,
        cr.revertedAt ?? null,
        cr.failureReason ?? null,
        cr.correlationId,
      ],
    );
  }

  async findById(id: ChangeId): Promise<ChangeRequest | null> {
    const result = await this.pool.query(
      'SELECT * FROM change_requests WHERE id = $1',
      [id.value],
    );
    if (result.rows.length === 0) return null;
    return this.reconstitute(result.rows[0]);
  }

  async findByStatus(status: ChangeRequestStatus): Promise<ChangeRequest[]> {
    const result = await this.pool.query(
      'SELECT * FROM change_requests WHERE status = $1 ORDER BY created_at DESC',
      [status],
    );
    return result.rows.map((r) => this.reconstitute(r));
  }

  async findPendingApproval(): Promise<ChangeRequest[]> {
    const result = await this.pool.query(
      `SELECT * FROM change_requests WHERE status = 'PENDING_APPROVAL' ORDER BY created_at ASC`,
    );
    return result.rows.map((r) => this.reconstitute(r));
  }

  private reconstitute(row: Record<string, unknown>): ChangeRequest {
    const raw = row.sql_statement as string;
    const astResult = this.validator.parse(raw);
    const ast = astResult.isOk()
      ? astResult.value
      : {
          operation: 'SELECT' as const,
          targetTable: (row.target_table as string) ?? '',
          hasWhereClause: false,
          astHash: (row.ast_hash as string) ?? '',
        };

    const sqlStatement = SqlStatement.reconstitute(raw, ast);

    const riskLevel = (row.risk_level as RiskLevel) ?? 'L0';
    const riskPoints = Number(row.risk_score ?? 0);
    const affectedRowsEstimate = Number(row.affected_rows_estimate ?? 0);
    const riskScore = RiskScore.of(riskPoints, riskLevel, affectedRowsEstimate);

    const mode = (row.execution_mode as ExecutionMode) ?? 'AUTO';
    const environment = (row.environment as Environment) ?? 'DEV';
    const requiresApproval =
      mode === 'MANUAL' || (mode === 'CONFIRM' && environment === 'PROD');
    const executionPolicy = new ExecutionPolicy(mode, requiresApproval);

    return ChangeRequest.reconstitute({
      id: ChangeId.from(row.id as string),
      actor: row.actor as string,
      role: row.role as UserRole,
      sqlStatement,
      riskScore,
      executionPolicy,
      environment,
      status: row.status as ChangeRequestStatus,
      correlationId: row.correlation_id as string,
      createdAt: new Date(row.created_at as string),
      approvedBy: (row.approved_by as string) ?? undefined,
      approvedAt: row.approved_at ? new Date(row.approved_at as string) : undefined,
      executedAt: row.executed_at ? new Date(row.executed_at as string) : undefined,
      revertedAt: row.reverted_at ? new Date(row.reverted_at as string) : undefined,
      failureReason: (row.failure_reason as string) ?? undefined,
      affectedRowsActual: row.affected_rows_actual != null
        ? Number(row.affected_rows_actual)
        : undefined,
    });
  }
}
