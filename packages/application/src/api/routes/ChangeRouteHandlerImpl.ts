import type { Environment } from '@tfsdc/kernel';
import { ChangeRequest, ChangeId, SqlStatement, RiskScorer, PolicyEvaluator } from '@tfsdc/domain';
import type { IChangeRequestRepository, ISqlAstValidator } from '@tfsdc/domain';
import type { IChangeRouteHandler, CreateChangeInput, ChangeListQuery } from './changes.routes.js';
import type { AuthContext, IDbSession } from '../types.js';
import type { WsConnectionManager } from '../websocket/WsConnectionManager.js';

function notFound(id: string): Error {
  const err = new Error(`Change request ${id} not found`) as Error & { statusCode: number };
  err.statusCode = 404;
  return err;
}

function badRequest(msg: string): Error {
  const err = new Error(msg) as Error & { statusCode: number };
  err.statusCode = 400;
  return err;
}

export class ChangeRouteHandlerImpl implements IChangeRouteHandler {
  private readonly riskScorer = new RiskScorer();
  private readonly policyEvaluator = new PolicyEvaluator();

  constructor(
    private readonly repo: IChangeRequestRepository,
    private readonly validator: ISqlAstValidator,
    private readonly wsManager: WsConnectionManager,
  ) {}

  async create(
    ctx: AuthContext,
    _db: IDbSession,
    input: CreateChangeInput,
  ): Promise<{ id: string; status: string }> {
    const environment = (input.environment ?? 'DEV') as Environment;

    let sqlStatement: SqlStatement;
    try {
      sqlStatement = SqlStatement.parse(input.sql, this.validator);
    } catch (e) {
      throw badRequest((e as Error).message);
    }

    const riskScore = this.riskScorer.score({
      ast: sqlStatement.ast,
      environment,
      affectedRowsEstimate: sqlStatement.ast.estimatedAffectedRows ?? 0,
    });

    let executionPolicy;
    try {
      executionPolicy = this.policyEvaluator.evaluate({
        environment,
        role: ctx.role,
        riskScore,
        isBulkChange: riskScore.isBulkChange,
      });
    } catch (e) {
      throw badRequest((e as Error).message);
    }

    const cr = ChangeRequest.create({
      actor: ctx.actor,
      role: ctx.role,
      sqlStatement,
      riskScore,
      executionPolicy,
      environment,
    });

    await this.repo.save(cr);
    return { id: cr.id.value, status: cr.status };
  }

  async list(
    db: IDbSession,
    query: ChangeListQuery,
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (query.status) {
      conditions.push(`status = $${idx++}`);
      params.push(query.status);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;

    const countRes = await db.query(
      `SELECT COUNT(*) as total FROM change_requests ${where}`,
      params.slice(),
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    params.push(limit, offset);
    const result = await db.query(
      `SELECT * FROM change_requests ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      params,
    );
    return { items: result.rows, total };
  }

  async getById(db: IDbSession, id: string): Promise<Record<string, unknown> | null> {
    const result = await db.query('SELECT * FROM change_requests WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  }

  async submit(_ctx: AuthContext, _db: IDbSession, id: string): Promise<{ status: string }> {
    const changeId = ChangeId.from(id);
    const cr = await this.repo.findById(changeId);
    if (!cr) throw notFound(id);

    cr.submit();
    await this.repo.save(cr);
    return { status: cr.status };
  }

  async execute(
    _ctx: AuthContext,
    db: IDbSession,
    id: string,
  ): Promise<{ status: string; affectedRows?: number }> {
    const changeId = ChangeId.from(id);
    const cr = await this.repo.findById(changeId);
    if (!cr) throw notFound(id);

    if (cr.status !== 'APPROVED' && cr.status !== 'WAITING_EXECUTION') {
      throw badRequest(`Cannot execute change in status ${cr.status}`);
    }

    // Backup snapshot for L2 changes
    if (cr.requiresBackup) {
      try {
        const whereClause = cr.sqlStatement.raw.match(/WHERE\s+.+/i)?.[0] ?? 'WHERE TRUE';
        await db.query(
          `INSERT INTO backup_snapshots (change_id, table_name, where_clause, snapshot)
           SELECT $1, $2, $3, json_agg(t.*)
           FROM ${cr.sqlStatement.targetTable} t
           ${whereClause}`,
          [cr.id.value, cr.sqlStatement.targetTable, whereClause],
        );
      } catch {
        // snapshot failure is non-fatal; log and continue
      }
    }

    cr.startExecution();
    await this.repo.save(cr);

    let affectedRows = 0;
    try {
      const execResult = await db.query(cr.sqlStatement.raw);
      affectedRows = execResult.rowCount ?? 0;

      cr.complete(affectedRows);
      await this.repo.save(cr);

      this.wsManager.broadcast(cr.sqlStatement.targetTable, {
        type: 'CHANGE_APPLIED',
        event: {
          changeId: cr.id.value,
          tableName: cr.sqlStatement.targetTable,
          affectedCount: affectedRows,
          pkListTruncated: false,
          correlationId: cr.correlationId,
        },
      });
    } catch (err) {
      cr.fail((err as Error).message);
      await this.repo.save(cr);
    }

    return { status: cr.status, affectedRows };
  }

  async revert(_ctx: AuthContext, db: IDbSession, id: string): Promise<{ status: string }> {
    const changeId = ChangeId.from(id);
    const cr = await this.repo.findById(changeId);
    if (!cr) throw notFound(id);

    if (cr.status !== 'FAILED') {
      throw badRequest(`Cannot revert change in status ${cr.status}`);
    }

    // Attempt restore from backup_snapshots if available
    let snapshotId: string | undefined;
    try {
      const snap = await db.query(
        `SELECT id, snapshot FROM backup_snapshots
         WHERE change_id = $1 AND expires_at > now()
         ORDER BY created_at DESC LIMIT 1`,
        [cr.id.value],
      );
      if (snap.rows.length > 0) {
        snapshotId = String(snap.rows[0].id);
      }
    } catch {
      // restore attempt is best-effort
    }

    cr.revert(snapshotId);
    await this.repo.save(cr);
    return { status: cr.status };
  }
}
