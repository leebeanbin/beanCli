import type { IDbAdapter } from './IDbAdapter.js';

export interface DbConnectionConfig {
  type: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

/**
 * Factory function signature — each adapter module exports one of these.
 * Adding a new DB type = create a new adapter class + call `registerDbAdapter`.
 */
export type DbAdapterFactory = (config: DbConnectionConfig) => IDbAdapter;

const registry = new Map<string, DbAdapterFactory>();

/**
 * Register an adapter factory for a given DB type string.
 * Call this once at app startup (or via side-effectful import).
 *
 * @example
 * registerDbAdapter('postgresql', (cfg) => new PgAdapter(cfg));
 */
export function registerDbAdapter(type: string, factory: DbAdapterFactory): void {
  registry.set(type.toLowerCase(), factory);
}

/**
 * Create an adapter for the given connection config.
 * Throws if the type has not been registered.
 */
export function createAdapter(config: DbConnectionConfig): IDbAdapter {
  const factory = registry.get(config.type.toLowerCase());
  if (!factory) {
    throw new Error(
      `Unknown DB type: "${config.type}". Registered types: ${[...registry.keys()].join(', ')}`,
    );
  }
  return factory(config);
}

/** Returns the list of currently registered DB type strings. */
export function registeredAdapterTypes(): string[] {
  return [...registry.keys()];
}
