/**
 * CLI implementation of IConnectionService.
 *
 * - Connection store: ~/.config/beanCli/connections.json
 * - Connection test:  @tfsdc/infrastructure adapters (PG, MySQL, SQLite, etc.)
 */
import { loadConnections, upsertConnection, removeConnection } from './connections.js';
import { createAdapter, initDbAdapters } from '@tfsdc/infrastructure';
import type { IConnectionService, DbConnection } from '@tfsdc/tui';

let adaptersReady = false;

export function createCliConnectionService(): IConnectionService {
  if (!adaptersReady) {
    initDbAdapters();
    adaptersReady = true;
  }

  return {
    loadConnections,

    saveConnection(conn: DbConnection): void {
      upsertConnection(conn);
    },

    deleteConnection(id: string): void {
      removeConnection(id);
    },

    async testConnection(conn: DbConnection) {
      let adapter;
      try {
        adapter = createAdapter({
          type:     conn.type,
          host:     conn.host,
          port:     conn.port,
          database: conn.database,
          username: conn.username,
          password: conn.password,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Unsupported DB type: ${conn.type}`;
        return { error: msg, tables: [] };
      }

      try {
        const tables = await adapter.listTables();
        return { error: null, tables };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Connection failed';
        return { error: msg, tables: [] };
      } finally {
        await adapter.close().catch(() => {});
      }
    },
  };
}
