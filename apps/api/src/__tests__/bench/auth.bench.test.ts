/**
 * auth.bench.test.ts
 *
 * autocannon 기반 부하 테스트 — Auth + User Management 엔드포인트.
 *
 * 서버를 port:0 으로 실제 기동 후 autocannon 이 HTTP 요청을 쏜다.
 * disableRateLimit: true 로 rate limiter 를 비활성화해 순수 처리량 측정.
 * pgPool.query 지연을 주입해 bcrypt 비용을 시뮬레이션한다.
 *   - login / user-create : bcrypt ≈ 200ms (gen_salt cost=12)
 *   - change-password     : 2× bcrypt ≈ 400ms
 *   - setup-status / GET /users : 즉시 응답
 */
import autocannon from 'autocannon';
import { createHmac } from 'crypto';
import type { AddressInfo } from 'net';
import * as fs from 'fs';
import * as path from 'path';

jest.setTimeout(300_000);

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@tfsdc/infrastructure', () => ({
  SchemaIntrospector: jest.fn().mockImplementation(() => ({
    getTables: jest.fn().mockResolvedValue([]),
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
  healthHandler: jest.fn().mockResolvedValue({ status: 'ok' }),
  listState: jest.fn().mockResolvedValue([]),
  getStateById: jest.fn().mockResolvedValue(null),
  updateStateField: jest.fn().mockResolvedValue({ updated: true }),
  deleteStateRow: jest.fn().mockResolvedValue({ deleted: true }),
  insertStateRow: jest.fn().mockResolvedValue({}),
  getStateSchema: jest.fn().mockResolvedValue({ fields: [] }),
  listAuditLogs: jest.fn().mockResolvedValue([]),
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

function makeJwtVerifier() {
  return {
    verify: jest.fn().mockImplementation(async (token: string) => {
      const [h, p, sig] = token.split('.') as [string, string, string];
      const expected = createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
      if (sig !== expected) throw new Error('bad sig');
      return JSON.parse(Buffer.from(p, 'base64url').toString());
    }),
  };
}

function makePgPool(delayMs = 0, rows: Record<string, unknown>[] = []) {
  return {
    query: jest.fn().mockImplementation(async (sql: string) => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      // change-password: SELECT = verify match, UPDATE = no rows
      if (typeof sql === 'string' && sql.trimStart().toUpperCase().startsWith('SELECT')) {
        return { rows: rows.length ? rows : [{ username: 'bench', role: 'DBA', cnt: 3 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
    createSession: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue({ status: 'ok' }),
    end: jest.fn().mockResolvedValue(undefined),
  };
}

function makeDeps(pgPool: ReturnType<typeof makePgPool>) {
  return {
    jwtVerifier: makeJwtVerifier(),
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
        getConnectionCount: jest.fn().mockReturnValue(0), register: jest.fn(),
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

// ── 공통 서버 기동 헬퍼 ───────────────────────────────────────────────────────

async function startServer(pgPool: ReturnType<typeof makePgPool>) {
  const app = await buildServer(makeDeps(pgPool));
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  return { app, url };
}

// ══════════════════════════════════════════════════════════════════════════════
describe('auth + user management — autocannon load test', () => {

  // ── 1. setup-status — 즉시 응답, no bcrypt ───────────────────────────────
  describe('1) GET /auth/setup-status — no bcrypt, instant DB', () => {
    let app: Awaited<ReturnType<typeof buildServer>>;
    let url: string;

    beforeAll(async () => {
      ({ app, url } = await startServer(makePgPool(0, [{ cnt: 3 }])));
    });
    afterAll(async () => { await app.close(); });

    it('c=50 — baseline throughput', async () => {
      const r = await bench({
        url: `${url}/api/v1/auth/setup-status`,
        connections: 50, duration: 5,
        title: 'GET /auth/setup-status (c=50)',
      });
      results.push(r);
      expect(r.non2xx).toBe(0);
      expect(r.requests.average).toBeGreaterThan(100);
    });
  });

  // ── 2. login — bcrypt 200ms 시뮬레이션 ────────────────────────────────────
  describe('2) POST /auth/login — bcrypt simulated 200ms/req', () => {
    let app5: Awaited<ReturnType<typeof buildServer>>;
    let url5: string;
    let app20: Awaited<ReturnType<typeof buildServer>>;
    let url20: string;
    let app50: Awaited<ReturnType<typeof buildServer>>;
    let url50: string;

    beforeAll(async () => {
      // 각 concurrency level 마다 독립 서버 (login rate limit은 이미 disabled)
      ([{ app: app5, url: url5 }, { app: app20, url: url20 }, { app: app50, url: url50 }] =
        await Promise.all([
          startServer(makePgPool(200, [{ username: 'admin', role: 'DBA' }])),
          startServer(makePgPool(200, [{ username: 'admin', role: 'DBA' }])),
          startServer(makePgPool(200, [{ username: 'admin', role: 'DBA' }])),
        ]));
    });
    afterAll(async () => {
      await Promise.all([app5.close(), app20.close(), app50.close()]);
    });

    it('c=5  — within Node.js event loop capacity', async () => {
      const r = await bench({
        url: `${url5}/api/v1/auth/login`,
        connections: 5, duration: 5,
        title: 'POST /auth/login (c=5,  bcrypt=200ms)',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password' }),
      });
      results.push(r);
      expect(r.non2xx).toBe(0);
    });

    it('c=20 — moderate pressure', async () => {
      const r = await bench({
        url: `${url20}/api/v1/auth/login`,
        connections: 20, duration: 5,
        title: 'POST /auth/login (c=20, bcrypt=200ms)',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password' }),
      });
      results.push(r);
      console.log(`  → p99=${r.latency.p99}ms at c=20`);
    });

    it('c=50 — saturation zone', async () => {
      const r = await bench({
        url: `${url50}/api/v1/auth/login`,
        connections: 50, duration: 5,
        title: 'POST /auth/login (c=50, bcrypt=200ms)',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password' }),
      });
      results.push(r);
      console.log(`  → p99=${r.latency.p99}ms at c=50 (saturation zone)`);
    });
  });

  // ── 3. change-password — 2× bcrypt ────────────────────────────────────────
  describe('3) POST /auth/change-password — 2× bcrypt (≈400ms)', () => {
    let app: Awaited<ReturnType<typeof buildServer>>;
    let url: string;
    const TOKEN = makeToken('bench', 'DBA');

    beforeAll(async () => {
      // SELECT (verify) → 200ms,  UPDATE (hash new) → 200ms = total 400ms per request
      ({ app, url } = await startServer(makePgPool(200, [{ username: 'bench' }])));
    });
    afterAll(async () => { await app.close(); });

    it('c=5 — sequential 2× bcrypt cost visible in p99', async () => {
      const r = await bench({
        url: `${url}/api/v1/auth/change-password`,
        connections: 5, duration: 5,
        title: 'POST /auth/change-password (c=5, 2×bcrypt)',
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ currentPassword: 'old', newPassword: 'newpassword1' }),
      });
      results.push(r);
      console.log(`  → avg latency: ${r.latency.average}ms (expected ≈400ms+)`);
      console.log(`  → ops/s: ${r.requests.average} (baseline login c=5 is ~25 ops/s)`);
    });
  });

  // ── 4. GET /users — DBA auth, no bcrypt ────────────────────────────────────
  describe('4) GET /api/v1/users — DBA auth, instant DB', () => {
    let app: Awaited<ReturnType<typeof buildServer>>;
    let url: string;
    const TOKEN = makeToken('admin', 'DBA');

    beforeAll(async () => {
      ({ app, url } = await startServer(makePgPool(0, [
        { username: 'admin',   role: 'DBA',     active: true, created_at: new Date().toISOString() },
        { username: 'analyst', role: 'ANALYST',  active: true, created_at: new Date().toISOString() },
      ])));
    });
    afterAll(async () => { await app.close(); });

    it('c=50 — list all users', async () => {
      const r = await bench({
        url: `${url}/api/v1/users`,
        connections: 50, duration: 5,
        title: 'GET /api/v1/users (c=50)',
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      results.push(r);
      expect(r.non2xx).toBe(0);
      expect(r.requests.average).toBeGreaterThan(50);
    });
  });

  // ── 5. POST /users — bcrypt hash per create ────────────────────────────────
  describe('5) POST /api/v1/users — bcrypt hash on each create', () => {
    let app: Awaited<ReturnType<typeof buildServer>>;
    let url: string;
    const TOKEN = makeToken('admin', 'DBA');

    beforeAll(async () => {
      ({ app, url } = await startServer(makePgPool(200, [])));
    });
    afterAll(async () => { await app.close(); });

    it('c=10 — bcrypt=200ms per create', async () => {
      const r = await bench({
        url: `${url}/api/v1/users`,
        connections: 10, duration: 5,
        title: 'POST /api/v1/users (c=10, bcrypt=200ms)',
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ username: 'newuser', password: 'password123', role: 'ANALYST' }),
      });
      results.push(r);
      console.log(`  → p99: ${r.latency.p99}ms`);
    });
  });

  // ── Save results ─────────────────────────────────────────────────────────────
  afterAll(() => {
    const outDir = path.resolve(__dirname, '../../../../../docs/bench-results');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'auth.json'),
      JSON.stringify({ name: 'auth', timestamp: new Date().toISOString(), results }, null, 2),
    );
    console.log('\n✓ Saved → docs/bench-results/auth.json');
  });
});
