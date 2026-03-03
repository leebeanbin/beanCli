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

describe('AesEncryptor — key rotation', () => {
  const oldKey: HmacKey = {
    keyId: 'key-001',
    value: Buffer.from('0123456789abcdef0123456789abcdef'),
  };
  const newKey: HmacKey = {
    keyId: 'key-002',
    value: Buffer.from('fedcba9876543210fedcba9876543210'),
  };

  it('encrypts with old key and decrypts successfully via keyId routing', async () => {
    const rotationStore: IKeyStore = {
      getActiveKey: jest.fn().mockResolvedValue(newKey),
      getKeyById: jest.fn().mockImplementation(async (id: string) =>
        id === 'key-001' ? oldKey : newKey,
      ),
      getActiveKeyId: jest.fn().mockResolvedValue('key-002'),
    };
    const enc = new AesEncryptor(rotationStore);

    const encrypted = await enc.encrypt(Buffer.from('secret payload'), 'key-001');
    expect(encrypted.keyId).toBe('key-001');

    const decrypted = await enc.decrypt(encrypted.ciphertext, 'key-001');
    expect(decrypted.toString()).toBe('secret payload');
    expect(rotationStore.getKeyById).toHaveBeenCalledWith('key-001');
  });

  it('fails decryption when wrong key is used (rotation mismatch)', async () => {
    const encStore: IKeyStore = {
      getActiveKey: jest.fn().mockResolvedValue(oldKey),
      getKeyById: jest.fn().mockResolvedValue(oldKey),
      getActiveKeyId: jest.fn().mockResolvedValue('key-001'),
    };
    const enc = new AesEncryptor(encStore);
    const encrypted = await enc.encrypt(Buffer.from('secret payload'), 'key-001');

    // Try decrypting with wrong key (newKey instead of oldKey)
    const wrongStore: IKeyStore = {
      getActiveKey: jest.fn().mockResolvedValue(newKey),
      getKeyById: jest.fn().mockResolvedValue(newKey),
      getActiveKeyId: jest.fn().mockResolvedValue('key-002'),
    };
    const wrongEnc = new AesEncryptor(wrongStore);
    await expect(wrongEnc.decrypt(encrypted.ciphertext, 'key-001')).rejects.toThrow();
  });
});
