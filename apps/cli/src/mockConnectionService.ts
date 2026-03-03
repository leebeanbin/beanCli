/**
 * MockConnectionService — in-memory demo data, no real DB or API needed.
 *
 * Usage:  pnpm dev:ink --mock
 *         MOCK=true pnpm dev:ink
 *
 * Simulates login (DBA role), connection test, multi-table data, schema queries,
 * and basic DML (UPDATE/INSERT/DELETE modify the in-memory store).
 */
import type {
  IConnectionService,
  DbConnection,
  ConnectResult,
  QueryResult,
  AiMessage,
  AiStreamCallbacks,
  LoginResult,
} from '@tfsdc/tui';

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowMs() { return Date.now(); }
function ts(daysAgo: number) { return Date.now() - daysAgo * 86_400_000; }
function hash(s: string) { return `hash_${s.toLowerCase().replace(/\s+/g, '_')}_${s.length.toString(16)}`; }

// ── Mock schema definitions ───────────────────────────────────────────────────

const SCHEMAS: Record<string, Array<{ column: string; type: string; nullable: string; default: string }>> = {
  state_users: [
    { column: 'id',              type: 'integer',          nullable: 'NO',  default: "nextval('state_users_id_seq')" },
    { column: 'entity_id_hash',  type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'username',        type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'email_hash',      type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'role',            type: 'USER-DEFINED',     nullable: 'NO',  default: "'ANALYST'" },
    { column: 'balance_cents',   type: 'integer',          nullable: 'YES', default: '0' },
    { column: 'created_at_ms',   type: 'bigint',           nullable: 'NO',  default: '' },
  ],
  state_orders: [
    { column: 'id',              type: 'integer',          nullable: 'NO',  default: "nextval('state_orders_id_seq')" },
    { column: 'entity_id_hash',  type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'user_id',         type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'status',          type: 'character varying', nullable: 'NO',  default: "'PENDING'" },
    { column: 'total_cents',     type: 'integer',          nullable: 'NO',  default: '0' },
    { column: 'item_count',      type: 'integer',          nullable: 'YES', default: '1' },
    { column: 'created_at_ms',   type: 'bigint',           nullable: 'NO',  default: '' },
  ],
  state_products: [
    { column: 'id',              type: 'integer',          nullable: 'NO',  default: "nextval('state_products_id_seq')" },
    { column: 'sku',             type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'name',            type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'price_cents',     type: 'integer',          nullable: 'NO',  default: '0' },
    { column: 'stock',           type: 'integer',          nullable: 'YES', default: '0' },
    { column: 'category',        type: 'character varying', nullable: 'YES', default: '' },
    { column: 'active',          type: 'boolean',          nullable: 'NO',  default: 'true' },
  ],
  state_payments: [
    { column: 'id',              type: 'integer',          nullable: 'NO',  default: "nextval('state_payments_id_seq')" },
    { column: 'order_id',        type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'amount_cents',    type: 'integer',          nullable: 'NO',  default: '0' },
    { column: 'method',          type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'status',          type: 'character varying', nullable: 'NO',  default: "'PENDING'" },
    { column: 'created_at_ms',   type: 'bigint',           nullable: 'NO',  default: '' },
  ],
  state_shipments: [
    { column: 'id',              type: 'integer',          nullable: 'NO',  default: "nextval('state_shipments_id_seq')" },
    { column: 'order_id',        type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'tracking_number_hash', type: 'character varying', nullable: 'YES', default: '' },
    { column: 'status',          type: 'character varying', nullable: 'NO',  default: "'PREPARING'" },
    { column: 'carrier',         type: 'character varying', nullable: 'YES', default: '' },
    { column: 'shipped_at_ms',   type: 'bigint',           nullable: 'YES', default: '' },
    { column: 'delivered_at_ms', type: 'bigint',           nullable: 'YES', default: '' },
  ],
  events_raw: [
    { column: 'id',              type: 'bigint',           nullable: 'NO',  default: "nextval('events_raw_id_seq')" },
    { column: 'entity_type',     type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'entity_id_hash',  type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'event_type',      type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'payload',         type: 'jsonb',            nullable: 'YES', default: '' },
    { column: 'source_topic',    type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'last_offset',     type: 'bigint',           nullable: 'YES', default: '0' },
    { column: 'created_at_ms',   type: 'bigint',           nullable: 'NO',  default: '' },
  ],
  audit_events: [
    { column: 'id',              type: 'bigint',           nullable: 'NO',  default: "nextval('audit_events_id_seq')" },
    { column: 'actor',           type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'action',          type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'resource',        type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'category',        type: 'character varying', nullable: 'YES', default: '' },
    { column: 'details',         type: 'jsonb',            nullable: 'YES', default: '' },
    { column: 'created_at_ms',   type: 'bigint',           nullable: 'NO',  default: '' },
  ],
  dlq_events: [
    { column: 'id',              type: 'bigint',           nullable: 'NO',  default: "nextval('dlq_events_id_seq')" },
    { column: 'source_topic',    type: 'character varying', nullable: 'NO',  default: '' },
    { column: 'partition',       type: 'integer',          nullable: 'NO',  default: '0' },
    { column: 'offset',          type: 'bigint',           nullable: 'NO',  default: '0' },
    { column: 'error_message',   type: 'text',             nullable: 'YES', default: '' },
    { column: 'payload',         type: 'jsonb',            nullable: 'YES', default: '' },
    { column: 'status',          type: 'character varying', nullable: 'NO',  default: "'FAILED'" },
    { column: 'created_at_ms',   type: 'bigint',           nullable: 'NO',  default: '' },
  ],
};

