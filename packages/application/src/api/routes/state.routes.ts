import type { IDbSession } from '../types.js';

export interface StateListQuery {
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
}

const ALLOWED_TABLES = new Set([
  'state_users',
  'state_products',
  'state_orders',
  'state_payments',
  'state_shipments',
]);

export function isValidStateTable(table: string): boolean {
  return ALLOWED_TABLES.has(table);
}

export async function listState(
  db: IDbSession,
  table: string,
  query: StateListQuery,
): Promise<{ items: Record<string, unknown>[]; total: number }> {
  if (!isValidStateTable(table)) {
    throw new Error(`Invalid state table: ${table}`);
  }

  const limit = Math.min(query.limit ?? 50, 200);
  const offset = query.offset ?? 0;
  const orderBy = query.orderBy ?? 'updated_event_time_ms';
  const order = query.order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await db.query(`SELECT COUNT(*) as total FROM ${table}`);
  const total = Number(countResult.rows[0]?.total ?? 0);

  const result = await db.query(
    `SELECT * FROM ${table} ORDER BY ${orderBy} ${order} LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return { items: result.rows, total };
}

export async function getStateById(
  db: IDbSession,
  table: string,
  entityIdHash: string,
): Promise<Record<string, unknown> | null> {
  if (!isValidStateTable(table)) {
    throw new Error(`Invalid state table: ${table}`);
  }

  const result = await db.query(
    `SELECT * FROM ${table} WHERE entity_id_hash = $1`,
    [entityIdHash],
  );

  return result.rows[0] ?? null;
}
