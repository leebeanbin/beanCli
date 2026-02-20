import { DlqPublisher } from './DlqPublisher.js';
import type { RawEvent, IEncryptor, EncryptResult } from '@tfsdc/domain';

describe('DlqPublisher', () => {
  const mockDb = {
    query: jest.fn().mockResolvedValue({ rowCount: 1 }),
  };

  const mockEncryptor: IEncryptor = {
    encrypt: jest.fn().mockResolvedValue({
      ciphertext: Buffer.from('encrypted-data'),
      keyId: 'key-001',
    } satisfies EncryptResult),
    decrypt: jest.fn(),
  };

  const publisher = new DlqPublisher(mockDb, mockEncryptor, 'key-001');

  const event: RawEvent = {
    sourceTopic: 'ecom.orders',
    partition: 0,
    offset: 42,
    eventTimeMs: 1700000000000,
    entityType: 'order',
    canonicalId: 'ORD-001',
    payload: { status: 'CREATED' },
  };

  beforeEach(() => jest.clearAllMocks());

  it('should encrypt payload and insert into dlq_events', async () => {
    const error = new Error('processing failed');
    await publisher.publish(event, error);

    expect(mockEncryptor.encrypt).toHaveBeenCalledTimes(1);
    const encryptCall = (mockEncryptor.encrypt as jest.Mock).mock.calls[0];
    expect(JSON.parse(encryptCall[0].toString())).toEqual({ status: 'CREATED' });
    expect(encryptCall[1]).toBe('key-001');

    expect(mockDb.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDb.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO dlq_events');
    expect(params[0]).toBe('ecom.orders');
    expect(params[1]).toBe(0);
    expect(params[2]).toBe(42);
    expect(params[5]).toBe('processing failed');
  });
});
