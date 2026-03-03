import type { IKeyStore, HmacKey } from '@tfsdc/domain';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export class CachedKeyStore implements IKeyStore {
  private readonly cache = new Map<string, { key: HmacKey; expiresAt: number }>();

  constructor(private readonly inner: IKeyStore) {}

  async getActiveKey(): Promise<HmacKey> {
    const hit = this.cache.get('__active__');
    if (hit && hit.expiresAt > Date.now()) return hit.key;
    const key = await this.inner.getActiveKey();
    this.cache.set('__active__', { key, expiresAt: Date.now() + TTL_MS });
    return key;
  }

  async getKeyById(keyId: string): Promise<HmacKey> {
    const hit = this.cache.get(keyId);
    if (hit && hit.expiresAt > Date.now()) return hit.key;
    const key = await this.inner.getKeyById(keyId);
    this.cache.set(keyId, { key, expiresAt: Date.now() + TTL_MS });
    return key;
  }

  async getActiveKeyId(): Promise<string> {
    return (await this.getActiveKey()).keyId;
  }
}
