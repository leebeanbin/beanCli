import { AesEncryptor } from './AesEncryptor.js';
import type { IKeyStore, HmacKey } from '@tfsdc/domain';

describe('AesEncryptor', () => {
  const testKey: HmacKey = {
    keyId: 'key-001',
    value: Buffer.from('0123456789abcdef0123456789abcdef'),
  };

  const mockKeyStore: IKeyStore = {
    getActiveKey: jest.fn().mockResolvedValue(testKey),
    getKeyById: jest.fn().mockResolvedValue(testKey),
    getActiveKeyId: jest.fn().mockResolvedValue('key-001'),
  };

  const encryptor = new AesEncryptor(mockKeyStore);

  it('should encrypt and decrypt round-trip successfully', async () => {
    const plaintext = Buffer.from('Hello, Streaming Pipeline!');
    const encrypted = await encryptor.encrypt(plaintext, 'key-001');

    expect(encrypted.ciphertext).not.toEqual(plaintext);
    expect(encrypted.keyId).toBe('key-001');

    const decrypted = await encryptor.decrypt(encrypted.ciphertext, 'key-001');
    expect(decrypted.toString()).toBe('Hello, Streaming Pipeline!');
  });

  it('should produce different ciphertexts for same plaintext (random IV)', async () => {
    const plaintext = Buffer.from('same data');
    const e1 = await encryptor.encrypt(plaintext, 'key-001');
    const e2 = await encryptor.encrypt(plaintext, 'key-001');

    expect(e1.ciphertext).not.toEqual(e2.ciphertext);
  });

  it('should fail decryption with tampered ciphertext', async () => {
    const plaintext = Buffer.from('sensitive');
    const encrypted = await encryptor.encrypt(plaintext, 'key-001');

    // tamper with the auth tag region
    encrypted.ciphertext[20] ^= 0xff;

    await expect(encryptor.decrypt(encrypted.ciphertext, 'key-001')).rejects.toThrow();
  });
});
