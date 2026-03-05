/**
 * apps/api/src/__tests__/server.test.ts
 *
 * Fastify inject E2E tests — all @tfsdc/* packages are mocked so no real
 * DB or Kafka is required.  Tests exercise: routing, auth, RBAC, rate-limit.
 */
import { createHmac } from 'crypto';

// ── Mock @tfsdc/infrastructure (no real DB connections) ────────────────────
jest.mock('@tfsdc/infrastructure', () => ({
  SchemaIntrospector: jest.fn().mockImplementation(() => ({
    getTables: jest
      .fn()
      .mockResolvedValue([{ name: 'state_users', estimatedRows: 0, schema: 'public' }]),
    getIndexes: jest.fn().mockResolvedValue([]),
    getIndexUsageStats: jest.fn().mockResolvedValue([]),
    getSchemaContext: jest.fn().mockResolvedValue(''),
  })),
  initDbAdapters: jest.fn(),
  createAdapter: jest.fn(),
}));

// ── Mock @tfsdc/application (no real use-case execution) ──────────────────
jest.mock('@tfsdc/application', () => ({
  authenticate: jest.fn(),
  checkRole: jest.fn(),
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
  healthHandler: jest.fn().mockResolvedValue({
    status: 'ok',
    db: { status: 'ok' },
    kafka: { status: 'ok', consumerLag: 0 },
    websocket: { connections: 0 },
    uptime: 100,
  }),
  listState: jest.fn().mockResolvedValue([]),
  getStateById: jest.fn().mockResolvedValue(null),
  updateStateField: jest.fn().mockResolvedValue({ updated: false }),
  deleteStateRow: jest.fn().mockResolvedValue({ deleted: false }),
  insertStateRow: jest.fn().mockResolvedValue({}),
  getStateSchema: jest.fn().mockResolvedValue({ fields: [] }),
  listAuditLogs: jest.fn().mockResolvedValue([]),
  isValidStateTable: jest.fn().mockReturnValue(true),
}));

// ── Defer import until after mocks are registered ─────────────────────────
import { buildServer } from '../server.js';
import { authenticate, checkRole, healthHandler, listAuditLogs } from '@tfsdc/application';

const mockAuthenticate = authenticate as jest.Mock;
const mockCheckRole = checkRole as jest.Mock;
const mockHealthHandler = healthHandler as jest.Mock;
const _mockListAuditLogs = listAuditLogs as jest.Mock;

// ── JWT helper (matches the token format used in server/index.ts) ──────────
const TEST_SECRET = 'test-secret-32-bytes-padding!!!!';

function makeToken(sub: string, role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url');
  const sig = createHmac('sha256', TEST_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

// ── Mock deps factory ──────────────────────────────────────────────────────
function makeMockPgPool() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    createSession: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue({ status: 'ok' }),
    end: jest.fn().mockResolvedValue(undefined),
  };
}

