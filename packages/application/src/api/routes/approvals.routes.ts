import type { AuthContext, IDbSession } from '../types.js';

export interface IApprovalRouteHandler {
  listPending(db: IDbSession): Promise<{ items: Record<string, unknown>[] }>;
  approve(ctx: AuthContext, db: IDbSession, changeId: string): Promise<{ status: string }>;
  reject(
    ctx: AuthContext,
    db: IDbSession,
    changeId: string,
    reason?: string,
  ): Promise<{ status: string }>;
}