// ── Mock row factories ────────────────────────────────────────────────────────

const ROLES = ['DBA', 'MANAGER', 'ANALYST', 'ANALYST', 'ANALYST'] as const;
const STATUSES_ORDER = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const METHODS = ['card', 'bank_transfer', 'crypto', 'paypal'];
const CARRIERS = ['FedEx', 'UPS', 'DHL', 'USPS', 'CJ'];
const CATEGORIES = ['electronics', 'clothing', 'food', 'books', 'sports'];
const EVENT_TYPES = ['user.created', 'order.placed', 'payment.processed', 'shipment.dispatched', 'order.cancelled'];
const ACTIONS = ['login', 'query.execute', 'table.read', 'record.update', 'record.delete'];
const TOPICS = ['orders', 'payments', 'shipments', 'users'];

function makeUsers(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    id:             i + 1,
    entity_id_hash: hash(`user_${i + 1}`),
    username:       ['alice', 'bob', 'charlie', 'diana', 'evan', 'fiona', 'grace', 'henry'][i % 8] + `_${i}`,
    email_hash:     hash(`user${i + 1}@example.com`),
    role:           ROLES[i % ROLES.length],
    balance_cents:  Math.floor(Math.random() * 500_00),   // up to $500.00
    created_at_ms:  ts(Math.floor(Math.random() * 90)),
  }));
}

function makeOrders(n: number, users: Record<string, unknown>[]): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    id:             i + 1,
    entity_id_hash: hash(`order_${i + 1}`),
    user_id:        users[i % users.length]!['entity_id_hash'],
    status:         STATUSES_ORDER[i % STATUSES_ORDER.length],
    total_cents:    Math.floor(Math.random() * 20000) + 500,   // $5.00 – $200.00
    item_count:     Math.floor(Math.random() * 5) + 1,
    created_at_ms:  ts(Math.floor(Math.random() * 60)),
  }));
}