function makeDeps(pgPool: ReturnType<typeof makeMockPgPool>) {
  return {
    jwtVerifier: {
      verify: jest.fn().mockImplementation(async (token: string) => {
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error('Invalid token format');
        const [h, p, sig] = parts as [string, string, string];
        const expected = createHmac('sha256', TEST_SECRET).update(`${h}.${p}`).digest('base64url');
        if (sig !== expected) throw new Error('Invalid signature');
        const { sub, role, exp } = JSON.parse(Buffer.from(p, 'base64url').toString());
        if (exp && exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
        return { sub, role };
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
        broadcast: jest.fn(),
        handleMessage: jest.fn(),
        registerSse: jest.fn(),
        unregisterSse: jest.fn(),
        getConnectionCount: jest.fn().mockReturnValue(0),
        register: jest.fn(),
      } as unknown as import('@tfsdc/application').WsConnectionManager,
      startTime: Date.now(),
    },
    changeHandler: {
      create: jest.fn(),
      list: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
      submit: jest.fn(),
      execute: jest.fn(),
      revert: jest.fn(),
    },
    approvalHandler: {
      listPending: jest.fn().mockResolvedValue([]),
      approve: jest.fn(),
      reject: jest.fn(),
    },
    pgPool: pgPool as unknown as import('@tfsdc/infrastructure').PgPool,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Main route tests — fresh server per test
// ══════════════════════════════════════════════════════════════════════════
describe('server routes', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let pgPool: ReturnType<typeof makeMockPgPool>;

  beforeEach(async () => {
    jest.clearAllMocks();
    pgPool = makeMockPgPool();
    app = await buildServer(makeDeps(pgPool));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── 1. GET /health → 200 ────────────────────────────────────────────────
  it('GET /health returns 200', async () => {
    mockHealthHandler.mockResolvedValueOnce({ status: 'ok' });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  // ── 2. POST /auth/login — valid credentials → 200 + token ───────────────
  it('POST /api/v1/auth/login with valid credentials returns 200 and token', async () => {
    pgPool.query.mockResolvedValueOnce({
      rows: [{ username: 'admin', role: 'DBA' }],
      rowCount: 1,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'secret' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ token: string; username: string; role: string }>();
    expect(body.token).toBeDefined();
    expect(body.username).toBe('admin');
    expect(body.role).toBe('DBA');
  });

  // ── 3. POST /auth/login — wrong credentials → 401 ───────────────────────
  it('POST /api/v1/auth/login with invalid credentials returns 401', async () => {
    pgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'wrong' },
    });

    expect(res.statusCode).toBe(401);
  });

  // ── 4. GET /api/v1/audit — no auth → 401 ────────────────────────────────
  it('GET /api/v1/audit without Authorization header returns 401', async () => {
    mockAuthenticate.mockResolvedValueOnce({
      success: false,
      status: 401,
      error: 'Unauthorized',
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/audit' });
    expect(res.statusCode).toBe(401);
  });

  // ── 5. GET /api/v1/schema/tables — public endpoint → 200 ────────────────
  it('GET /api/v1/schema/tables returns 200 (public endpoint)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/schema/tables' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: unknown[] }>();
    expect(Array.isArray(body.items)).toBe(true);
  });

  // ── 6. POST /sql/execute — ANALYST role → 403 ───────────────────────────
  it('POST /api/v1/sql/execute with ANALYST role returns 403', async () => {
    mockAuthenticate.mockResolvedValueOnce({
      success: true,
      context: { actor: 'analyst', role: 'ANALYST' },
    });
    mockCheckRole.mockResolvedValueOnce({
      allowed: false,
      status: 403,
      error: 'Access denied for role ANALYST',
    });

    const token = makeToken('analyst', 'ANALYST');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/sql/execute',
      headers: { authorization: `Bearer ${token}` },
      payload: { sql: 'DELETE FROM state_users' },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Auth setup + User management — fresh server per test
// ══════════════════════════════════════════════════════════════════════════
describe('auth setup + user management', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let pgPool: ReturnType<typeof makeMockPgPool>;

  beforeEach(async () => {
    jest.clearAllMocks();
    pgPool = makeMockPgPool();
    app = await buildServer(makeDeps(pgPool));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  /** Mock a DBA-authenticated request (authenticate + checkRole) */
  function mockDbaAuth(actor = 'admin') {
    mockAuthenticate.mockResolvedValueOnce({
      success: true,
      context: { actor, role: 'DBA' },
    });
    mockCheckRole.mockResolvedValueOnce({ allowed: true });
  }

  // ── GET /api/v1/auth/setup-status ──────────────────────────────────────

  it('returns needsSetup: true when cli_users is empty', async () => {
    pgPool.query.mockResolvedValueOnce({ rows: [{ cnt: 0 }], rowCount: 1 });

    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/setup-status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ needsSetup: true });
  });

  it('returns needsSetup: false when users already exist', async () => {
    pgPool.query.mockResolvedValueOnce({ rows: [{ cnt: 3 }], rowCount: 1 });

    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/setup-status' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ needsSetup: false });
  });

  // ── POST /api/v1/auth/setup ─────────────────────────────────────────────

  it('setup creates first DBA and returns a JWT token when table is empty', async () => {
    pgPool.query.mockResolvedValueOnce({ rows: [{ cnt: 0 }], rowCount: 1 }); // count
    pgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });            // insert

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup',
      payload: { username: 'superadmin', password: 'securepass1' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ token: string; username: string; role: string }>();
    expect(body.token).toBeDefined();
    expect(body.username).toBe('superadmin');
    expect(body.role).toBe('DBA');
  });

  it('setup returns 403 when users already exist', async () => {
    pgPool.query.mockResolvedValueOnce({ rows: [{ cnt: 1 }], rowCount: 1 }); // count > 0

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup',
      payload: { username: 'hacker', password: 'password123' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('setup returns 400 when username is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup',
      payload: { password: 'password123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('setup returns 400 when password is shorter than 8 characters', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup',
      payload: { username: 'admin', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── GET /api/v1/users ───────────────────────────────────────────────────

  it('GET /users returns 401 without Authorization header', async () => {
    mockAuthenticate.mockResolvedValueOnce({ success: false, status: 401, error: 'Unauthorized' });

    const res = await app.inject({ method: 'GET', url: '/api/v1/users' });

    expect(res.statusCode).toBe(401);
  });

  it('GET /users returns user list for DBA', async () => {
    mockDbaAuth();
    pgPool.query.mockResolvedValueOnce({
      rows: [
        { username: 'admin',   role: 'DBA',     active: true, created_at: '2026-03-01T00:00:00Z' },
        { username: 'analyst', role: 'ANALYST',  active: true, created_at: '2026-03-01T00:00:00Z' },
      ],
      rowCount: 2,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { username: string }[] }>();
    expect(body.items).toHaveLength(2);
    expect(body.items[0]!.username).toBe('admin');
  });

  // ── POST /api/v1/users ──────────────────────────────────────────────────

  it('POST /users creates a new user and returns 201', async () => {
    mockDbaAuth();
    pgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
      payload: { username: 'newuser', password: 'password123', role: 'ANALYST' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ username: string; role: string; active: boolean }>();
    expect(body.username).toBe('newuser');
    expect(body.role).toBe('ANALYST');
    expect(body.active).toBe(true);
  });

  it('POST /users returns 409 when username already exists (PG 23505)', async () => {
    mockDbaAuth();
    const pgError = Object.assign(new Error('duplicate key value'), { code: '23505' });
    pgPool.query.mockRejectedValueOnce(pgError);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
      payload: { username: 'admin', password: 'password123', role: 'ANALYST' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('POST /users returns 400 for an unrecognised role', async () => {
    mockDbaAuth();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
      payload: { username: 'newuser', password: 'password123', role: 'SUPERUSER' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /users returns 400 when password is too short', async () => {
    mockDbaAuth();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
      payload: { username: 'newuser', password: 'short', role: 'ANALYST' },
    });

    expect(res.statusCode).toBe(400);
  });

  // ── PATCH /api/v1/users/:username ───────────────────────────────────────

  it('PATCH /users/:username returns 400 when actor tries to modify own account', async () => {
    mockAuthenticate.mockResolvedValueOnce({
      success: true,
      context: { actor: 'admin', role: 'DBA' },
    });
    mockCheckRole.mockResolvedValueOnce({ allowed: true });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/admin',   // same as actor
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
      payload: { role: 'ANALYST' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/own role or active status/);
  });

  it('PATCH /users/:username changes role from ANALYST to MANAGER', async () => {
    mockDbaAuth('admin');
    // guard: remaining DBAs = 1 (safe)
    pgPool.query.mockResolvedValueOnce({ rows: [{ cnt: 1 }],              rowCount: 1 });
    // guard: target current role = ANALYST (not DBA, no extra protection)
    pgPool.query.mockResolvedValueOnce({ rows: [{ role: 'ANALYST' }],    rowCount: 1 });
    // UPDATE
    pgPool.query.mockResolvedValueOnce({
      rows: [{ username: 'analyst', role: 'MANAGER', active: true }],
      rowCount: 1,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/analyst',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
      payload: { role: 'MANAGER' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ role: string }>().role).toBe('MANAGER');
  });

  it('PATCH /users/:username returns 400 when demoting the last active DBA', async () => {
    mockDbaAuth('admin');
    // guard: 0 other active DBAs remaining
    pgPool.query.mockResolvedValueOnce({ rows: [{ cnt: 0 }],           rowCount: 1 });
    // guard: target is DBA
    pgPool.query.mockResolvedValueOnce({ rows: [{ role: 'DBA' }],      rowCount: 1 });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/other-admin',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
      payload: { role: 'ANALYST' },   // demoting DBA → ANALYST with 0 other DBAs
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/last active DBA/);
  });

  // ── DELETE /api/v1/users/:username ──────────────────────────────────────

  it('DELETE /users/:username returns 400 when actor tries to deactivate own account', async () => {
    mockAuthenticate.mockResolvedValueOnce({
      success: true,
      context: { actor: 'admin', role: 'DBA' },
    });
    mockCheckRole.mockResolvedValueOnce({ allowed: true });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/admin',   // same as actor
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/own account/);
  });

  it('DELETE /users/:username soft-deactivates an ANALYST user', async () => {
    mockDbaAuth('admin');
    // target role → ANALYST (no DBA count check needed)
    pgPool.query.mockResolvedValueOnce({ rows: [{ role: 'ANALYST' }], rowCount: 1 });
    // UPDATE active = false
    pgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/analyst',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ success: boolean; username: string; active: boolean }>();
    expect(body.success).toBe(true);
    expect(body.username).toBe('analyst');
    expect(body.active).toBe(false);
  });

  it('DELETE /users/:username returns 400 when deactivating the last active DBA', async () => {
    mockDbaAuth('admin');
    // target role → DBA
    pgPool.query.mockResolvedValueOnce({ rows: [{ role: 'DBA' }], rowCount: 1 });
    // 0 other active DBAs
    pgPool.query.mockResolvedValueOnce({ rows: [{ cnt: 0 }], rowCount: 1 });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/other-admin',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/last active DBA/);
  });

  it('DELETE /users/:username returns 404 when user does not exist', async () => {
    mockDbaAuth('admin');
    // target not found
    pgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/ghost',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
    });

    expect(res.statusCode).toBe(404);
  });

  // ── POST /api/v1/auth/change-password ───────────────────────────────────

  it('change-password succeeds with correct current password', async () => {
    mockAuthenticate.mockResolvedValueOnce({
      success: true,
      context: { actor: 'admin', role: 'DBA' },
    });
    mockCheckRole.mockResolvedValueOnce({ allowed: true });
    // verify current password → match
    pgPool.query.mockResolvedValueOnce({ rows: [{ username: 'admin' }], rowCount: 1 });
    // UPDATE hash
    pgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
      payload: { currentPassword: 'oldpassword', newPassword: 'newpassword1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ success: boolean }>().success).toBe(true);
  });

  it('change-password returns 401 when current password is wrong', async () => {
    mockAuthenticate.mockResolvedValueOnce({
      success: true,
      context: { actor: 'admin', role: 'DBA' },
    });
    mockCheckRole.mockResolvedValueOnce({ allowed: true });
    // verify → no match
    pgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
      payload: { currentPassword: 'wrongpassword', newPassword: 'newpassword1' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('change-password returns 400 when newPassword is shorter than 8 characters', async () => {
    mockAuthenticate.mockResolvedValueOnce({
      success: true,
      context: { actor: 'admin', role: 'DBA' },
    });
    mockCheckRole.mockResolvedValueOnce({ allowed: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${makeToken('admin', 'DBA')}` },
      payload: { currentPassword: 'oldpassword', newPassword: 'short' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Rate-limit test — single server for all 61 requests
// ══════════════════════════════════════════════════════════════════════════
describe('rate limiting', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    jest.clearAllMocks();
    const pgPool = makeMockPgPool();
    app = await buildServer(makeDeps(pgPool));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 after exceeding the global rate limit of 60 req/min', async () => {
    // First 60 requests must succeed
    for (let i = 0; i < 60; i++) {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    }
    // 61st request in the same 1-minute window is rate-limited
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(429);
  });
});
