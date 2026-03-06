/**
 * Unit tests for MockConnectionService
 *
 * No database, no API — tests the in-memory mock layer completely.
 * Run: pnpm --filter @tfsdc/cli test
 */

import { createMockConnectionService } from '../mockConnectionService';

// ── fixtures ──────────────────────────────────────────────────────────────────

const MOCK_CONN = {
  id: 'test-001',
  label: 'test',
  type: 'postgresql' as const,
  host: 'localhost',
  port: 5432,
  database: 'tfsdc_demo',
  username: 'demo',
};

const EXPECTED_TABLES = [
  'state_users',
  'state_orders',
  'state_products',
  'state_payments',
  'state_shipments',
  'events_raw',
  'audit_events',
  'dlq_events',
];

// ── loadConnections ───────────────────────────────────────────────────────────

describe('MockConnectionService.loadConnections()', () => {
  it('returns at least one mock connection', () => {
    const svc = createMockConnectionService();
    expect(svc.loadConnections().length).toBeGreaterThanOrEqual(1);
  });

  it('mock connection has all required DbConnection fields', () => {
    const conn = createMockConnectionService().loadConnections()[0]!;
    expect(conn.id).toBeTruthy();
    expect(conn.label).toBeTruthy();
    expect(conn.type).toBeTruthy();
    expect(conn.host).toBeTruthy();
    expect(conn.port).toBeGreaterThan(0);
  });

  it('mock connection is marked as default', () => {
    const conn = createMockConnectionService().loadConnections()[0]!;
    expect(conn.isDefault).toBe(true);
  });
});

// ── testConnection ────────────────────────────────────────────────────────────

describe('MockConnectionService.testConnection()', () => {
  it('always succeeds regardless of credentials', async () => {
    const svc = createMockConnectionService();
    const result = await svc.testConnection(MOCK_CONN);
    expect(result.error).toBeNull();
  });

  it('returns all 8 expected table names', async () => {
    const svc = createMockConnectionService();
    const { tables } = await svc.testConnection(MOCK_CONN);
    expect(tables).toHaveLength(EXPECTED_TABLES.length);
    for (const t of EXPECTED_TABLES) expect(tables).toContain(t);
  });

  it('succeeds even with wrong password (mock bypasses auth)', async () => {
    const svc = createMockConnectionService();
    const result = await svc.testConnection({ ...MOCK_CONN, password: 'wrong!' });
    expect(result.error).toBeNull();
  });

  it('succeeds with an empty database field (no DB required in mock)', async () => {
    const svc = createMockConnectionService();
    const { database: _, ...connNoDB } = MOCK_CONN;
    const result = await svc.testConnection(connNoDB as typeof MOCK_CONN);
    expect(result.error).toBeNull();
    expect(result.tables.length).toBeGreaterThan(0);
  });
});

// ── listDatabases ─────────────────────────────────────────────────────────────

describe('MockConnectionService.listDatabases()', () => {
  it('returns an array of strings', async () => {
    const svc = createMockConnectionService();
    const dbs = await svc.listDatabases!();
    expect(Array.isArray(dbs)).toBe(true);
    dbs.forEach((db) => expect(typeof db).toBe('string'));
  });

  it('returns at least one database', async () => {
    const svc = createMockConnectionService();
    const dbs = await svc.listDatabases!();
    expect(dbs.length).toBeGreaterThan(0);
  });

  it('includes tfsdc_demo in the mock list', async () => {
    const svc = createMockConnectionService();
    const dbs = await svc.listDatabases!();
    expect(dbs).toContain('tfsdc_demo');
  });
});

// ── createDatabase ────────────────────────────────────────────────────────────

describe('MockConnectionService.createDatabase()', () => {
  it('accepts a simple valid name', async () => {
    const svc = createMockConnectionService();
    const result = await svc.createDatabase!('myapp');
    expect(result.error).toBeUndefined();
  });

  it('accepts snake_case names with numbers', async () => {
    const svc = createMockConnectionService();
    const result = await svc.createDatabase!('my_db_2');
    expect(result.error).toBeUndefined();
  });

  it('accepts names starting with underscore', async () => {
    const svc = createMockConnectionService();
    const result = await svc.createDatabase!('_test_db');
    expect(result.error).toBeUndefined();
  });

  it('rejects empty string', async () => {
    const svc = createMockConnectionService();
    const result = await svc.createDatabase!('');
    expect(result.error).toBeTruthy();
  });

  it('rejects name with spaces', async () => {
    const svc = createMockConnectionService();
    const result = await svc.createDatabase!('my db');
    expect(result.error).toBeTruthy();
  });

  it('rejects name starting with a digit', async () => {
    const svc = createMockConnectionService();
    const result = await svc.createDatabase!('123bad');
    expect(result.error).toBeTruthy();
  });
});

// ── executeQuery — SELECT ─────────────────────────────────────────────────────

