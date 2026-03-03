/**
 * Integration tests — DB connectivity (no TUI dependency)
 *
 * Tests two levels:
 *   1. Adapter level  — createAdapter() → PgAdapter directly
 *   2. Service level  — createCliConnectionService() → full flow
 *      including listDatabases() and createDatabase()
 *
 * Automatically skipped when DATABASE_URL is not set.
 * Run with a live DB:
 *   pnpm db:test-conn
 *   # or
 *   DATABASE_URL=postgres://... pnpm --filter @tfsdc/cli test
 */

import { getEnvConnection } from '../connections';
import { createCliConnectionService } from '../cliConnectionService';
import { initDbAdapters, createAdapter } from '@tfsdc/infrastructure';

const DB_URL = process.env['DATABASE_URL'];
const describeIf = DB_URL ? describe : describe.skip;

beforeAll(() => { initDbAdapters(); });

// ── PART 1: Adapter-level tests ────────────────────────────────────────────────

describeIf('Adapter — raw PgAdapter via DATABASE_URL', () => {
  it('getEnvConnection() parses DATABASE_URL into a valid connection object', () => {
    const conn = getEnvConnection();
    expect(conn).not.toBeNull();
    expect(['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis']).toContain(conn!.type);
    expect(conn!.host).toBeTruthy();
    console.log(`  Parsed → type=${conn!.type}  host=${conn!.host}:${conn!.port}  db=${conn!.database}  user=${conn!.username}`);
  });

  it('createAdapter() + listTables() connects and lists tables', async () => {
    const conn = getEnvConnection()!;
    const adapter = createAdapter({
      type:     conn.type,
      host:     conn.host,
      port:     conn.port,
      database: conn.database,
      username: conn.username,
      password: conn.password,
    });

    const tables = await adapter.listTables();
    expect(Array.isArray(tables)).toBe(true);
    expect(tables.length).toBeGreaterThan(0);
    console.log(`  Tables (${tables.length}): ${tables.slice(0, 6).join(', ')}${tables.length > 6 ? '…' : ''}`);
    await adapter.close();
  }, 15_000);

  it('queryRows("SELECT 1") returns a result row with <200ms latency', async () => {
    const conn    = getEnvConnection()!;
    const adapter = createAdapter({
      type:     conn.type,
      host:     conn.host,
      port:     conn.port,
      database: conn.database,
      username: conn.username,
      password: conn.password,
    });

    const t0 = Date.now();
    const rows = await adapter.queryRows('SELECT 1 AS ping, version() AS ver, current_database() AS db');
    const ms   = Date.now() - t0;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.['ping']).toBe(1);
    expect(typeof rows[0]?.['ver']).toBe('string');
    expect(ms).toBeLessThan(200);
    console.log(`  ✓ SELECT 1 in ${ms}ms — db="${String(rows[0]?.['db'])}" server="${String(rows[0]?.['ver']).split(',')[0]}"`);
    await adapter.close();
  }, 15_000);

  it('queryRows on information_schema.tables returns table_name column', async () => {
    const conn    = getEnvConnection()!;
    const adapter = createAdapter({
      type:     conn.type,
      host:     conn.host,
      port:     conn.port,
      database: conn.database,
      username: conn.username,
      password: conn.password,
    });

    const rows = await adapter.queryRows(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name LIMIT 5`,
    );
    expect(Array.isArray(rows)).toBe(true);
    expect(Object.keys(rows[0] ?? {})).toContain('table_name');
    await adapter.close();
  }, 15_000);

  it('queryRows rejects on invalid SQL', async () => {
    const conn    = getEnvConnection()!;
    const adapter = createAdapter({
      type:     conn.type,
      host:     conn.host,
      port:     conn.port,
      database: conn.database,
      username: conn.username,
      password: conn.password,
    });

    await expect(adapter.queryRows('THIS IS NOT SQL')).rejects.toThrow();
    await adapter.close();
  }, 15_000);
});

// ── PART 2: Service-level tests ────────────────────────────────────────────────

describeIf('Service — createCliConnectionService() full flow', () => {
  let svc: ReturnType<typeof createCliConnectionService>;

  beforeAll(async () => {
    svc = createCliConnectionService();
    const conn = getEnvConnection()!;
    // Connect with the full DATABASE_URL (includes database)
    const result = await svc.testConnection(conn);
    expect(result.error).toBeNull();
  });

  afterAll(async () => { await svc.disconnect(); });

  it('testConnection() returns non-empty table list', async () => {
    const conn = getEnvConnection()!;
    const fresh = createCliConnectionService();
    const result = await fresh.testConnection(conn);
    expect(result.error).toBeNull();
    expect(result.tables.length).toBeGreaterThan(0);
    await fresh.disconnect();
  }, 15_000);

  it('executeQuery() SELECT 1 works after testConnection()', async () => {
    const result = await svc.executeQuery('SELECT 1 AS ping');
    expect(result.error).toBeUndefined();
    expect(result.rows[0]?.['ping']).toBe(1);
  }, 15_000);

  it('executeQuery() before testConnection() returns not-connected error', async () => {
    const fresh = createCliConnectionService();
    const result = await fresh.executeQuery('SELECT 1');
    expect(result.error).toMatch(/not connected/i);
  });

  it('executeQuery() returns error (not throw) on invalid SQL', async () => {
    const result = await svc.executeQuery('THIS IS NOT SQL');
    expect(result.error).toBeTruthy();
  }, 15_000);
});

// ── PART 3: listDatabases (service level) ─────────────────────────────────────

describeIf('Service — listDatabases()', () => {
  let svc: ReturnType<typeof createCliConnectionService>;

  beforeAll(async () => {
    svc = createCliConnectionService();
    // Connect to 'postgres' default DB so we can list all databases
    const conn = getEnvConnection()!;
    const connForListing = { ...conn, database: 'postgres' };
    await svc.testConnection(connForListing);
  });

  afterAll(async () => { await svc.disconnect(); });

  it('returns an array of strings', async () => {
    const dbs = await svc.listDatabases!();
    expect(Array.isArray(dbs)).toBe(true);
    dbs.forEach(db => expect(typeof db).toBe('string'));
  });

  it('returns at least one database', async () => {
    const dbs = await svc.listDatabases!();
    expect(dbs.length).toBeGreaterThan(0);
    console.log(`  Databases (${dbs.length}): ${dbs.join(', ')}`);
  });

  it('includes "postgres" system database', async () => {
    const dbs = await svc.listDatabases!();
    expect(dbs).toContain('postgres');
  });

  it('includes the database from DATABASE_URL', async () => {
    const conn = getEnvConnection()!;
    if (!conn.database) return;  // skip if no database in URL
    const dbs = await svc.listDatabases!();
    expect(dbs).toContain(conn.database);
    console.log(`  ✓ Found ${conn.database} in database list`);
  });

  it('returns empty array when not connected', async () => {
    const fresh = createCliConnectionService();
    const dbs = await fresh.listDatabases!();
    expect(Array.isArray(dbs)).toBe(true);
    expect(dbs).toHaveLength(0);
  });
});

// ── PART 4: createDatabase (service level) ────────────────────────────────────

describeIf('Service — createDatabase()', () => {
  const TEST_DB = `_bean_pg_test_${Date.now()}`;
  let svc: ReturnType<typeof createCliConnectionService>;

  beforeAll(async () => {
    svc = createCliConnectionService();
    const conn = getEnvConnection()!;
    // Connect to postgres default DB to run CREATE DATABASE
    await svc.testConnection({ ...conn, database: 'postgres' });
  });

  afterAll(async () => {
    // Cleanup: drop test database
    try {
      await svc.executeQuery(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
      console.log(`  Cleaned up: dropped ${TEST_DB}`);
    } catch { /* ignore cleanup errors */ }
    await svc.disconnect();
  });

  it('creates a new database without error', async () => {
    const result = await svc.createDatabase!(TEST_DB);
    expect(result.error).toBeUndefined();
    console.log(`  ✓ Created database: ${TEST_DB}`);
  }, 15_000);

  it('new database appears in listDatabases() after creation', async () => {
    const dbs = await svc.listDatabases!();
    expect(dbs).toContain(TEST_DB);
  });

  it('returns error for duplicate database name', async () => {
    const result = await svc.createDatabase!(TEST_DB);
    expect(result.error).toBeTruthy();
    console.log(`  ✓ Duplicate rejected: ${result.error}`);
  }, 15_000);

  it('returns not-connected error when no adapter is open', async () => {
    const fresh = createCliConnectionService();
    const result = await fresh.createDatabase!('should_fail');
    expect(result.error).toMatch(/not connected/i);
  });
});

// ── PART 5: Full flow (no database → pick database → query) ───────────────────

describeIf('Service — full boot flow: no DB → listDatabases → reconnect', () => {
  let svc: ReturnType<typeof createCliConnectionService>;

  afterAll(async () => { await svc.disconnect(); });

  it('step 1: testConnection() without database falls back to "postgres" and succeeds', async () => {
    svc = createCliConnectionService();
    const conn = getEnvConnection()!;
    // Simulate user connecting without filling in database field
    const noDB = { ...conn, database: undefined };
    const result = await svc.testConnection(noDB);
    expect(result.error).toBeNull();
    console.log(`  ✓ Connected without DB (fell back to postgres default)`);
  }, 15_000);

  it('step 2: listDatabases() returns the server database list', async () => {
    const dbs = await svc.listDatabases!();
    expect(dbs.length).toBeGreaterThan(0);
    console.log(`  ✓ Found ${dbs.length} databases`);
  });

  it('step 3: testConnection() with selected DB returns tables', async () => {
    const conn = getEnvConnection()!;
    const targetDb = conn.database ?? 'postgres';
    const result = await svc.testConnection({ ...conn, database: targetDb });
    expect(result.error).toBeNull();
    expect(Array.isArray(result.tables)).toBe(true);
    console.log(`  ✓ Connected to "${targetDb}", ${result.tables.length} tables`);
  }, 15_000);

  it('step 4: SELECT 1 executes correctly after re-connecting', async () => {
    const result = await svc.executeQuery('SELECT 1 AS ping, current_database() AS db');
    expect(result.error).toBeUndefined();
    expect(result.rows[0]?.['ping']).toBe(1);
    console.log(`  ✓ Query ok, db="${String(result.rows[0]?.['db'])}"`);
  }, 15_000);
});
