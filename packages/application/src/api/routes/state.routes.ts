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

// Per-table server-side writable field whitelist (prevents arbitrary column injection)
const WRITABLE_FIELDS: Record<string, Set<string>> = {
  state_users:     new Set(['username', 'status', 'tier', 'country_code', 'email_hash']),
  state_products:  new Set(['name', 'status', 'category', 'price_cents', 'stock_quantity', 'sku']),
  state_orders:    new Set(['status', 'total_amount_cents', 'item_count', 'currency_code']),
  state_payments:  new Set(['status', 'amount_cents', 'payment_method', 'currency_code']),
  state_shipments: new Set(['status', 'carrier', 'destination_country']),
};

export class StateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateValidationError';
  }
}

type Normalizer = (value: unknown) => unknown;
type Validator = (value: unknown) => string | null;

interface FieldRule {
  normalize?: Normalizer;
  validate?: Validator;
}

export interface FieldSchemaMeta {
  enum?: string[];
  min?: number;
  max?: number;
  maxLen?: number;
  pattern?: string;
  uppercase?: boolean;
  hint?: string;
}

const UPPERCASE_STATUSES = {
  state_users: new Set(['ACTIVE', 'INACTIVE']),
  state_products: new Set(['ACTIVE', 'INACTIVE', 'DISCONTINUED']),
  state_orders: new Set(['CREATED', 'PAYMENT_PENDING', 'PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  state_payments: new Set(['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']),
  state_shipments: new Set(['PREPARING', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED']),
} as const;

const CATEGORY_CANONICAL = new Map<string, string>([
  ['electronics', 'Electronics'],
  ['fashion', 'Fashion'],
  ['food', 'Food'],
  ['furniture', 'Furniture'],
  ['lifestyle', 'Lifestyle'],
  ['sports', 'Sports'],
]);

const STATE_SCHEMA_META: Record<string, Record<string, FieldSchemaMeta>> = {
  state_users: {
    username: { maxLen: 64, hint: 'max 64 chars' },
    email_hash: { maxLen: 128, hint: 'max 128 chars' },
    status: { enum: Array.from(UPPERCASE_STATUSES.state_users), uppercase: true, hint: 'ACTIVE|INACTIVE' },
    tier: { enum: ['STANDARD', 'PREMIUM', 'VIP'], uppercase: true, hint: 'STANDARD|PREMIUM|VIP' },
    country_code: { pattern: '^[A-Z]{2}$', uppercase: true, hint: 'ISO-3166 alpha-2' },
  },
  state_products: {
    sku: { maxLen: 64, hint: 'max 64 chars' },
    name: { maxLen: 128, hint: 'max 128 chars' },
    status: { enum: Array.from(UPPERCASE_STATUSES.state_products), uppercase: true },
    category: { enum: Array.from(CATEGORY_CANONICAL.values()), hint: 'Electronics|Fashion|Food|Furniture|Lifestyle|Sports' },
    price_cents: { min: 0, hint: 'integer >= 0' },
    stock_quantity: { min: 0, hint: 'integer >= 0' },
  },
  state_orders: {
    status: { enum: Array.from(UPPERCASE_STATUSES.state_orders), uppercase: true },
    total_amount_cents: { min: 0, hint: 'integer >= 0' },
    item_count: { min: 0, hint: 'integer >= 0' },
    currency_code: { pattern: '^[A-Z]{3}$', uppercase: true, hint: 'ISO-4217 alpha-3' },
  },
  state_payments: {
    status: { enum: Array.from(UPPERCASE_STATUSES.state_payments), uppercase: true },
    amount_cents: { min: 0, hint: 'integer >= 0' },
    payment_method: { enum: ['CARD', 'BANK_TRANSFER', 'WALLET'], uppercase: true },
    currency_code: { pattern: '^[A-Z]{3}$', uppercase: true, hint: 'ISO-4217 alpha-3' },
  },
  state_shipments: {
    status: { enum: Array.from(UPPERCASE_STATUSES.state_shipments), uppercase: true },
    carrier: { maxLen: 64, hint: 'max 64 chars' },
    destination_country: { pattern: '^[A-Z]{2}$', uppercase: true, hint: 'ISO-3166 alpha-2' },
  },
};

function toTrimmedString(value: unknown): string {
  return String(value ?? '').trim();
}

function upper(value: unknown): string {
  return toTrimmedString(value).toUpperCase();
}

function validateEnum(label: string, set: Set<string>): Validator {
  return (value: unknown) => (set.has(String(value)) ? null : `${label} must be one of: ${Array.from(set).join(', ')}`);
}

function validatePattern(label: string, regex: RegExp, hint: string): Validator {
  return (value: unknown) => (regex.test(String(value)) ? null : `${label} must match ${hint}`);
}

function validateIntRange(label: string, min: number, max?: number): Validator {
  return (value: unknown) => {
    const n = Number(value);
    if (!Number.isInteger(n)) return `${label} must be an integer`;
    if (n < min) return `${label} must be >= ${min}`;
    if (max !== undefined && n > max) return `${label} must be <= ${max}`;
    return null;
  };
}

function validateMaxLen(label: string, maxLen: number): Validator {
  return (value: unknown) => (String(value).length <= maxLen ? null : `${label} length must be <= ${maxLen}`);
}

const FIELD_RULES: Record<string, Record<string, FieldRule>> = {
  state_users: {
    username: { normalize: toTrimmedString, validate: validateMaxLen('username', 64) },
    email_hash: { normalize: toTrimmedString, validate: validateMaxLen('email_hash', 128) },
    status: { normalize: upper, validate: validateEnum('status', UPPERCASE_STATUSES.state_users) },
    tier: { normalize: upper, validate: validateEnum('tier', new Set(['STANDARD', 'PREMIUM', 'VIP'])) },
    country_code: { normalize: upper, validate: validatePattern('country_code', /^[A-Z]{2}$/, 'ISO-3166 alpha-2') },
  },
  state_products: {
    sku: { normalize: toTrimmedString, validate: validateMaxLen('sku', 64) },
    name: { normalize: toTrimmedString, validate: validateMaxLen('name', 128) },
    status: { normalize: upper, validate: validateEnum('status', UPPERCASE_STATUSES.state_products) },
    category: {
      normalize: (v) => {
        const s = toTrimmedString(v);
        return CATEGORY_CANONICAL.get(s.toLowerCase()) ?? s;
      },
      validate: validateEnum('category', new Set(Array.from(CATEGORY_CANONICAL.values()))),
    },
    price_cents: { normalize: (v) => Number(v), validate: validateIntRange('price_cents', 0) },
    stock_quantity: { normalize: (v) => Number(v), validate: validateIntRange('stock_quantity', 0) },
  },
  state_orders: {
    status: { normalize: upper, validate: validateEnum('status', UPPERCASE_STATUSES.state_orders) },
    total_amount_cents: { normalize: (v) => Number(v), validate: validateIntRange('total_amount_cents', 0) },
    item_count: { normalize: (v) => Number(v), validate: validateIntRange('item_count', 0) },
    currency_code: { normalize: upper, validate: validatePattern('currency_code', /^[A-Z]{3}$/, 'ISO-4217 alpha-3') },
  },
  state_payments: {
    status: { normalize: upper, validate: validateEnum('status', UPPERCASE_STATUSES.state_payments) },
    amount_cents: { normalize: (v) => Number(v), validate: validateIntRange('amount_cents', 0) },
    payment_method: { normalize: upper, validate: validateEnum('payment_method', new Set(['CARD', 'BANK_TRANSFER', 'WALLET'])) },
    currency_code: { normalize: upper, validate: validatePattern('currency_code', /^[A-Z]{3}$/, 'ISO-4217 alpha-3') },
  },
  state_shipments: {
    status: { normalize: upper, validate: validateEnum('status', UPPERCASE_STATUSES.state_shipments) },
    carrier: { normalize: toTrimmedString, validate: validateMaxLen('carrier', 64) },
    destination_country: { normalize: upper, validate: validatePattern('destination_country', /^[A-Z]{2}$/, 'ISO-3166 alpha-2') },
  },
};

function normalizeAndValidateField(table: string, field: string, value: unknown): unknown {
  const rule = FIELD_RULES[table]?.[field];
  const normalized = rule?.normalize ? rule.normalize(value) : value;
  const err = rule?.validate?.(normalized) ?? null;
  if (err) throw new StateValidationError(err);
  return normalized;
}

export async function updateStateField(
  db: IDbSession,
  table: string,
  id: string,
  field: string,
  value: unknown,
): Promise<{ updated: boolean }> {
  if (!isValidStateTable(table)) throw new Error(`Invalid state table: ${table}`);

  const allowed = WRITABLE_FIELDS[table];
  if (!allowed?.has(field)) throw new Error(`Field '${field}' is not writable on ${table}`);

  // Fully parameterized — table/field names validated above, values via $N placeholders
  const normalized = normalizeAndValidateField(table, field, value);
  const result = await db.query(
    `UPDATE "${table}" SET "${field}" = $1, updated_event_time_ms = $2 WHERE entity_id_hash = $3`,
    [normalized, Date.now(), id],
  );
  return { updated: (result.rowCount ?? 0) > 0 };
}

export async function deleteStateRow(
  db: IDbSession,
  table: string,
  id: string,
): Promise<{ deleted: boolean }> {
  if (!isValidStateTable(table)) throw new Error(`Invalid state table: ${table}`);

  const result = await db.query(
    `DELETE FROM "${table}" WHERE entity_id_hash = $1`,
    [id],
  );
  return { deleted: (result.rowCount ?? 0) > 0 };
}

export async function insertStateRow(
  db: IDbSession,
  table: string,
  data: Record<string, unknown>,
): Promise<{ inserted: boolean }> {
  if (!isValidStateTable(table)) throw new Error(`Invalid state table: ${table}`);

  const allowed = WRITABLE_FIELDS[table];
  if (!allowed) throw new Error(`No writable fields defined for ${table}`);

  // Accept entity_id_hash (PK) + whitelisted fields only — reject everything else
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'entity_id_hash' || allowed.has(k)) {
      filtered[k] = k === 'entity_id_hash' ? toTrimmedString(v) : normalizeAndValidateField(table, k, v);
    }
  }
  if (!filtered['entity_id_hash']) throw new Error('entity_id_hash is required');

  // Inject server-side timestamps
  filtered['updated_event_time_ms'] = Date.now();
  if (!filtered['last_offset']) filtered['last_offset'] = 0;

  const cols = Object.keys(filtered);
  const vals: unknown[] = Object.values(filtered);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

  await db.query(
    `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
    vals,
  );
  return { inserted: true };
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
  const allowedOrderBy = new Set<string>([
    'entity_id_hash',
    'updated_event_time_ms',
    'last_offset',
    ...Array.from(WRITABLE_FIELDS[table] ?? []),
  ]);
  const safeOrderBy = allowedOrderBy.has(orderBy) ? orderBy : 'updated_event_time_ms';

  const countResult = await db.query(`SELECT COUNT(*) as total FROM "${table}"`);
  const total = Number(countResult.rows[0]?.total ?? 0);

  const result = await db.query(
    `SELECT * FROM "${table}" ORDER BY "${safeOrderBy}" ${order} LIMIT $1 OFFSET $2`,
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
    `SELECT * FROM "${table}" WHERE entity_id_hash = $1`,
    [entityIdHash],
  );

  return result.rows[0] ?? null;
}

export function getStateSchema(table: string): { table: string; writableFields: string[]; fieldMeta: Record<string, FieldSchemaMeta> } {
  if (!isValidStateTable(table)) {
    throw new Error(`Invalid state table: ${table}`);
  }
  return {
    table,
    writableFields: Array.from(WRITABLE_FIELDS[table] ?? []),
    fieldMeta: STATE_SCHEMA_META[table] ?? {},
  };
}