describe('MockConnectionService.executeQuery() — SELECT', () => {
  it('SELECT * FROM state_users returns 25 rows', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery('SELECT * FROM state_users');
    expect(r.error).toBeUndefined();
    expect(r.type).toBe('select');
    expect(r.rowCount).toBe(25);
    expect(r.rows).toHaveLength(25);
  });

  it('SELECT * FROM state_orders returns 40 rows', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery('SELECT * FROM state_orders');
    expect(r.rowCount).toBe(40);
  });

  it('SELECT * FROM events_raw returns 60 rows', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery('SELECT * FROM events_raw');
    expect(r.rowCount).toBe(60);
  });

  it('SELECT from unknown table returns error message', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery('SELECT * FROM no_such_table');
    expect(r.error).toMatch(/does not exist/i);
  });

  it('LIMIT clause restricts row count', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery('SELECT * FROM state_users LIMIT 5');
    expect(r.rows.length).toBeLessThanOrEqual(5);
  });

  it('COUNT(*) returns the correct count', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery('SELECT COUNT(*) AS n FROM state_users');
    expect(r.rows[0]?.['n']).toBe(25);
  });

  it('WHERE equality filter returns only matching rows', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery("SELECT * FROM state_orders WHERE status = 'PENDING'");
    expect(r.error).toBeUndefined();
    r.rows.forEach((row) => expect(String(row['status']).toUpperCase()).toBe('PENDING'));
  });

  it('information_schema query returns table stats shape', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
    );
    expect(r.error).toBeUndefined();
    expect(r.columns).toContain('table_name');
    expect(r.rows.length).toBeGreaterThan(0);
  });
});

// ── executeQuery — schema introspection ───────────────────────────────────────

describe('MockConnectionService.executeQuery() — schema', () => {
  it('information_schema.columns for state_users returns expected columns', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery(
      "SELECT * FROM information_schema.columns WHERE table_name = 'state_users'",
    );
    expect(r.error).toBeUndefined();
    expect(r.columns).toEqual(expect.arrayContaining(['column', 'type', 'nullable', 'default']));
    const colNames = r.rows.map((row) => row['column']);
    expect(colNames).toContain('id');
    expect(colNames).toContain('username');
    expect(colNames).toContain('balance_cents');
  });

  it('information_schema.columns for state_orders has correct types', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery(
      "SELECT * FROM information_schema.columns WHERE table_name = 'state_orders'",
    );
    const idRow = r.rows.find((row) => row['column'] === 'id');
    expect(idRow?.['nullable']).toBe('NO');
  });
});

// ── executeQuery — DML ────────────────────────────────────────────────────────

describe('MockConnectionService.executeQuery() — DML', () => {
  it('INSERT INTO state_products returns INSERT 1', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery(
      "INSERT INTO state_products VALUES (DEFAULT, 'SKU-NEW', 'Test', 999, 10, 'test', true)",
    );
    expect(r.type).toBe('dml');
    expect(r.message).toContain('INSERT');
  });

  it('UPDATE returns UPDATE 1 when row found via WHERE', async () => {
    const svc = createMockConnectionService();
    // First get a real entity_id_hash from the store
    const sel = await svc.executeQuery('SELECT * FROM state_orders LIMIT 1');
    const hash = String(sel.rows[0]?.['entity_id_hash'] ?? '');
    const r = await svc.executeQuery(
      `UPDATE state_orders SET status = 'CANCELLED' WHERE entity_id_hash = '${hash}'`,
    );
    expect(r.type).toBe('dml');
    expect(r.message).toContain('UPDATE');
  });

  it('DELETE returns DELETE N when row found', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery("DELETE FROM dlq_events WHERE id = '1'");
    expect(r.type).toBe('dml');
    expect(r.message).toMatch(/DELETE \d+/);
  });
});

// ── executeQuery — duration ───────────────────────────────────────────────────

describe('MockConnectionService.executeQuery() — metadata', () => {
  it('always returns a numeric duration', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery('SELECT * FROM state_users LIMIT 1');
    expect(typeof r.duration).toBe('number');
    expect(r.duration).toBeGreaterThanOrEqual(0);
  });

  it('always returns a columns array on success', async () => {
    const svc = createMockConnectionService();
    const r = await svc.executeQuery('SELECT * FROM state_users LIMIT 1');
    expect(Array.isArray(r.columns)).toBe(true);
    expect(r.columns.length).toBeGreaterThan(0);
  });
});

// ── login ─────────────────────────────────────────────────────────────────────

describe('MockConnectionService.login()', () => {
  it('accepts any credentials and returns ok=true', async () => {
    const svc = createMockConnectionService();
    const result = await svc.login!('anyone', 'anything');
    expect(result.ok).toBe(true);
  });

  it('returns DBA role', async () => {
    const svc = createMockConnectionService();
    const result = await svc.login!('test', 'test');
    expect(result.role).toBe('DBA');
  });

  it('returns a token string', async () => {
    const svc = createMockConnectionService();
    const result = await svc.login!('test', 'test');
    expect(typeof result.token).toBe('string');
    expect(result.token!.length).toBeGreaterThan(0);
  });
});

// ── disconnect ────────────────────────────────────────────────────────────────

describe('MockConnectionService.disconnect()', () => {
  it('resolves without throwing', async () => {
    const svc = createMockConnectionService();
    await expect(svc.disconnect()).resolves.toBeUndefined();
  });
});
