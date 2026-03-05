/**
 * data.bench.test.ts
 *
 * autocannon 기반 부하 테스트 — State / SQL / Schema / Monitoring / Audit / Changes.
 * 모든 DB 응답은 즉시 반환(mock)하여 순수 Fastify 라우팅 처리량을 측정한다.
 *
 * - disableRateLimit: true   → rate limiter 비활성화
 * - disableRequestLogging: true → 로그 버퍼링 방지 (OOM 예방)
 */
import autocannon from 'autocannon';
import { createHmac } from 'crypto';
import type { AddressInfo } from 'net';
import * as fs from 'fs';
import * as path from 'path';

jest.setTimeout(300_000);

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@tfsdc/infrastructure', () => ({
  SchemaIntrospector: jest.fn().mockImplementation(() => ({
    getTables: jest.fn().mockResolvedValue([
      { name: 'state_users', estimatedRows: 1000, schema: 'public' },
      { name: 'state_orders', estimatedRows: 5000, schema: 'public' },
    ]),
    getIndexes: jest.fn().mockResolvedValue([]),
    getIndexUsageStats: jest.fn().mockResolvedValue([]),
    getSchemaContext: jest.fn().mockResolvedValue(''),
  })),
  initDbAdapters: jest.fn(),
  createAdapter: jest.fn(),
}));

jest.mock('@tfsdc/application', () => ({
  authenticate: jest.fn().mockResolvedValue({
    success: true,
    context: { actor: 'bench', role: 'DBA' },
  }),
  checkRole: jest.fn().mockResolvedValue({ allowed: true }),
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
  healthHandler: jest.fn().mockResolvedValue({ status: 'ok', db: { status: 'ok' }, uptime: 9999 }),
  listState: jest.fn().mockResolvedValue([
    { id: 1, name: 'Alice', email: 'alice@test.com' },
    { id: 2, name: 'Bob',   email: 'bob@test.com' },
  ]),
  getStateById: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
  updateStateField: jest.fn().mockResolvedValue({ updated: true }),
  deleteStateRow: jest.fn().mockResolvedValue({ deleted: true }),
  insertStateRow: jest.fn().mockResolvedValue({ id: 99 }),
  getStateSchema: jest.fn().mockResolvedValue({ fields: [{ name: 'id', type: 'int' }] }),
  listAuditLogs: jest.fn().mockResolvedValue([
    { id: 1, actor: 'admin', action: 'SELECT', created_at: new Date().toISOString() },
  ]),
  isValidStateTable: jest.fn().mockReturnValue(true),
}));

import { buildServer } from '../../server.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SECRET = 'test-secret-32-bytes-padding!!!!';

function makeToken(sub: string, role: string): string {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 7200 })).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

function makePgPool() {
  return {
    query: jest.fn().mockResolvedValue({
      rows: [{ id: 1, n: 'test', total_events: 100, entity_type: 'user', latest_event_time_ms: Date.now() }],
      rowCount: 1,
    }),
    createSession: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue({ status: 'ok' }),
    end: jest.fn().mockResolvedValue(undefined),
  };
}

function makeDeps(pgPool: ReturnType<typeof makePgPool>) {
  return {
    jwtVerifier: {
      verify: jest.fn().mockImplementation(async (token: string) => {
        const [h, p, sig] = token.split('.') as [string, string, string];
        const expected = createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
        if (sig !== expected) throw new Error('bad sig');
        return JSON.parse(Buffer.from(p, 'base64url').toString());
      }),
    },
    jwtSign: (sub: string, role: string) => makeToken(sub, role),
    auditWriter: { write: jest.fn().mockResolvedValue(undefined) },
    dbSessionFactory: jest.fn(() => ({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    })),
    healthDeps: {
      dbCheck: jest.fn().mockResolvedValue({ status: 'ok' }),
      kafkaCheck: jest.fn().mockResolvedValue({ status: 'ok', consumerLag: 0 }),
      wsManager: {
        broadcast: jest.fn(), handleMessage: jest.fn(),
        registerSse: jest.fn(), unregisterSse: jest.fn(),
        getConnectionCount: jest.fn().mockReturnValue(4), register: jest.fn(),
      } as unknown as import('@tfsdc/application').WsConnectionManager,
      startTime: Date.now(),
    },
    changeHandler: {
      create: jest.fn(), list: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null), submit: jest.fn(),
      execute: jest.fn(), revert: jest.fn(),
    },
    approvalHandler: {
      listPending: jest.fn().mockResolvedValue([]),
      approve: jest.fn(), reject: jest.fn(),
    },
    pgPool: pgPool as unknown as import('@tfsdc/infrastructure').PgPool,
    disableRateLimit: true,
    disableRequestLogging: true,
  };
}

// ── autocannon runner ─────────────────────────────────────────────────────────

type CannonResult = autocannon.Result;
const results: CannonResult[] = [];

async function bench(opts: autocannon.Options): Promise<CannonResult> {
  return new Promise((resolve, reject) => {
    const instance = autocannon(opts, (err, result) => {
      if (err) return reject(err);
      console.log(autocannon.printResult(result));
      resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: false });
  });
}

