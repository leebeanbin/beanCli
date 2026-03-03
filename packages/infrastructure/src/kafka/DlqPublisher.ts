import type { RawEvent, IEncryptor, IDlqPublisher } from '@tfsdc/domain';

export interface IDbClient {
  query(sql: string, params?: unknown[]): Promise<{ rowCount: number | null }>;
}

export class DlqPublisher implements IDlqPublisher {
  constructor(
    private readonly db: IDbClient,
    private readonly encryptor: IEncryptor,
    private readonly activeKeyId: string,
  ) {}

  async publish(event: RawEvent, error: Error): Promise<void> {
    try {
      const encrypted = await this.encryptor.encrypt(
        Buffer.from(JSON.stringify(event.payload)),
        this.activeKeyId,
      );

      if (!encrypted.ciphertext) {
        throw new Error('Encryption returned empty ciphertext');
      }

      await this.db.query(
        `INSERT INTO dlq_events
          (source_topic, kafka_partition, kafka_offset, payload_encrypted, key_id, error_message)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          event.sourceTopic,
          event.partition,
          event.offset,
          encrypted.ciphertext,
          this.activeKeyId,
          error.message,
        ],
      );
    } catch (publishErr) {
      // DLQ publication failure must not crash the consumer — log and continue
      console.error(
        '[dlq] Failed to publish event to DLQ (topic=%s partition=%d offset=%d): %s',
        event.sourceTopic,
        event.partition,
        event.offset,
        publishErr instanceof Error ? publishErr.message : String(publishErr),
      );
    }
  }
}
