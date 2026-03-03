// Services (formerly Use Cases)
export { ProcessEventUseCase } from './use-cases/ProcessEventUseCase.js';
export type { ProcessEventMetrics } from './use-cases/ProcessEventUseCase.js';

// Orchestration
export { EventDispatcher } from './EventDispatcher.js';
export { ConcurrencyController } from './ConcurrencyController.js';

// Ports — re-exported from @tfsdc/domain (domain defines the boundary)
export type { IKafkaConsumer } from '@tfsdc/domain';
export type { IDlqPublisher } from '@tfsdc/domain';
export type { IProjectorDb, IMetricsProvider } from '@tfsdc/domain';
