/**
 * Dynamic plugin loader — imports a plugin file at runtime and registers
 * its adapter factory in the global DbAdapterRegistry.
 */

import path from 'path';
import { registerDbAdapter } from './DbAdapterRegistry.js';
import type { PluginModule } from './plugin.js';

export async function loadPlugin(filePath: string): Promise<void> {
  const resolved = path.resolve(filePath);
  const mod = (await import(resolved)) as PluginModule;
  const plugin = mod.default;
  if (!plugin || typeof plugin.type !== 'string' || typeof plugin.factory !== 'function') {
    throw new Error(
      `Plugin at "${resolved}" must export a default BeanCliPlugin with type and factory`,
    );
  }
  registerDbAdapter(plugin.type, plugin.factory);
}
