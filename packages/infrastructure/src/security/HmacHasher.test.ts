import { HmacHasher } from './HmacHasher.js';
import type { IKeyStore, HmacKey } from '@tfsdc/domain';
import { createHmac } from 'crypto';

describe('HmacHasher', () => {
  const testKey: HmacKey = {
    keyId: 'key-001',
    value: Buffer.from('test-secret-key-32-bytes-long!!!'),
  };

  const mockKeyStore: IKeyStore = {
    getActiveKey: jest.fn().mockResolvedValue(testKey),
    getKeyById: jest.fn().mockResolvedValue(testKey),
    getActiveKeyId: jest.fn().mockResolvedValue('key-001'),
  };

  const hasher = new HmacHasher(mockKeyStore);

  beforeEach(() => jest.clearAllMocks());

  it('should produce deterministic HMAC-SHA256 hash', async () => {
    const result = await hasher.hash('user', 'USR-001');
    const expected = createHmac('sha256', testKey.value)
      .update('user:USR-001')
      .digest('hex');

    expect(result).toBe(expected);
  });

  it('should produce different hashes for different entity types', async () => {
    const userHash = await hasher.hash('user', '123');
    const orderHash = await hasher.hash('order', '123');

    expect(userHash).not.toBe(orderHash);
  });

  it('should use canonical format entityType:rawId', async () => {
    await hasher.hash('payment', 'PAY-001');

    expect(mockKeyStore.getActiveKey).toHaveBeenCalledTimes(1);
  });

  it('hashWithKeyId uses the specified key', async () => {
    await hasher.hashWithKeyId('user', 'USR-001', 'key-002');

    expect(mockKeyStore.getKeyById).toHaveBeenCalledWith('key-002');
  });
});
