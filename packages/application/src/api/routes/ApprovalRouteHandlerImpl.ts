import { ChangeId } from '@tfsdc/domain';
import type { IChangeRequestRepository } from '@tfsdc/domain';
import type { IApprovalRouteHandler } from './approvals.routes.js';
import type { AuthContext, IDbSession } from '../types.js';

function notFound(id: string): Error {
  const err = new Error(`Change request ${id} not found`) as Error & { statusCode: number };
  err.statusCode = 404;
  return err;
}

export class ApprovalRouteHandlerImpl implements IApprovalRouteHandler {
  constructor(private readonly repo: IChangeRequestRepository) {}

  async listPending(db: IDbSession): Promise<{ items: Record<string, unknown>[] }> {
    const result = await db.query(
      `SELECT * FROM change_requests WHERE status = 'PENDING_APPROVAL' ORDER BY created_at ASC`,
    );
    return { items: result.rows };
  }

  async approve(
    ctx: AuthContext,
    _db: IDbSession,
    changeId: string,
  ): Promise<{ status: string }> {
    const id = ChangeId.from(changeId);
    const cr = await this.repo.findById(id);
    if (!cr) throw notFound(changeId);

    cr.approve(ctx.actor);
    await this.repo.save(cr);
    return { status: cr.status };
  }

  async reject(
    _ctx: AuthContext,
    _db: IDbSession,
    changeId: string,
  ): Promise<{ status: string }> {
    const id = ChangeId.from(changeId);
    const cr = await this.repo.findById(id);
    if (!cr) throw notFound(changeId);

    cr.reject();
    await this.repo.save(cr);
    return { status: cr.status };
  }
}
