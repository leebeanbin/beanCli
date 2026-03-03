/**
 * MySQL integration tests — real MySQL connection
 *
 * Tests the full credential-verify → list-databases → create-database flow.
 * Automatically skipped when MYSQL_URL is not set.
 *
 * Run with a live MySQL server:
 *   MYSQL_URL=mysql://root:nada5011@localhost:3306 pnpm --filter @tfsdc/cli test
 *
 * What is tested:
 *   1. Connect to MySQL server WITHOUT specifying a database (credential verify)
 *   2. listDatabases() returns system databases
 *   3. createDatabase() creates a new database
 *   4. New database appears in subsequent listDatabases() call
 *   5. executeQuery() works on the selected database (SELECT 1)
 *   6. Cleanup: DROP the test database
 *   7. Wrong password returns a clear error
 */

import { createCliConnectionService } from '../cliConnectionService';
import { initDbAdapters } from '@tfsdc/infrastructure';
import type { DbConnection } from '@tfsdc/tui';

const MYSQL_URL = process.env['MYSQL_URL'];
const describeIf = MYSQL_URL ? describe : describe.skip;

// ── Parse MYSQL_URL ────────────────────────────────────────────────────────────

function parseMysqlUrl(raw: string): DbConnection {
  const u = new URL(raw.startsWith('mysql://') ? raw : `mysql://${raw}`);
  return {
    id:       'test-mysql',
    label:    'test-mysql',
    type:     'mysql',
    host:     u.hostname || 'localhost',
    port:     u.port ? Number(u.port) : 3306,
    database: u.pathname.replace(/^\//, '') || undefined,
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
  };
}

beforeAll(() => { initDbAdapters(); });

// ── 1. Credential verification (no database) ──────────────────────────────────

describeIf('MySQL — credential verification (no database)', () => {
  it('testConnection() succeeds without specifying a database', async () => {
    const svc  = createCliConnectionService();
    const conn = parseMysqlUrl(MYSQL_URL!);
    const noDB = { ...conn, database: undefined };

    const result = await svc.testConnection(noDB);
    expect(result.error).toBeNull();
    console.log(`  ✓ Connected to MySQL at ${noDB.host}:${noDB.port} as ${noDB.username ?? 'root'}`);
    await svc.disconnect();
  }, 10_000);

  it('testConnection() fails with wrong password', async () => {
    const svc  = createCliConnectionService();
    const conn = { ...parseMysqlUrl(MYSQL_URL!), database: undefined, password: 'definitely-wrong-pw-xyz' };

    const result = await svc.testConnection(conn);
    expect(result.error).toBeTruthy();
    console.log(`  ✓ Wrong password correctly rejected: ${result.error}`);
    await svc.disconnect();
  }, 10_000);
});

// ── 2. listDatabases ──────────────────────────────────────────────────────────

describeIf('MySQL — listDatabases()', () => {
  let svc: ReturnType<typeof createCliConnectionService>;

  beforeAll(async () => {
    svc = createCliConnectionService();
    const conn = { ...parseMysqlUrl(MYSQL_URL!), database: undefined };
    await svc.testConnection(conn);
  });

  afterAll(async () => { await svc.disconnect(); });

  it('returns an array of strings', async () => {
    const dbs = await svc.listDatabases!();
    expect(Array.isArray(dbs)).toBe(true);
    dbs.forEach(db => expect(typeof db).toBe('string'));
  });

  it('always contains information_schema', async () => {
    const dbs = await svc.listDatabases!();
    expect(dbs).toContain('information_schema');
  });

  it('always contains mysql system database', async () => {
    const dbs = await svc.listDatabases!();
    expect(dbs).toContain('mysql');
  });

  it('returns at least 3 databases (system set)', async () => {
    const dbs = await svc.listDatabases!();
    expect(dbs.length).toBeGreaterThanOrEqual(3);
    console.log(`  Databases (${dbs.length}): ${dbs.join(', ')}`);
  });
});

// ── 3. createDatabase + verify ────────────────────────────────────────────────

describeIf('MySQL — createDatabase()', () => {
  const TEST_DB = `_bean_test_${Date.now()}`;
  let svc: ReturnType<typeof createCliConnectionService>;

  beforeAll(async () => {
    svc = createCliConnectionService();
    const conn = { ...parseMysqlUrl(MYSQL_URL!), database: undefined };
    await svc.testConnection(conn);
  });

  afterAll(async () => {
    // Cleanup: drop the test database regardless of test outcome
    try { await svc.executeQuery(`DROP DATABASE IF EXISTS \`${TEST_DB}\``); } catch { /* ignore */ }
    await svc.disconnect();
  });

  it('creates a new database without error', async () => {
    const result = await svc.createDatabase!(TEST_DB);
    expect(result.error).toBeUndefined();
    console.log(`  ✓ Created database: ${TEST_DB}`);
  }, 10_000);

  it('new database appears in listDatabases() after creation', async () => {
    const dbs = await svc.listDatabases!();
    expect(dbs).toContain(TEST_DB);
  });

  it('returns error when trying to create duplicate database', async () => {
    const result = await svc.createDatabase!(TEST_DB);
    expect(result.error).toBeTruthy();
    console.log(`  ✓ Duplicate correctly rejected: ${result.error}`);
  }, 10_000);
});

// ── 4. Full flow: connect → pick DB → query ───────────────────────────────────

describeIf('MySQL — full flow: verify → select DB → query', () => {
  const SYSTEM_DB = 'information_schema';
  let svc: ReturnType<typeof createCliConnectionService>;

  afterAll(async () => { await svc.disconnect(); });

  it('step 1: connects without database (credential verify)', async () => {
    svc = createCliConnectionService();
    const conn = { ...parseMysqlUrl(MYSQL_URL!), database: undefined };
    const result = await svc.testConnection(conn);
    expect(result.error).toBeNull();
  }, 10_000);

  it('step 2: lists databases', async () => {
    const dbs = await svc.listDatabases!();
    expect(dbs).toContain(SYSTEM_DB);
  });

  it('step 3: re-connects with selected database', async () => {
    const conn = { ...parseMysqlUrl(MYSQL_URL!), database: SYSTEM_DB };
    const result = await svc.testConnection(conn);
    expect(result.error).toBeNull();
    expect(Array.isArray(result.tables)).toBe(true);
    console.log(`  ✓ Connected to ${SYSTEM_DB}, tables: ${result.tables.slice(0, 4).join(', ')}...`);
  }, 10_000);

  it('step 4: SELECT 1 round-trip in <200ms', async () => {
    const t0 = Date.now();
    const result = await svc.executeQuery('SELECT 1 AS ping');
    const ms = Date.now() - t0;
    expect(result.error).toBeUndefined();
    expect(result.rows[0]?.['ping']).toBe(1);
    expect(ms).toBeLessThan(200);
    console.log(`  ✓ SELECT 1 in ${ms}ms`);
  }, 10_000);

  it('step 5: SHOW TABLES returns tables in selected DB', async () => {
    const result = await svc.executeQuery('SHOW TABLES');
    expect(result.error).toBeUndefined();
    expect(result.rows.length).toBeGreaterThan(0);
    console.log(`  ✓ ${result.rows.length} tables in ${SYSTEM_DB}`);
  }, 10_000);
});

// ── 5. executeQuery — error handling ─────────────────────────────────────────

describeIf('MySQL — executeQuery error handling', () => {
  let svc: ReturnType<typeof createCliConnectionService>;

  beforeAll(async () => {
    svc = createCliConnectionService();
    const conn = { ...parseMysqlUrl(MYSQL_URL!), database: 'information_schema' };
    await svc.testConnection(conn);
  });

  afterAll(async () => { await svc.disconnect(); });

  it('invalid SQL returns error (does not throw)', async () => {
    const result = await svc.executeQuery('THIS IS NOT SQL');
    expect(result.error).toBeTruthy();
    console.log(`  ✓ Invalid SQL error: ${result.error}`);
  }, 10_000);

  it('SELECT on non-existent table returns error', async () => {
    const result = await svc.executeQuery('SELECT * FROM no_such_table_xyz');
    expect(result.error).toBeTruthy();
  }, 10_000);

  it('executeQuery() before testConnection() returns not-connected error', async () => {
    const fresh = createCliConnectionService();
    const result = await fresh.executeQuery('SELECT 1');
    expect(result.error).toMatch(/not connected/i);
  });
});
