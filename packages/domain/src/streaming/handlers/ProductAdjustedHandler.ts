import type { IEventHandler, DbTransaction } from './IEventHandler.js';
import type { RawEvent } from '../entities/RawEvent.js';

export class ProductAdjustedHandler implements IEventHandler {
  readonly entityType = 'product';

  async upsertState(tx: DbTransaction, entityIdHash: string, event: RawEvent): Promise<void> {
    const p = event.payload as Record<string, unknown>;

    await tx.query(
      `INSERT INTO state_products
        (entity_id_hash, updated_event_time_ms, last_offset,
         sku, name, category, price_cents, stock_quantity,
         status, created_event_time_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $2)
      ON CONFLICT (entity_id_hash) DO UPDATE SET
        updated_event_time_ms = EXCLUDED.updated_event_time_ms,
        last_offset           = EXCLUDED.last_offset,
        name                  = EXCLUDED.name,
        category              = EXCLUDED.category,
        price_cents           = EXCLUDED.price_cents,
        stock_quantity        = EXCLUDED.stock_quantity,
        status                = EXCLUDED.status
      WHERE state_products.updated_event_time_ms < EXCLUDED.updated_event_time_ms`,
      [
        entityIdHash,
        event.eventTimeMs,
        event.offset,
        p.sku,
        p.name,
        p.category,
        p.priceCents,
        p.stockQuantity,
        p.status,
      ],
    );
  }
}
