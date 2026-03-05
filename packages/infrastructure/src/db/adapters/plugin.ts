/**
 * Plugin Adapter API — external adapter plugin interface.
 *
 * A plugin file must export a default `BeanCliPlugin` object:
 *
 *   import type { BeanCliPlugin } from '@tfsdc/infrastructure';
 *   const plugin: BeanCliPlugin = {
 *     type: 'my-db',
 *     factory: (config) => new MyDbAdapter(config),
 *   };
 *   export default plugin;
 *
 * Load with:  beancli --plugin ./my-adapter.js
 */

import type { DbAdapterFactory } from './DbAdapterRegistry.js';

export interface BeanCliPlugin {
  /** DB type string registered in the adapter registry, e.g. 'my-custom-db' */
  type: string;
  /** Factory function that creates a new adapter instance from a connection config */
  factory: DbAdapterFactory;
}

/** Shape of a plugin module's default export */
export type PluginModule = { default: BeanCliPlugin };
