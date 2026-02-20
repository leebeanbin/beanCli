export interface EncryptResult {
  ciphertext: Buffer;
  keyId: string;
}

export interface IEncryptor {
  encrypt(plaintext: Buffer, keyId: string): Promise<EncryptResult>;
  decrypt(ciphertext: Buffer, keyId: string): Promise<Buffer>;
}
