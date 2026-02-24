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

const STORAGE_KEY = 'tfsdc_connections';

function nanoid(len = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
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
  const idx = conns.findIndex(c => c.id === conn.id);
  if (idx >= 0) conns[idx] = conn;
  else conns.push(conn);
  saveConnections(conns);
}

export function removeConnection(id: string): void {
  saveConnections(loadConnections().filter(c => c.id !== id));
}