// ── Shared server (single instance for all tests) ────────────────────────────

let app: Awaited<ReturnType<typeof buildServer>>;
let baseUrl: string;
const DBA_TOKEN = makeToken('bench', 'DBA');
const C = 30;   // max concurrency — keep low to avoid OOM
const D = 5;    // duration seconds

beforeAll(async () => {
  jest.clearAllMocks();
  app = await buildServer(makeDeps(makePgPool()));
  await app.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  console.log(`\n  Fastify bench server at ${baseUrl}  (c=${C}, d=${D}s per scenario)`);
});

afterAll(async () => {
  await app.close();
  const outDir = path.resolve(__dirname, '../../../../../docs/bench-results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'data.json'),
    JSON.stringify({ name: 'data', timestamp: new Date().toISOString(), results }, null, 2),
  );
  console.log('\n✓ Saved → docs/bench-results/data.json');
});

// ══════════════════════════════════════════════════════════════════════════════
describe('data + ops endpoints — autocannon load test', () => {

  it('GET /health — baseline, no auth, no DB', async () => {
    const r = await bench({
      url: `${baseUrl}/health`,
      connections: C, duration: D, title: `GET /health (c=${C})`,
    });
    results.push(r);
    expect(r.non2xx).toBe(0);
    expect(r.requests.average).toBeGreaterThan(500);
  });

  it('GET /api/v1/auth/setup-status — 1 DB query, no auth', async () => {
    const r = await bench({
      url: `${baseUrl}/api/v1/auth/setup-status`,
      connections: C, duration: D, title: `GET /auth/setup-status (c=${C})`,
    });
    results.push(r);
    expect(r.non2xx).toBe(0);
  });

  it('GET /api/v1/schema/tables — SchemaIntrospector, no auth', async () => {
    const r = await bench({
      url: `${baseUrl}/api/v1/schema/tables`,
      connections: C, duration: D, title: `GET /schema/tables (c=${C})`,
    });
    results.push(r);
    expect(r.non2xx).toBe(0);
  });

  it('GET /api/v1/schema/indexes — no auth', async () => {
    const r = await bench({
      url: `${baseUrl}/api/v1/schema/indexes`,
      connections: C, duration: D, title: `GET /schema/indexes (c=${C})`,
    });
    results.push(r);
    expect(r.non2xx).toBe(0);
  });

  it('GET /api/v1/state/state_users — list rows, no auth', async () => {
    const r = await bench({
      url: `${baseUrl}/api/v1/state/state_users`,
      connections: C, duration: D, title: `GET /state/state_users (c=${C})`,
    });
    results.push(r);
    expect(r.non2xx).toBe(0);
  });

  it('GET /api/v1/state/state_users/1 — single row by id', async () => {
    const r = await bench({
      url: `${baseUrl}/api/v1/state/state_users/1`,
      connections: C, duration: D, title: `GET /state/state_users/:id (c=${C})`,
    });
    results.push(r);
    expect(r.non2xx).toBe(0);
  });

  it('POST /api/v1/sql/execute — SELECT, DBA auth', async () => {
    const r = await bench({
      url: `${baseUrl}/api/v1/sql/execute`,
      connections: C, duration: D, title: `POST /sql/execute SELECT (c=${C})`,
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${DBA_TOKEN}` },
      body: JSON.stringify({ sql: 'SELECT id, name FROM state_users LIMIT 20' }),
    });
    results.push(r);
    expect(r.non2xx).toBe(0);
  });

  it('GET /api/v1/audit — DBA auth', async () => {
    const r = await bench({
      url: `${baseUrl}/api/v1/audit`,
      connections: C, duration: D, title: `GET /audit (c=${C})`,
      headers: { authorization: `Bearer ${DBA_TOKEN}` },
    });
    results.push(r);
    expect(r.non2xx).toBe(0);
  });

  it('GET /api/v1/monitoring/stream-stats — live stats, no auth', async () => {
    const r = await bench({
      url: `${baseUrl}/api/v1/monitoring/stream-stats`,
      connections: C, duration: D, title: `GET /monitoring/stream-stats (c=${C})`,
    });
    results.push(r);
    expect(r.non2xx).toBe(0);
  });

  it('GET /api/v1/changes — list changes, no auth', async () => {
    const r = await bench({
      url: `${baseUrl}/api/v1/changes`,
      connections: C, duration: D, title: `GET /changes (c=${C})`,
    });
    results.push(r);
    expect(r.non2xx).toBe(0);
  });

  it('GET /api/v1/approvals/pending — DBA auth', async () => {
    const r = await bench({
      url: `${baseUrl}/api/v1/approvals/pending`,
      connections: C, duration: D, title: `GET /approvals/pending (c=${C})`,
      headers: { authorization: `Bearer ${DBA_TOKEN}` },
    });
    results.push(r);
    expect(r.non2xx).toBe(0);
  });
});
