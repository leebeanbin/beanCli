import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { IEncryptor, EncryptResult, IKeyStore } from '@tfsdc/domain';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export class AesEncryptor implements IEncryptor {
  constructor(private readonly keyStore: IKeyStore) {}

  async encrypt(plaintext: Buffer, keyId: string): Promise<EncryptResult> {
    const key = await this.keyStore.getKeyById(keyId);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key.value, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // IV(16) + AuthTag(16) + Ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return { ciphertext: combined, keyId };
  }

  async decrypt(ciphertext: Buffer, keyId: string): Promise<Buffer> {
    const key = await this.keyStore.getKeyById(keyId);
    const iv = ciphertext.subarray(0, IV_LENGTH);
    const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key.value, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}
