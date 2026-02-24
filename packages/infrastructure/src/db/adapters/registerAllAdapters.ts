/**
 * Register all built-in DB adapters into the registry.
 * To add a new DB type: create a new *Adapter.ts, then add one `registerDbAdapter` call here.
 * No other files need to change.
 */
import { registerDbAdapter } from './DbAdapterRegistry.js';
import { PgAdapter } from './PgAdapter.js';
import { MySqlAdapter } from './MySqlAdapter.js';
import { SqliteAdapter } from './SqliteAdapter.js';
import { MongoAdapter } from './MongoAdapter.js';
import { RedisAdapter } from './RedisAdapter.js';
import type { DbConnectionConfig } from './DbAdapterRegistry.js';

export function registerAllAdapters(): void {
  registerDbAdapter('postgresql', (cfg: DbConnectionConfig) =>
    new PgAdapter({ host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.username, password: cfg.password }),
  );

  registerDbAdapter('mysql', (cfg: DbConnectionConfig) =>
    new MySqlAdapter({ host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.username, password: cfg.password }),
  );

  registerDbAdapter('sqlite', (cfg: DbConnectionConfig) =>
    new SqliteAdapter({ database: cfg.database }),
  );

  registerDbAdapter('mongodb', (cfg: DbConnectionConfig) =>
    new MongoAdapter({ host: cfg.host, port: cfg.port, database: cfg.database, username: cfg.username, password: cfg.password }),
  );

  registerDbAdapter('redis', (cfg: DbConnectionConfig) =>
    new RedisAdapter({ host: cfg.host, port: cfg.port, password: cfg.password, database: cfg.database }),
  );
}
