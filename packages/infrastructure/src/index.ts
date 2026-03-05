// Security
export { HmacHasher } from './security/HmacHasher.js';
export { AesEncryptor } from './security/AesEncryptor.js';
export { PgKeyStore } from './security/PgKeyStore.js';
export { CachedKeyStore } from './security/CachedKeyStore.js';
export type { IDbQuery } from './security/PgKeyStore.js';

// Kafka
export { DlqPublisher } from './kafka/DlqPublisher.js';
export type { IDbClient } from './kafka/DlqPublisher.js';
export { KafkaConsumerAdapter } from './kafka/KafkaConsumerAdapter.js';
export { KafkaProducerAdapter } from './kafka/KafkaProducerAdapter.js';

// DB
export { PgPool } from './db/PgPool.js';
export { PgChangeRequestRepository } from './db/PgChangeRequestRepository.js';
export { SchemaIntrospector } from './db/SchemaIntrospector.js';
export type {
  TableMeta,
  ColumnMeta,
  IndexMeta,
  IndexUsage,
  TableStat,
} from './db/SchemaIntrospector.js';
export type { IDbPool, IDbTransaction, IDbQueryResult, IMetricsProvider } from './db/IDbPool.js';

// DB Adapters (multi-DB connection layer)
export type { IDbAdapter } from './db/adapters/IDbAdapter.js';
export type { DbConnectionConfig, DbAdapterFactory } from './db/adapters/DbAdapterRegistry.js';
export {
  createAdapter,
  registerDbAdapter,
  registeredAdapterTypes,
} from './db/adapters/DbAdapterRegistry.js';
export { PgAdapter } from './db/adapters/PgAdapter.js';
export { MySqlAdapter } from './db/adapters/MySqlAdapter.js';
export { SqliteAdapter } from './db/adapters/SqliteAdapter.js';
export { MongoAdapter } from './db/adapters/MongoAdapter.js';
export { RedisAdapter } from './db/adapters/RedisAdapter.js';
export { KafkaAdapter } from './db/adapters/KafkaAdapter.js';
export { RabbitMqAdapter } from './db/adapters/RabbitMqAdapter.js';
export { ElasticsearchAdapter } from './db/adapters/ElasticsearchAdapter.js';
export { NatsAdapter } from './db/adapters/NatsAdapter.js';

/**
 * Register all built-in DB adapters.
 * Call once at application startup before using `createAdapter`.
 * Adding a new adapter = create adapter class + add one line to registerAllAdapters.ts.
 */
export { registerAllAdapters as initDbAdapters } from './db/adapters/registerAllAdapters.js';

// Plugin API
export type { BeanCliPlugin, PluginModule } from './db/adapters/plugin.js';
export { loadPlugin } from './db/adapters/loadPlugin.js';
