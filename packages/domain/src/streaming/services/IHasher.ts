export interface IHasher {
  hash(entityType: string, rawId: string): Promise<string>;
  hashWithKeyId(entityType: string, rawId: string, keyId: string): Promise<string>;
}
