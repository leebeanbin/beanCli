import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir, hostname } from 'os';
import { join } from 'path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export type DbType = 'postgresql' | 'mysql' | 'sqlite' | 'mongodb' | 'redis';

export interface DbConnection {
  id: string;
  label: string;
  type: DbType;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  isDefault?: boolean;
}

const CONN_DIR  = join(homedir(), '.config', 'beanCli');
const CONN_FILE = join(CONN_DIR, 'connections.json');

// ── Encryption helpers ────────────────────────────────────────────────────────
// Key derived from machine identity — passwords are unreadable on other machines.

const ENC_PREFIX = 'enc:v1:';

function getEncKey(): Buffer {
  const seed = `${hostname()}:${homedir()}`;
  return scryptSync(seed, 'beanCli-conn-salt-v1', 32) as Buffer;
}

function encryptPassword(plaintext: string): string {
  const key = getEncKey();
  const iv  = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptPassword(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored; // plaintext fallback
  try {
    const rest   = stored.slice(ENC_PREFIX.length);
    const parts  = rest.split(':');
    if (parts.length !== 3) return stored;
    const [ivHex, tagHex, ctHex] = parts as [string, string, string];
    const key    = getEncKey();
    const iv     = Buffer.from(ivHex, 'hex');
    const tag    = Buffer.from(tagHex, 'hex');
    const ct     = Buffer.from(ctHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ct).toString('utf8') + decipher.final('utf8');
  } catch {
    return ''; // tampered or wrong machine — treat as empty
  }
}

// ── Serialization (encrypt on write, decrypt on read) ─────────────────────────

type StoredConnection = Omit<DbConnection, 'password'> & { password?: string };

function toStored(conn: DbConnection): StoredConnection {
  const stored = { ...conn } as StoredConnection;
  if (conn.password) stored.password = encryptPassword(conn.password);
  return stored;
}

function fromStored(stored: StoredConnection): DbConnection {
  const conn = { ...stored } as DbConnection;
  if (stored.password) conn.password = decryptPassword(stored.password);
  return conn;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function loadConnections(): DbConnection[] {
  try {
    if (!existsSync(CONN_FILE)) return [];
    const raw = JSON.parse(readFileSync(CONN_FILE, 'utf8')) as StoredConnection[];
    return raw.map(fromStored);
  } catch {
    return [];
  }
}

export function saveConnections(conns: DbConnection[]): void {
  mkdirSync(CONN_DIR, { recursive: true });
  writeFileSync(CONN_FILE, JSON.stringify(conns.map(toStored), null, 2), { mode: 0o600 });
}

export function upsertConnection(conn: DbConnection): void {
  const conns = loadConnections();
  const idx = conns.findIndex(c => c.id === conn.id);
  if (idx >= 0) {
    conns[idx] = conn;
  } else {
    conns.push(conn);
  }
  saveConnections(conns);
}

export function removeConnection(id: string): void {
  const conns = loadConnections().filter(c => c.id !== id);
  saveConnections(conns);
}

/**
 * Parse DATABASE_URL from environment into a DbConnection.
 * Returns null if DATABASE_URL is not set or unparseable.
 *
 * Supported schemes: postgres:// / postgresql:// / mysql:// / mongodb:// / redis://
 */
export function getEnvConnection(): DbConnection | null {
  const url = process.env['DATABASE_URL'];
  if (!url) return null;
  try {
    const u    = new URL(url);
    const scheme = u.protocol.replace(/:$/, '');
    const type: DbType =
      scheme === 'postgres' || scheme === 'postgresql' ? 'postgresql' :
      scheme === 'mysql'                               ? 'mysql'      :
      scheme === 'mongodb'                             ? 'mongodb'    :
      scheme === 'redis'                               ? 'redis'      :
      scheme === 'sqlite'                              ? 'sqlite'     :
      'postgresql';

    const database = u.pathname.replace(/^\//, '') || undefined;
    const label    = database ?? u.hostname ?? 'local-db';

    return {
      id:        'env-default',
      label,
      type,
      host:      u.hostname || 'localhost',
      port:      u.port ? Number(u.port) : (type === 'postgresql' ? 5432 : undefined),
      database,
      username:  u.username || undefined,
      password:  u.password ? decodeURIComponent(u.password) : undefined,
      isDefault: true,
    };
  } catch {
    return null;
  }
}
