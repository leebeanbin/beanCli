import type { IEventHandler, DbTransaction } from './IEventHandler.js';
import type { RawEvent } from '../entities/RawEvent.js';
import type { IHasher } from '../services/IHasher.js';

export class ShipmentStatusChangedHandler implements IEventHandler {
  readonly entityType = 'shipment';

  constructor(private readonly hasher: IHasher) {}

  async upsertState(tx: DbTransaction, entityIdHash: string, event: RawEvent): Promise<void> {
    const p = event.payload as Record<string, unknown>;
    const orderIdHash = await this.hasher.hash('order', String(p.orderId));
    const userIdHash = await this.hasher.hash('user', String(p.userId));

    await tx.query(
      `INSERT INTO state_shipments
        (entity_id_hash, updated_event_time_ms, last_offset,
         order_id_hash, user_id_hash, status, carrier,
         tracking_number_hash, estimated_delivery_ms,
         actual_delivery_ms, destination_country, created_event_time_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $2)
      ON CONFLICT (entity_id_hash) DO UPDATE SET
        updated_event_time_ms = EXCLUDED.updated_event_time_ms,
        last_offset           = EXCLUDED.last_offset,
        status                = EXCLUDED.status,
        carrier               = EXCLUDED.carrier,
        actual_delivery_ms    = EXCLUDED.actual_delivery_ms
      WHERE state_shipments.updated_event_time_ms < EXCLUDED.updated_event_time_ms`,
      [
        entityIdHash,
        event.eventTimeMs,
        event.offset,
        orderIdHash,
        userIdHash,
        p.status,
        p.carrier,
        p.trackingNumberHash ?? null,
        p.estimatedDeliveryMs ?? null,
        p.actualDeliveryMs ?? null,
        p.destinationCountry,
      ],
    );
  }
}
