import {
  PgPool,
  PgKeyStore,
  HmacHasher,
  AesEncryptor,
  KafkaConsumerAdapter,
  DlqPublisher,
} from '@tfsdc/infrastructure';
import { ProcessEventUseCase, EventDispatcher, ConcurrencyController } from '@tfsdc/application';
import type { IMetricsProvider } from '@tfsdc/domain';
import {
  OrderCreatedHandler,
  PaymentCapturedHandler,
  ProductAdjustedHandler,
  ShipmentStatusChangedHandler,
} from '@tfsdc/domain';
import type { RawEvent } from '@tfsdc/domain';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/tfsdc';
const KAFKA_BROKER = process.env.KAFKA_BROKER ?? 'localhost:9092';

const TOPICS = ['ecom.orders', 'ecom.payments', 'ecom.products', 'ecom.shipments'];

async function main() {
  console.log('[projector] Starting...');

  const pgPool = new PgPool({ connectionString: DATABASE_URL, max: 20 });
  const keyStore = new PgKeyStore(pgPool);
  const hasher = new HmacHasher(keyStore);
  const encryptor = new AesEncryptor(keyStore);
  const activeKeyId = await keyStore.getActiveKeyId();

  const kafkaConsumer = new KafkaConsumerAdapter(KAFKA_BROKER.split(','));
  const dlqPublisher = new DlqPublisher(pgPool, encryptor, activeKeyId);

  const dispatcher = new EventDispatcher();
  dispatcher.register(new OrderCreatedHandler(hasher));
  dispatcher.register(new PaymentCapturedHandler(hasher));
  dispatcher.register(new ProductAdjustedHandler());
  dispatcher.register(new ShipmentStatusChangedHandler(hasher));

  const metricsProvider: IMetricsProvider = {
    getDbP95LatencyMs: async () => (await pgPool.getMetrics()).p95LatencyMs,
    getConnectionPoolUsagePct: async () => (await pgPool.getMetrics()).poolUsagePct,
  };

  const concurrency = new ConcurrencyController(metricsProvider);
  const useCase = new ProcessEventUseCase(
    pgPool,
    dispatcher,
    hasher,
    kafkaConsumer,
    dlqPublisher,
    activeKeyId,
  );

  await kafkaConsumer.subscribe(TOPICS);
  console.log(`[projector] Subscribed to: ${TOPICS.join(', ')}`);

  const shutdown = async () => {
    console.log('[projector] Shutting down...');
    await kafkaConsumer.disconnect();
    await pgPool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (true) {
    const batchSize = await concurrency.getBatchSize();
    const events = await kafkaConsumer.poll(batchSize);

    const processedBefore = useCase.metrics.processed;

    for (const event of events) {
      await useCase.execute(event);
    }

    if (events.length > 0) {
      const m = useCase.metrics;
      console.log(
        `[projector] batch=${events.length} processed=${m.processed} skips=${m.duplicateSkips} dlq=${m.dlqSent}`,
      );

      // Notify API via PostgreSQL LISTEN/NOTIFY for real-time WS events
      const processedDelta = m.processed - processedBefore;
      if (processedDelta > 0) {
        const counts = groupByEntityType(events);
        for (const [entityType, count] of counts) {
          await pgPool
            .query(`SELECT pg_notify('tfsdc_stream_event', $1)`, [
              JSON.stringify({ entityType, count }),
            ])
            .catch((err: Error) => console.warn('[projector] notify failed:', err.message));
        }
      }
    }
  }
}

function groupByEntityType(events: RawEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.entityType, (counts.get(event.entityType) ?? 0) + 1);
  }
  return counts;
}

main().catch((err) => {
  console.error('[projector] Fatal error:', err);
  process.exit(1);
});
