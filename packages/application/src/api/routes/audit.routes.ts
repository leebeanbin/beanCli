import type { IDbSession } from '../types.js';

export interface AuditListQuery {
  category?: string;
  actor?: string;
  limit?: number;
  offset?: number;
}

export async function listAuditLogs(
  db: IDbSession,
  query: AuditListQuery,
): Promise<{ items: Record<string, unknown>[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (query.category) {
    conditions.push(`category = $${paramIdx++}`);
    params.push(query.category);
  }
  if (query.actor) {
    conditions.push(`actor = $${paramIdx++}`);
    params.push(query.actor);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(query.limit ?? 50, 200);
  const offset = query.offset ?? 0;

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM audit_events ${whereClause}`,
    params,
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  params.push(limit, offset);
  const result = await db.query(
    `SELECT * FROM audit_events ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    params,
  );

  return { items: result.rows, total };
}
