import type { IEventHandler, DbTransaction } from './IEventHandler.js';
import type { RawEvent } from '../entities/RawEvent.js';
import type { IHasher } from '../services/IHasher.js';

export class OrderCreatedHandler implements IEventHandler {
  readonly entityType = 'order';

  constructor(private readonly hasher: IHasher) {}

  async upsertState(tx: DbTransaction, entityIdHash: string, event: RawEvent): Promise<void> {
    const p = event.payload as Record<string, unknown>;
    const userIdHash = await this.hasher.hash('user', String(p.userId));

    await tx.query(
      `INSERT INTO state_orders
        (entity_id_hash, updated_event_time_ms, last_offset,
         user_id_hash, status, total_amount_cents, item_count,
         currency_code, created_event_time_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $2)
      ON CONFLICT (entity_id_hash) DO UPDATE SET
        updated_event_time_ms = EXCLUDED.updated_event_time_ms,
        last_offset           = EXCLUDED.last_offset,
        user_id_hash          = EXCLUDED.user_id_hash,
        status                = EXCLUDED.status,
        total_amount_cents    = EXCLUDED.total_amount_cents,
        item_count            = EXCLUDED.item_count,
        currency_code         = EXCLUDED.currency_code
      WHERE state_orders.updated_event_time_ms < EXCLUDED.updated_event_time_ms`,
      [
        entityIdHash,
        event.eventTimeMs,
        event.offset,
        userIdHash,
        p.status,
        p.totalAmountCents,
        p.itemCount,
        p.currencyCode,
      ],
    );
  }
}
