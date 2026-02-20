import type { RawEvent, IHasher } from '@tfsdc/domain';
import type { IProjectorDb } from '../ports/IProjectorDb.js';
import type { IDlqPublisher } from '../ports/IDlqPublisher.js';
import type { IKafkaConsumer } from '../ports/IKafkaConsumer.js';
import type { EventDispatcher } from '../EventDispatcher.js';

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

export interface ProcessEventMetrics {
  processed: number;
  duplicateSkips: number;
  dlqSent: number;
}

export class ProcessEventUseCase {
  private _metrics: ProcessEventMetrics = { processed: 0, duplicateSkips: 0, dlqSent: 0 };

  constructor(
    private readonly db: IProjectorDb,
    private readonly dispatcher: EventDispatcher,
    private readonly hasher: IHasher,
    private readonly kafkaConsumer: IKafkaConsumer,
    private readonly dlqPublisher: IDlqPublisher,
    private readonly activeKeyId: string,
  ) {}

  get metrics(): Readonly<ProcessEventMetrics> {
    return this._metrics;
  }

  async execute(event: RawEvent): Promise<void> {
    const entityIdHash = await this.hasher.hash(event.entityType, event.canonicalId);

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const inserted = await this.db.transaction(async (tx) => {
          const result = await tx.query(
            `INSERT INTO events_raw
              (source_topic, partition, "offset", event_time_ms,
               entity_type, entity_id_hash, payload, key_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (source_topic, partition, "offset") DO NOTHING`,
            [
              event.sourceTopic,
              event.partition,
              event.offset,
              event.eventTimeMs,
              event.entityType,
              entityIdHash,
              JSON.stringify(event.payload),
              this.activeKeyId,
            ],
          );

          if (result.rowCount === 0) {
            return false;
          }

          const handler = this.dispatcher.resolve(event.entityType);
          await handler.upsertState(tx, entityIdHash, event);
          return true;
        });

        if (!inserted) {
          this._metrics.duplicateSkips++;
        } else {
          this._metrics.processed++;
        }

        await this.kafkaConsumer.commitOffset(event);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES - 1) {
          await this.sleep(BACKOFF_BASE_MS * Math.pow(4, attempt));
        }
      }
    }

    this._metrics.dlqSent++;
    await this.dlqPublisher.publish(event, lastError!);
    await this.kafkaConsumer.commitOffset(event);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
