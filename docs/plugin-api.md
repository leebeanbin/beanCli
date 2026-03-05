# beanCLI Plugin Adapter API

Add custom database adapters to beanCLI at runtime without modifying the core codebase.

## Quick Start

```bash
beancli --plugin ./my-adapter.js
# Multiple plugins:
beancli --plugin ./redis-cluster.js --plugin ./clickhouse.js
```

## Writing a Plugin

A plugin is a JavaScript (or compiled TypeScript) file that exports a `BeanCliPlugin` as its **default export**.

### TypeScript Example

```typescript
import type { BeanCliPlugin, DbConnectionConfig } from '@tfsdc/infrastructure';
import type { IDbAdapter } from '@tfsdc/infrastructure';

class MyDbAdapter implements IDbAdapter {
  constructor(private config: DbConnectionConfig) {}

  async listTables(): Promise<string[]> {
    return ['my_table_1', 'my_table_2'];
  }

  async queryRows(sql: string): Promise<Record<string, unknown>[]> {
    // Execute sql against your custom DB
    return [];
  }

  async close(): Promise<void> {
    // Clean up connections
  }
}

const plugin: BeanCliPlugin = {
  type: 'my-custom-db',   // shown in Connection Picker
  factory: (config) => new MyDbAdapter(config),
};

export default plugin;
```

### JavaScript Example

```javascript
class MyDbAdapter {
  constructor(config) { this.config = config; }
  async listTables() { return ['table1']; }
  async queryRows(sql) { return []; }
  async close() {}
}

export default {
  type: 'my-custom-db',
  factory: (config) => new MyDbAdapter(config),
};
```

## IDbAdapter Interface

```typescript
interface IDbAdapter {
  /** Return the list of tables / collections / topics in the current database */
  listTables(): Promise<string[]>;

  /** Execute a query and return rows as plain objects */
  queryRows(sql: string): Promise<Record<string, unknown>[]>;

  /** Close the connection and release resources */
  close(): Promise<void>;
}
```

## Registration Flow

1. `beancli --plugin ./my-adapter.js` is parsed in `apps/cli/src/index-ink.tsx`
2. `loadPlugin(path)` dynamically imports the file and calls `registerDbAdapter(type, factory)`
3. The `type` string appears in Connection Picker's driver list
4. When the user connects with that type, `factory(config)` creates the adapter instance

## Error Handling

If a plugin fails to load, beanCLI prints a warning to stderr and continues:

```
[plugin] Failed to load "./bad-plugin.js": Cannot find module ...
```

## Notes

- Plugins only load in **real mode** (not `--mock`)
- Plugin `type` strings are case-insensitive
- Overwriting an existing built-in type (e.g. `postgresql`) replaces it — use unique names
- Plugins must be ESM modules (use `export default`, not `module.exports`)
