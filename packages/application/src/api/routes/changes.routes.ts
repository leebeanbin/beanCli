import type { AuthContext, IDbSession } from '../types.js';

export interface CreateChangeInput {
  sql: string;
  description?: string;
  environment: string;
}

export interface ChangeListQuery {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface IChangeRouteHandler {
  create(ctx: AuthContext, db: IDbSession, input: CreateChangeInput): Promise<{ id: string; status: string }>;
  list(db: IDbSession, query: ChangeListQuery): Promise<{ items: Record<string, unknown>[]; total: number }>;
  getById(db: IDbSession, id: string): Promise<Record<string, unknown> | null>;
  submit(ctx: AuthContext, db: IDbSession, id: string): Promise<{ status: string }>;
  execute(ctx: AuthContext, db: IDbSession, id: string): Promise<{ status: string; affectedRows?: number }>;
  revert(ctx: AuthContext, db: IDbSession, id: string): Promise<{ status: string }>;
}
