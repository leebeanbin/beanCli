import { PgPool, PgKeyStore, AesEncryptor, KafkaProducerAdapter } from '@tfsdc/infrastructure';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/tfsdc';
const KAFKA_BROKER = process.env.KAFKA_BROKER ?? 'localhost:9092';
const POLL_INTERVAL_MS = Number(process.env.RECOVERY_POLL_MS ?? 30000);

async function main() {
  console.log('[recovery-worker] Starting...');

  const pgPool = new PgPool({ connectionString: DATABASE_URL, max: 5 });
  const keyStore = new PgKeyStore(pgPool);
  const encryptor = new AesEncryptor(keyStore);
  const kafkaProducer = new KafkaProducerAdapter([KAFKA_BROKER]);

  await kafkaProducer.connect();
  console.log('[recovery-worker] Kafka producer connected');

  const shutdown = async () => {
    console.log('[recovery-worker] Shutting down...');
    await kafkaProducer.disconnect();
    await pgPool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (true) {
    try {
      const result = await pgPool.query(
        `SELECT id, source_topic, kafka_partition, kafka_offset, payload_encrypted, key_id, error_message, retry_count
         FROM dlq_events
         WHERE resolved = false AND retry_count < 3
         ORDER BY created_at ASC
         LIMIT 10`,
      );

      if (result.rows.length > 0) {
        console.log(`[recovery-worker] Found ${result.rows.length} unresolved DLQ events`);
      }

      for (const row of result.rows) {
        try {
          const payload = await encryptor.decrypt(
            Buffer.from(row.payload_encrypted as string, 'hex'),
            String(row.key_id),
          );

          console.log(
            `[recovery-worker] Decrypted DLQ event #${row.id}: ${payload.toString().slice(0, 100)}...`,
          );

          // Re-publish to original topic
          await kafkaProducer.send(row.source_topic as string, [{ value: payload.toString() }]);

          // Mark as resolved
          await pgPool.query(
            `UPDATE dlq_events SET resolved = true, last_retry_at = now() WHERE id = $1`,
            [row.id],
          );

          console.log(
            `[recovery-worker] Event #${row.id} re-published to ${row.source_topic as string} and resolved`,
          );
        } catch (err) {
          console.error(
            `[recovery-worker] Failed to process DLQ #${row.id}:`,
            (err as Error).message,
          );

          const newRetryCount = Number(row.retry_count) + 1;

          if (newRetryCount >= 3) {
            // Max retries exceeded — mark as resolved with error
            await pgPool.query(
              `UPDATE dlq_events SET retry_count = $2, resolved = true, last_retry_at = now(),
               error_message = 'MAX_RETRIES_EXCEEDED' WHERE id = $1`,
              [row.id, newRetryCount],
            );
            console.warn(
              `[recovery-worker] Event #${row.id} exceeded max retries, marking resolved`,
            );
          } else {
            await pgPool.query(`UPDATE dlq_events SET retry_count = $2 WHERE id = $1`, [
              row.id,
              newRetryCount,
            ]);
          }
        }
      }
    } catch (err) {
      console.error('[recovery-worker] Poll error:', (err as Error).message);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error('[recovery-worker] Fatal error:', err);
  process.exit(1);
});
