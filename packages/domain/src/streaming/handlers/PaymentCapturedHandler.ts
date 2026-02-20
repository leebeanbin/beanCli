import type { IEventHandler, DbTransaction } from './IEventHandler.js';
import type { RawEvent } from '../entities/RawEvent.js';
import type { IHasher } from '../services/IHasher.js';

export class PaymentCapturedHandler implements IEventHandler {
  readonly entityType = 'payment';

  constructor(private readonly hasher: IHasher) {}

  async upsertState(tx: DbTransaction, entityIdHash: string, event: RawEvent): Promise<void> {
    const p = event.payload as Record<string, unknown>;
    const orderIdHash = await this.hasher.hash('order', String(p.orderId));
    const userIdHash = await this.hasher.hash('user', String(p.userId));

    await tx.query(
      `INSERT INTO state_payments
        (entity_id_hash, updated_event_time_ms, last_offset,
         order_id_hash, user_id_hash, status, amount_cents,
         currency_code, payment_method, captured_at_ms, created_event_time_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $2)
      ON CONFLICT (entity_id_hash) DO UPDATE SET
        updated_event_time_ms = EXCLUDED.updated_event_time_ms,
        last_offset           = EXCLUDED.last_offset,
        status                = EXCLUDED.status,
        amount_cents          = EXCLUDED.amount_cents,
        captured_at_ms        = EXCLUDED.captured_at_ms
      WHERE state_payments.updated_event_time_ms < EXCLUDED.updated_event_time_ms`,
      [
        entityIdHash,
        event.eventTimeMs,
        event.offset,
        orderIdHash,
        userIdHash,
        p.status,
        p.amountCents,
        p.currencyCode,
        p.paymentMethod,
        p.capturedAtMs ?? null,
      ],
    );
  }
}