function makeProducts(n: number): Record<string, unknown>[] {
  const names = ['MacBook Pro 14"', 'AirPods Pro', 'iPhone 15', 'iPad Air', 'Apple Watch', 'Kindle Paperwhite', 'Mechanical Keyboard', 'USB-C Hub', 'Standing Desk Mat', 'Webcam HD 1080p'];
  return Array.from({ length: n }, (_, i) => ({
    id:           i + 1,
    sku:          `SKU-${String(i + 1).padStart(4, '0')}`,
    name:         names[i % names.length]! + (i >= names.length ? ` v${Math.floor(i / names.length) + 1}` : ''),
    price_cents:  Math.floor(Math.random() * 100000) + 999,   // $9.99 – $1,009.98
    stock:        Math.floor(Math.random() * 200),
    category:     CATEGORIES[i % CATEGORIES.length],
    active:       i % 7 !== 0,   // 1 in 7 inactive
  }));
}

function makePayments(orders: Record<string, unknown>[]): Record<string, unknown>[] {
  return orders.map((o, i) => ({
    id:             i + 1,
    order_id:       o['entity_id_hash'],
    amount_cents:   o['total_cents'],
    method:         METHODS[i % METHODS.length],
    status:         o['status'] === 'PENDING' ? 'PENDING' : 'COMPLETED',
    created_at_ms:  (o['created_at_ms'] as number) + 30_000,
  }));
}

function makeShipments(orders: Record<string, unknown>[]): Record<string, unknown>[] {
  return orders
    .filter(o => !['PENDING', 'CANCELLED'].includes(o['status'] as string))
    .map((o, i) => ({
      id:                   i + 1,
      order_id:             o['entity_id_hash'],
      tracking_number_hash: hash(`TRK${String(i + 1).padStart(10, '0')}`),
      status:               o['status'] === 'DELIVERED' ? 'DELIVERED' : 'IN_TRANSIT',
      carrier:              CARRIERS[i % CARRIERS.length],
      shipped_at_ms:        (o['created_at_ms'] as number) + 2 * 86_400_000,
      delivered_at_ms:      o['status'] === 'DELIVERED'
                              ? (o['created_at_ms'] as number) + 5 * 86_400_000
                              : null,
    }));
}

function makeEvents(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    id:             i + 1,
    entity_type:    ['user', 'order', 'payment', 'shipment'][i % 4],
    entity_id_hash: hash(`entity_${i}`),
    event_type:     EVENT_TYPES[i % EVENT_TYPES.length],
    payload:        JSON.stringify({ seq: i, ok: true }),
    source_topic:   TOPICS[i % TOPICS.length],
    last_offset:    i,
    created_at_ms:  ts(Math.floor(Math.random() * 30)),
  }));
}

function makeAudit(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    id:             i + 1,
    actor:          ['alice_0', 'bob_1', 'admin'][i % 3],
    action:         ACTIONS[i % ACTIONS.length],
    resource:       ['state_users', 'state_orders', 'state_products'][i % 3],
    category:       ['AUTH', 'CHANGE', 'APPROVAL', 'SYSTEM'][i % 4],
    details:        JSON.stringify({ ip: '127.0.0.1', ok: i % 5 !== 0 }),
    created_at_ms:  ts(Math.floor(Math.random() * 7)),
  }));
}

function makeDlq(n: number): Record<string, unknown>[] {
  const errors = [
    'Duplicate key value violates unique constraint',
    'Connection timeout after 30s',
    'Invalid JSON payload',
    'Schema validation failed: missing required field',
  ];
  return Array.from({ length: n }, (_, i) => ({
    id:             i + 1,
    source_topic:   TOPICS[i % TOPICS.length],
    partition:      i % 3,
    offset:         100 + i,
    error_message:  errors[i % errors.length],
    payload:        JSON.stringify({ original: `msg_${i}` }),
    status:         i % 3 === 0 ? 'REQUEUED' : 'FAILED',
    created_at_ms:  ts(Math.floor(Math.random() * 3)),
  }));
}

// ── Build tables ──────────────────────────────────────────────────────────────

const USERS    = makeUsers(25);
const ORDERS   = makeOrders(40, USERS);
const PRODUCTS = makeProducts(18);
const PAYMENTS = makePayments(ORDERS);
const SHIPMENTS = makeShipments(ORDERS);
const EVENTS   = makeEvents(60);
const AUDIT    = makeAudit(30);
const DLQ      = makeDlq(8);

