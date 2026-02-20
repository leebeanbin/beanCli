import { ProductAdjustedHandler } from './ProductAdjustedHandler.js';
import type { RawEvent } from '../entities/RawEvent.js';
import type { DbTransaction } from './IEventHandler.js';

describe('ProductAdjustedHandler', () => {
  const mockTx: DbTransaction = {
    query: jest.fn().mockResolvedValue({ rowCount: 1 }),
  };

  const handler = new ProductAdjustedHandler();

  const event: RawEvent = {
    sourceTopic: 'ecom.products',
    partition: 0,
    offset: 5,
    eventTimeMs: 1700000000000,
    entityType: 'product',
    canonicalId: 'SKU-100',
    payload: {
      sku: 'SKU-100',
      name: 'Test Product',
      category: 'Electronics',
      priceCents: 1999,
      stockQuantity: 50,
      status: 'ACTIVE',
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it('should have entityType = "product"', () => {
    expect(handler.entityType).toBe('product');
  });

  it('should upsert state_products without needing a hasher', async () => {
    await handler.upsertState(mockTx, 'hashed_product_id', event);

    expect(mockTx.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (mockTx.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('INSERT INTO state_products');
    expect(sql).toContain('ON CONFLICT (entity_id_hash) DO UPDATE');
    expect(params[3]).toBe('SKU-100');
    expect(params[4]).toBe('Test Product');
  });
});
