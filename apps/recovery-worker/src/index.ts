import { PgPool, PgKeyStore, AesEncryptor } from '@tfsdc/infrastructure';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/tfsdc';
const POLL_INTERVAL_MS = Number(process.env.RECOVERY_POLL_MS ?? 30000);

async function main() {
  console.log('[recovery-worker] Starting...');

  const pgPool = new PgPool({ connectionString: DATABASE_URL, max: 5 });
  const keyStore = new PgKeyStore(pgPool);
  const encryptor = new AesEncryptor(keyStore);

  const shutdown = async () => {
    console.log('[recovery-worker] Shutting down...');
    await pgPool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (true) {
    try {
      const result = await pgPool.query(
        `SELECT id, source_topic, partition, "offset", payload_encrypted, key_id, error_message, retry_count
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
          console.log(`[recovery-worker] Decrypted DLQ event #${row.id}: ${payload.toString().slice(0, 100)}...`);

          await pgPool.query(
            `UPDATE dlq_events SET retry_count = retry_count + 1 WHERE id = $1`,
            [row.id],
          );
        } catch (err) {
          console.error(`[recovery-worker] Failed to process DLQ #${row.id}:`, (err as Error).message);
          await pgPool.query(
            `UPDATE dlq_events SET retry_count = retry_count + 1 WHERE id = $1`,
            [row.id],
          );
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
