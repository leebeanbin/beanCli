// Entities
export type { RawEvent } from './entities/RawEvent.js';

// Value Objects
export { EntityIdHash } from './value-objects/EntityIdHash.js';
export { KafkaOffset } from './value-objects/KafkaOffset.js';

// Service Interfaces
export type { IHasher } from './services/IHasher.js';
export type { IEncryptor, EncryptResult } from './services/IEncryptor.js';
export type { IKeyStore, HmacKey } from './services/IKeyStore.js';

// Handler Interface
export type { IEventHandler, DbTransaction } from './handlers/IEventHandler.js';

// Infrastructure Ports (domain defines the boundary — infrastructure implements)
export type { IKafkaConsumer } from './ports/IKafkaConsumer.js';
export type { IDlqPublisher } from './ports/IDlqPublisher.js';
export type { IProjectorDb, IMetricsProvider } from './ports/IProjectorDb.js';

// Handlers
export { OrderCreatedHandler } from './handlers/OrderCreatedHandler.js';
export { PaymentCapturedHandler } from './handlers/PaymentCapturedHandler.js';
export { ProductAdjustedHandler } from './handlers/ProductAdjustedHandler.js';
export { ShipmentStatusChangedHandler } from './handlers/ShipmentStatusChangedHandler.js';
