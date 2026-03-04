import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const HISTORY_FILE = join(homedir(), '.config', 'beanCli', 'history.json');
const MAX_PERSIST = 200;

export function loadHistory(): string[] {
  try {
    const raw = readFileSync(HISTORY_FILE, 'utf8');
    const arr = JSON.parse(raw) as unknown[];
    return arr.filter((x) => typeof x === 'string').slice(0, MAX_PERSIST) as string[];
  } catch {
    return [];
  }
}

export function appendHistory(sql: string): void {
  const existing = loadHistory();
  const next = [sql, ...existing.filter((x) => x !== sql)].slice(0, MAX_PERSIST);
  mkdirSync(dirname(HISTORY_FILE), { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify(next, null, 2));
}
