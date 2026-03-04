import { OrderCreatedHandler } from './OrderCreatedHandler.js';
import type { RawEvent } from '../entities/RawEvent.js';
import type { IHasher } from '../services/IHasher.js';
import type { DbTransaction } from './IEventHandler.js';

describe('OrderCreatedHandler', () => {
  const mockHasher: IHasher = {
    hash: jest.fn().mockResolvedValue('hashed_user_id'),
    hashWithKeyId: jest.fn().mockResolvedValue('hashed_user_id'),
  };

  const mockTx: DbTransaction = {
    query: jest.fn().mockResolvedValue({ rowCount: 1 }),
  };

  const handler = new OrderCreatedHandler(mockHasher);

  const event: RawEvent = {
    sourceTopic: 'ecom.orders',
    partition: 0,
    offset: 1,
    eventTimeMs: 1700000000000,
    entityType: 'order',
    canonicalId: 'ORD-001',
    payload: {
      userId: 'USR-001',
      status: 'CREATED',
      totalAmountCents: 5000,
      itemCount: 2,
      currencyCode: 'KRW',
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it('should have entityType = "order"', () => {
    expect(handler.entityType).toBe('order');
  });

  it('should hash user ID and upsert state_orders', async () => {
    await handler.upsertState(mockTx, 'hashed_order_id', event);

    expect(mockHasher.hash).toHaveBeenCalledWith('user', 'USR-001');
    expect(mockTx.query).toHaveBeenCalledTimes(1);

    const [sql, params] = (mockTx.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('INSERT INTO state_orders');
    expect(sql).toContain('ON CONFLICT (entity_id_hash) DO UPDATE');
    expect(sql).toContain(
      'WHERE state_orders.updated_event_time_ms < EXCLUDED.updated_event_time_ms',
    );
    expect(params[0]).toBe('hashed_order_id');
    expect(params[3]).toBe('hashed_user_id');
    expect(params[4]).toBe('CREATED');
  });
});