// Mutable stores for DML simulation
const STORES: Record<string, Record<string, unknown>[]> = {
  state_users:     [...USERS],
  state_orders:    [...ORDERS],
  state_products:  [...PRODUCTS],
  state_payments:  [...PAYMENTS],
  state_shipments: [...SHIPMENTS],
  events_raw:      [...EVENTS],
  audit_events:    [...AUDIT],
  dlq_events:      [...DLQ],
};

const TABLE_NAMES = Object.keys(STORES);

// ── SQL interpreter (minimal) ─────────────────────────────────────────────────

function executeMockSql(sql: string): QueryResult {
  const trimmed = sql.trim();
  const upper   = trimmed.toUpperCase();

  // ── information_schema columns (schema view) ──────────────────────────────
  const schemaMatch = trimmed.match(/FROM\s+information_schema\.columns\s+WHERE\s+(?:c\.)?table_name\s*=\s*'([^']+)'/i);
  if (schemaMatch) {
    const tbl  = schemaMatch[1]!;
    const cols = SCHEMAS[tbl] ?? [];
    return {
      columns:  ['column', 'type', 'nullable', 'default'],
      rows:     cols,
      rowCount: cols.length,
      duration: 2,
      type:     'select',
    };
  }

  // ── COUNT(*) ──────────────────────────────────────────────────────────────
  const countMatch = trimmed.match(/SELECT\s+COUNT\(\*\)\s+AS\s+(?:"?n"?|"?count"?)\s+FROM\s+"?(\w+)"?/i);
  if (countMatch) {
    const tbl   = countMatch[1]!;
    const store = STORES[tbl] ?? [];
    return {
      columns:  ['n'],
      rows:     [{ n: store.length }],
      rowCount: 1,
      duration: 1,
      type:     'select',
    };
  }

  // ── pg_stat / information_schema.tables (must come before generic SELECT) ──
  if (upper.includes('PG_STAT') || (upper.includes('INFORMATION_SCHEMA') && !schemaMatch)) {
    return {
      columns: ['table_name', 'row_count', 'total_size'],
      rows: TABLE_NAMES.map(t => ({
        table_name: t,
        row_count:  STORES[t]?.length ?? 0,
        total_size: `${Math.floor(Math.random() * 512 + 64)} kB`,
      })),
      rowCount: TABLE_NAMES.length,
      duration: 8,
      type: 'select',
    };
  }

  // ── SELECT from mock table ────────────────────────────────────────────────
  const selectMatch = trimmed.match(/FROM\s+"?(\w+)"?/i);
  if (upper.startsWith('SELECT') && selectMatch) {
    const tbl   = selectMatch[1]!;
    const store = STORES[tbl];

    if (!store) {
      return { columns: [], rows: [], rowCount: 0, duration: 1, type: 'select',
        error: `relation "${tbl}" does not exist (mock mode has: ${TABLE_NAMES.join(', ')})` };
    }

    // WHERE clause (basic equality only)
    let rows = [...store];
    const whereMatch = trimmed.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s+GROUP|$)/is);
    if (whereMatch) {
      const clause = whereMatch[1]!;
      const eqMatch = clause.match(/"?(\w+)"?\s*=\s*'([^']+)'/);
      if (eqMatch) {
        const [, col, val] = eqMatch;
        rows = rows.filter(r => String(r[col!] ?? '').toLowerCase() === val!.toLowerCase());
      }
    }

    // LIMIT
    const limitMatch = trimmed.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) rows = rows.slice(0, Number(limitMatch[1]));

    const columns = rows.length > 0 ? Object.keys(rows[0]!) : Object.keys(SCHEMAS[tbl]?.[0] ?? {});
    return { columns, rows, rowCount: rows.length, duration: 5, type: 'select' };
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  if (upper.startsWith('UPDATE')) {
    const tblMatch = trimmed.match(/UPDATE\s+"?(\w+)"?\s+SET\s+"?(\w+)"?\s*=\s*'([^']*)'/i);
    if (tblMatch) {
      const [, tbl, col, val] = tblMatch;
      const store = STORES[tbl!];
      if (store) {
        const pkMatch = trimmed.match(/WHERE\s+"?(\w+)"?\s*=\s*'([^']*)'/i);
        if (pkMatch) {
          const [, pkCol, pkVal] = pkMatch;
          const idx = store.findIndex(r => String(r[pkCol!]) === pkVal);
          if (idx >= 0) store[idx] = { ...store[idx]!, [col!]: val };
        }
      }
      return { columns: [], rows: [], rowCount: 1, duration: 3, type: 'dml', message: 'UPDATE 1' };
    }
    // status update (DLQ requeue)
    const statusMatch = trimmed.match(/UPDATE\s+"?(\w+)"?\s+SET\s+status\s*=\s*'([^']*)'/i);
    if (statusMatch) {
      const [, tbl, newStatus] = statusMatch;
      const store = STORES[tbl!];
      const pkMatch = trimmed.match(/WHERE\s+id\s*=\s*'?(\d+)'?/i);
      if (store && pkMatch) {
        const id = Number(pkMatch[1]);
        const idx = store.findIndex(r => Number(r['id']) === id);
        if (idx >= 0) store[idx] = { ...store[idx]!, status: newStatus };
      }
      return { columns: [], rows: [], rowCount: 1, duration: 2, type: 'dml', message: 'UPDATE 1' };
    }
    return { columns: [], rows: [], rowCount: 0, duration: 2, type: 'dml', message: 'UPDATE 0' };
  }

  // ── INSERT ────────────────────────────────────────────────────────────────
  if (upper.startsWith('INSERT')) {
    const tblMatch = trimmed.match(/INSERT\s+INTO\s+"?(\w+)"?/i);
    if (tblMatch) {
      const tbl   = tblMatch[1]!;
      const store = STORES[tbl];
      if (store) {
        const maxId = store.reduce((m, r) => Math.max(m, Number(r['id'] ?? 0)), 0);
        store.push({ id: maxId + 1, entity_id_hash: hash(`new_${maxId + 1}`), created_at_ms: nowMs() });
      }
      return { columns: [], rows: [], rowCount: 1, duration: 4, type: 'dml', message: 'INSERT 1' };
    }
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (upper.startsWith('DELETE')) {
    const tblMatch = trimmed.match(/DELETE\s+FROM\s+"?(\w+)"?/i);
    if (tblMatch) {
      const tbl   = tblMatch[1]!;
      const store = STORES[tbl];
      const pkMatch = trimmed.match(/WHERE\s+"?(\w+)"?\s*=\s*'([^']*)'/i);
      if (store && pkMatch) {
        const [, pkCol, pkVal] = pkMatch;
        const before = store.length;
        const filtered = store.filter(r => String(r[pkCol!]) !== pkVal);
        STORES[tbl] = filtered;
        const deleted = before - filtered.length;
        return { columns: [], rows: [], rowCount: deleted, duration: 3, type: 'dml', message: `DELETE ${deleted}` };
      }
      return { columns: [], rows: [], rowCount: 0, duration: 2, type: 'dml', message: 'DELETE 0' };
    }
  }

  // ── Unknown query — show friendly hint ────────────────────────────────────
  return {
    columns: ['result'],
    rows:    [{ result: `[mock] Query executed: ${trimmed.slice(0, 60)}` }],
    rowCount: 1,
    duration: 1,
    type: 'other',
  };
}

