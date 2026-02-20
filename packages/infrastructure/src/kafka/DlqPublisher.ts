import type { RawEvent, IEncryptor } from '@tfsdc/domain';
import type { IDlqPublisher } from '@tfsdc/application';

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
    const encrypted = await this.encryptor.encrypt(
      Buffer.from(JSON.stringify(event.payload)),
      this.activeKeyId,
    );

    await this.db.query(
      `INSERT INTO dlq_events
        (source_topic, partition, "offset", payload_encrypted, key_id, error_message)
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
  }
}
