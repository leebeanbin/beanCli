import { createHmac } from 'crypto';
import type { IHasher, IKeyStore } from '@tfsdc/domain';

export class HmacHasher implements IHasher {
  constructor(private readonly keyStore: IKeyStore) {}

  async hash(entityType: string, rawId: string): Promise<string> {
    const activeKey = await this.keyStore.getActiveKey();
    const canonical = `${entityType}:${rawId}`;
    return createHmac('sha256', activeKey.value).update(canonical).digest('hex');
  }

  async hashWithKeyId(entityType: string, rawId: string, keyId: string): Promise<string> {
    const key = await this.keyStore.getKeyById(keyId);
    const canonical = `${entityType}:${rawId}`;
    return createHmac('sha256', key.value).update(canonical).digest('hex');
  }
}
