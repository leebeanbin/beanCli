export interface HmacKey {
  keyId: string;
  value: Buffer;
}

export interface IKeyStore {
  getActiveKey(): Promise<HmacKey>;
  getKeyById(keyId: string): Promise<HmacKey>;
  getActiveKeyId(): Promise<string>;
}