// ── Mock saved connection ─────────────────────────────────────────────────────

const MOCK_CONNECTION: DbConnection = {
  id:        'mock-demo-001',
  label:     'demo-local (mock)',
  type:      'postgresql',
  host:      'localhost',
  port:      5432,
  database:  'tfsdc_demo',
  username:  'demo',
  isDefault: true,
};

// ── MockConnectionService ─────────────────────────────────────────────────────

export function createMockConnectionService(): IConnectionService {
  return {
    loadConnections: () => [MOCK_CONNECTION],

    saveConnection: (_conn) => { /* no-op in mock */ },

    deleteConnection: (_id) => { /* no-op in mock */ },

    async login(_username, _password): Promise<LoginResult> {
      // Simulate network delay
      await new Promise(r => setTimeout(r, 600));
      // Accept any credentials in mock mode
      return { ok: true, token: 'mock-jwt-token', username: _username || 'demo', role: 'DBA' };
    },

    async testConnection(_conn): Promise<ConnectResult> {
      await new Promise(r => setTimeout(r, 800));
      return { error: null, tables: TABLE_NAMES };
    },

    async executeQuery(sql): Promise<QueryResult> {
      await new Promise(r => setTimeout(r, Math.random() * 80 + 20));
      return executeMockSql(sql);
    },

    async disconnect(): Promise<void> {
      await new Promise(r => setTimeout(r, 100));
    },

    async listDatabases(): Promise<string[]> {
      await new Promise(r => setTimeout(r, 300));
      return ['mock_db', 'tfsdc_demo', 'analytics', 'staging'];
    },

    async createDatabase(name: string) {
      await new Promise(r => setTimeout(r, 500));
      if (!name.trim()) return { error: 'Database name cannot be empty' };
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name.trim())) {
        return { error: 'Invalid name — use letters, numbers, underscores only' };
      }
      return {};
    },

    async dropDatabase(name: string) {
      await new Promise(r => setTimeout(r, 600));
      if (!name.trim()) return { error: 'Database name cannot be empty' };
      if (!/^[a-zA-Z_][a-zA-Z0-9_$\-]{0,63}$/.test(name.trim())) {
        return { error: 'Invalid database name — use letters, numbers, _, - or $ only' };
      }
      const PROTECTED = ['mock_db', 'tfsdc_demo'];
      if (PROTECTED.includes(name.trim())) {
        return { error: `Cannot drop protected database "${name}"` };
      }
      return {};
    },

    async streamAi(
      messages: AiMessage[],
      _opts: { model?: string },
      callbacks: AiStreamCallbacks,
    ): Promise<void> {
      const last = messages.filter(m => m.role === 'user').pop();
      const q    = last?.content?.toLowerCase() ?? '';

      callbacks.onIntent('query');
      await new Promise(r => setTimeout(r, 200));

      let reply: string;
      let sql: string | null = null;

      if (q.includes('user') || q.includes('사용자')) {
        reply = 'Here are the users in the database. The state_users table holds all active accounts with hashed email addresses for privacy.';
        sql   = 'SELECT * FROM "state_users" LIMIT 10;';
      } else if (q.includes('order') || q.includes('주문')) {
        reply = 'Orders are stored in state_orders. Each order links to a user via entity_id_hash and includes a total_cents field for the amount.';
        sql   = 'SELECT * FROM "state_orders" WHERE status = \'PENDING\' LIMIT 20;';
      } else if (q.includes('schema') || q.includes('스키마') || q.includes('table') || q.includes('테이블')) {
        reply = `The database has ${TABLE_NAMES.length} tables: ${TABLE_NAMES.join(', ')}. Use \\d <tablename> in the query editor to inspect column types.`;
      } else {
        reply = `[mock AI] I received your question: "${last?.content ?? ''}"\n\nIn real mode this connects to the beanllm sidecar at localhost:3200. For now I can tell you the mock database has ${TABLE_NAMES.length} tables with sample data ready to explore.`;
      }

      // Stream reply word by word
      const words = reply.split(' ');
      for (const word of words) {
        await new Promise(r => setTimeout(r, 30));
        callbacks.onChunk(word + ' ');
      }

      callbacks.onDone(reply, sql, 'beanllm-mock');
    },
  };
}
