import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

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

export function loadConnections(): DbConnection[] {
  try {
    if (!existsSync(CONN_FILE)) return [];
    return JSON.parse(readFileSync(CONN_FILE, 'utf8')) as DbConnection[];
  } catch {
    return [];
  }
}

export function saveConnections(conns: DbConnection[]): void {
  mkdirSync(CONN_DIR, { recursive: true });
  writeFileSync(CONN_FILE, JSON.stringify(conns, null, 2), { mode: 0o600 });
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
