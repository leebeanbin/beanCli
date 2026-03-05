/**
 * CLI implementation of IConnectionService.
 *
 * - Connection store: ~/.config/beanCli/connections.json
 * - Connection test:  @tfsdc/infrastructure adapters (PG, MySQL, SQLite, etc.)
 * - Persistent adapter held open between testConnection() and executeQuery() calls.
 */
import {
  loadConnections,
  upsertConnection,
  removeConnection,
  getEnvConnection,
  saveSession,
  loadSession,
  clearSession,
} from './connections.js';
import { createAdapter, initDbAdapters } from '@tfsdc/infrastructure';
import type {
  IConnectionService,
  DbConnection,
  QueryResult,
  AiMessage,
  AiStreamCallbacks,
  UserRole,
  ChangeItem,
} from '@tfsdc/tui';
import type { IDbAdapter } from '@tfsdc/infrastructure';
import { detectQueryType } from '@tfsdc/tui';

const API_URL = process.env['API_URL'] ?? 'http://localhost:3100';

/** Returns Authorization header if a valid session token is stored. */
function authHeaders(): Record<string, string> {
  const token = loadSession();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// SEC-005: query safety limits
const QUERY_TIMEOUT_MS = 30_000;
const MAX_ROWS = 5_000;

// SEC-006: strip passwords/secrets from driver error messages before surfacing to UI
function sanitizeErrorMsg(msg: string): string {
  return msg
    .replace(/password[=:'"]\S+/gi, 'password=[REDACTED]')
    .replace(/pwd[=:'"]\S+/gi, 'pwd=[REDACTED]')
    .replace(/:(\/\/[^:@]*:)[^@]*@/g, '://$1[REDACTED]@'); // URI form: //user:pass@host
}

let adaptersReady = false;

export function createCliConnectionService(): IConnectionService {
  if (!adaptersReady) {
    initDbAdapters();
    adaptersReady = true;
  }

  // Persistent adapter kept open after testConnection() succeeds
  let activeAdapter: IDbAdapter | null = null;
  let activeConnType: string | null = null;

  return {
    loadConnections(): ReturnType<typeof loadConnections> {
      const saved = loadConnections();
      // If no saved connections yet, auto-inject DATABASE_URL from .env as a default
      if (saved.length === 0) {
        const envConn = getEnvConnection();
        return envConn ? [envConn] : [];
      }
      return saved;
    },

    saveConnection(conn: DbConnection): void {
      upsertConnection(conn);
    },

    deleteConnection(id: string): void {
      removeConnection(id);
    },

    async testConnection(conn: DbConnection) {
      // Close any previously open adapter
      if (activeAdapter) {
        await activeAdapter.close().catch(() => {});
        activeAdapter = null;
      }

      let adapter: IDbAdapter;
      try {
        // For PostgreSQL, fall back to 'postgres' default DB when none specified
        // so credential verification always works regardless of what DB the user owns.
        const dbToConnect = conn.database || (conn.type === 'postgresql' ? 'postgres' : undefined);

        adapter = createAdapter({
          type: conn.type,
          host: conn.host,
          port: conn.port,
          database: dbToConnect,
          username: conn.username,
          password: conn.password,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Unsupported DB type: ${conn.type}`;
        return { error: msg, tables: [] };
      }

      try {
        const tables = await adapter.listTables();
        activeAdapter = adapter; // keep open for executeQuery()
        activeConnType = conn.type;
        return { error: null, tables };
      } catch (err) {
        const raw = err instanceof Error ? err.message : 'Connection failed';
        await adapter.close().catch(() => {});
        return { error: sanitizeErrorMsg(raw), tables: [] }; // SEC-006
      }
    },

    async executeQuery(sql: string): Promise<QueryResult> {
      if (!activeAdapter) {
        return {
          columns: [],
          rows: [],
          rowCount: 0,
          duration: 0,
          type: 'other',
          error: 'Not connected — select a connection first.',
        };
      }

      const start = Date.now();
      try {
        // SEC-005: enforce 30s query timeout
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Query timed out after ${QUERY_TIMEOUT_MS / 1000}s`)),
            QUERY_TIMEOUT_MS,
          ),
        );
        const allRows = await Promise.race([activeAdapter.queryRows(sql), timeout]);
        const duration = Date.now() - start;

        // SEC-005: cap result set at MAX_ROWS
        const totalRows = allRows.length;
        const rows = totalRows > MAX_ROWS ? allRows.slice(0, MAX_ROWS) : allRows;
        const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
        const truncated = totalRows > MAX_ROWS;

        return {
          columns,
          rows,
          rowCount: totalRows, // reflects true total even when truncated
          duration,
          type: detectQueryType(sql),
          ...(truncated && {
            warning: `Result truncated: showing first ${MAX_ROWS.toLocaleString()} of ${totalRows.toLocaleString()} rows`,
          }),
        };
      } catch (err) {
        const duration = Date.now() - start;
        const msg = err instanceof Error ? err.message : 'Query failed';
        return { columns: [], rows: [], rowCount: 0, duration, type: 'other', error: msg };
      }
    },

    async disconnect(): Promise<void> {
      if (activeAdapter) {
        await activeAdapter.close().catch(() => {});
        activeAdapter = null;
        activeConnType = null;
      }
    },

    async listDatabases(): Promise<string[]> {
      if (!activeAdapter || !activeConnType) return [];
      try {
        if (activeConnType === 'mysql') {
          const rows = await activeAdapter.queryRows('SHOW DATABASES');
          return rows.map((r) => String(r['Database'] ?? Object.values(r)[0] ?? ''));
        } else if (activeConnType === 'postgresql') {
          const rows = await activeAdapter.queryRows(
            `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`,
          );
          return rows.map((r) => String(r['datname'] ?? ''));
        } else if (activeConnType === 'mongodb') {
          const rows = await activeAdapter.queryRows('SHOW DATABASES');
          return rows.map((r) => String(r['name'] ?? '')).filter(Boolean);
        } else if (activeConnType === 'redis') {
          return Array.from({ length: 16 }, (_, i) => String(i));
        } else if (
          activeConnType === 'kafka' ||
          activeConnType === 'elasticsearch' ||
          activeConnType === 'nats'
        ) {
          // Topics / indices / streams are the "databases" for these services
          return await activeAdapter.listTables();
        } else if (activeConnType === 'rabbitmq') {
          // List vhosts via management API (best-effort)
          try {
            const rows = await activeAdapter.queryRows('SHOW VHOSTS');
            return rows.map((r) => String(Object.values(r)[0] ?? '')).filter(Boolean);
          } catch {
            return ['/'];
          }
        }
        return [];
      } catch {
        return [];
      }
    },

    async createDatabase(name: string) {
      if (!activeAdapter || !activeConnType) return { error: 'Not connected' };
      const safeName = name.trim();
      if (!safeName) return { error: 'Database name cannot be empty' };
      if (!/^[a-zA-Z_][a-zA-Z0-9_$-]{0,63}$/.test(safeName)) {
        return { error: 'Invalid database name — use letters, numbers, _, - or $ only' };
      }
      try {
        if (activeConnType === 'mysql') {
          await activeAdapter.queryRows(`CREATE DATABASE \`${safeName}\``);
        } else if (activeConnType === 'postgresql') {
          await activeAdapter.queryRows(`CREATE DATABASE "${safeName}"`);
        } else {
          return { error: 'CREATE DATABASE not supported for this driver' };
        }
        return {};
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Failed to create database' };
      }
    },

    async dropDatabase(name: string) {
      if (!activeAdapter || !activeConnType) return { error: 'Not connected' };
      const safeName = name.trim();
      if (!safeName) return { error: 'Database name cannot be empty' };
      if (!/^[a-zA-Z_][a-zA-Z0-9_$-]{0,63}$/.test(safeName)) {
        return { error: 'Invalid database name — use letters, numbers, _, - or $ only' };
      }
      try {
        if (activeConnType === 'mysql') {
          await activeAdapter.queryRows(`DROP DATABASE \`${safeName}\``);
        } else if (activeConnType === 'postgresql') {
          await activeAdapter.queryRows(`DROP DATABASE "${safeName}"`);
        } else {
          return { error: 'DROP DATABASE not supported for this driver' };
        }
        return {};
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Failed to drop database' };
      }
    },

    async login(username: string, password: string) {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = (await res.json()) as {
          token?: string;
          username?: string;
          role?: string;
          error?: string;
        };
        if (!res.ok) {
          return { ok: false, error: data.error ?? `Login failed (HTTP ${res.status})` };
        }
        // Persist token for future API calls
        if (data.token) saveSession(data.token);
        return {
          ok: true,
          token: data.token,
          username: data.username,
          role: data.role as UserRole,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Network error — is the API running?',
        };
      }
    },

    async listChanges(params?: { status?: string; limit?: number }): Promise<ChangeItem[]> {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.limit) qs.set('limit', String(params.limit));
      const res = await fetch(`${API_URL}/api/v1/changes?${qs}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items?: ChangeItem[] } | ChangeItem[];
      return Array.isArray(data) ? data : (data.items ?? []);
    },

    async createChange(sql: string, description?: string, env?: string): Promise<{ id: string; status: string }> {
      const res = await fetch(`${API_URL}/api/v1/changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ sql, description, environment: env ?? 'dev' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ id: string; status: string }>;
    },

    async submitChange(id: string): Promise<{ status: string }> {
      const res = await fetch(`${API_URL}/api/v1/changes/${id}/submit`, { method: 'POST', headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ status: string }>;
    },

    async executeChange(id: string): Promise<{ status: string; affectedRows?: number }> {
      const res = await fetch(`${API_URL}/api/v1/changes/${id}/execute`, { method: 'POST', headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ status: string; affectedRows?: number }>;
    },

    async revertChange(id: string): Promise<{ status: string }> {
      const res = await fetch(`${API_URL}/api/v1/changes/${id}/revert`, { method: 'POST', headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ status: string }>;
    },

    async listPendingApprovals(): Promise<ChangeItem[]> {
      const res = await fetch(`${API_URL}/api/v1/approvals/pending`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items?: ChangeItem[] } | ChangeItem[];
      return Array.isArray(data) ? data : (data.items ?? []);
    },

    async approveChange(changeId: string): Promise<{ status: string }> {
      const res = await fetch(`${API_URL}/api/v1/approvals/${changeId}/approve`, { method: 'POST', headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ status: string }>;
    },

    async rejectChange(changeId: string): Promise<{ status: string }> {
      const res = await fetch(`${API_URL}/api/v1/approvals/${changeId}/reject`, { method: 'POST', headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ status: string }>;
    },

    async changePassword(current: string, next: string): Promise<{ error?: string }> {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/change-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ current_password: current, new_password: next }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          return { error: body.error ?? `HTTP ${res.status}` };
        }
        return {};
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Network error' };
      }
    },

    async createIndex(
      table: string,
      columns: string[],
      name?: string,
      unique?: boolean,
    ): Promise<{ error?: string }> {
      try {
        const res = await fetch(`${API_URL}/api/v1/indexes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ table, columns, name, unique: unique ?? false }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          return { error: body.error ?? `HTTP ${res.status}` };
        }
        return {};
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Network error' };
      }
    },

    async dropIndex(name: string): Promise<{ error?: string }> {
      try {
        const res = await fetch(`${API_URL}/api/v1/indexes/${encodeURIComponent(name)}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          return { error: body.error ?? `HTTP ${res.status}` };
        }
        return {};
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Network error' };
      }
    },

    async streamAi(
      messages: AiMessage[],
      opts: { model?: string },
      callbacks: AiStreamCallbacks,
    ): Promise<void> {
      try {
        const res = await fetch(`${API_URL}/api/v1/ai/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ messages, model: opts.model, includeSchema: true }),
        });

        if (!res.ok) {
          callbacks.onError(`API ${res.status}: ${res.statusText}`);
          return;
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) {
          callbacks.onError('No response body');
          return;
        }

        let buffer = '';
        let fullContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const evt = JSON.parse(line.slice(6)) as {
                type: 'chunk' | 'intent' | 'done' | 'error';
                content?: string;
                intent?: string;
                sql?: string | null;
                model?: string;
                error?: string;
              };
              switch (evt.type) {
                case 'chunk':
                  fullContent += evt.content ?? '';
                  callbacks.onChunk(evt.content ?? '');
                  break;
                case 'intent':
                  callbacks.onIntent(evt.intent ?? '');
                  break;
                case 'done':
                  callbacks.onDone(evt.content ?? fullContent, evt.sql ?? null, evt.model ?? '');
                  break;
                case 'error':
                  callbacks.onError(evt.error ?? 'Unknown AI error');
                  break;
              }
            } catch {
              /* skip malformed event */
            }
          }
        }
      } catch (err) {
        callbacks.onError(
          err instanceof Error ? err.message : 'Network error — is the API running?',
        );
      }
    },
  };
}
