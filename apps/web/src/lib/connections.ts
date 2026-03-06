export type DbType =
  | 'postgresql'
  | 'mysql'
  | 'sqlite'
  | 'mongodb'
  | 'redis'
  | 'kafka'
  | 'rabbitmq'
  | 'elasticsearch'
  | 'nats';

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

const STORAGE_KEY = 'tfsdc_connections';

function nanoid(len = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((x) => chars[x % chars.length]).join('');
}

export function generateId(): string {
  return nanoid();
}

export function loadConnections(): DbConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DbConnection[]) : [];
  } catch {
    return [];
  }
}

export function saveConnections(conns: DbConnection[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conns));
}

export function upsertConnection(conn: DbConnection): void {
  const conns = loadConnections();
  const idx = conns.findIndex((c) => c.id === conn.id);
  if (idx >= 0) conns[idx] = conn;
  else conns.push(conn);
  saveConnections(conns);
}

export function removeConnection(id: string): void {
  saveConnections(loadConnections().filter((c) => c.id !== id));
}

// ── Active connection (persisted to localStorage) ─────────────────────────────

const ACTIVE_KEY = 'bean_active_connection';

export function getActiveConnection(): DbConnection | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as DbConnection) : null;
  } catch {
    return null;
  }
}

export function setActiveConnection(conn: DbConnection): void {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(conn));
}

export function clearActiveConnection(): void {
  localStorage.removeItem(ACTIVE_KEY);
}
