/**
 * Unit tests for connections.ts
 *
 * These tests require NO database — they only test pure functions.
 * Run: pnpm --filter @tfsdc/cli test
 */

import { getEnvConnection, loadConnections } from '../connections';

// ── getEnvConnection ──────────────────────────────────────────────────────────

describe('getEnvConnection()', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns null when DATABASE_URL is not set', () => {
    delete process.env['DATABASE_URL'];
    expect(getEnvConnection()).toBeNull();
  });

  it('parses a standard PostgreSQL URL', () => {
    process.env['DATABASE_URL'] = 'postgres://admin:secret@db.example.com:5432/mydb';
    const conn = getEnvConnection();
    expect(conn).not.toBeNull();
    expect(conn!.type).toBe('postgresql');
    expect(conn!.host).toBe('db.example.com');
    expect(conn!.port).toBe(5432);
    expect(conn!.database).toBe('mydb');
    expect(conn!.username).toBe('admin');
    expect(conn!.password).toBe('secret');
    expect(conn!.isDefault).toBe(true);
  });

  it('parses postgresql:// scheme', () => {
    process.env['DATABASE_URL'] = 'postgresql://user:pass@localhost/testdb';
    const conn = getEnvConnection();
    expect(conn!.type).toBe('postgresql');
    expect(conn!.host).toBe('localhost');
    expect(conn!.port).toBe(5432); // default port
    expect(conn!.database).toBe('testdb');
  });

  it('parses MySQL URL', () => {
    process.env['DATABASE_URL'] = 'mysql://root:pw@127.0.0.1:3306/shop';
    const conn = getEnvConnection();
    expect(conn!.type).toBe('mysql');
    expect(conn!.port).toBe(3306);
    expect(conn!.database).toBe('shop');
  });

  it('decodes URL-encoded special characters in password', () => {
    process.env['DATABASE_URL'] = 'postgres://user:p%40ss%21@localhost/db';
    const conn = getEnvConnection();
    expect(conn!.password).toBe('p@ss!');
  });

  it('returns null for an unparseable URL', () => {
    process.env['DATABASE_URL'] = 'not-a-url';
    expect(getEnvConnection()).toBeNull();
  });

  it('uses custom port from DATABASE_URL', () => {
    process.env['DATABASE_URL'] = 'postgres://user:pw@localhost:15432/tfsdc';
    const conn = getEnvConnection();
    expect(conn!.port).toBe(15432);
  });

  it('generates a readable label from the database name', () => {
    process.env['DATABASE_URL'] = 'postgres://u:p@localhost/tfsdc';
    const conn = getEnvConnection();
    expect(conn!.label).toBe('tfsdc');
  });
});

// ── loadConnections ───────────────────────────────────────────────────────────

describe('loadConnections()', () => {
  it('returns an array (empty or with saved entries)', () => {
    const result = loadConnections();
    expect(Array.isArray(result)).toBe(true);
  });
});
