import type { IKeyStore, HmacKey } from '@tfsdc/domain';

export interface IDbQuery {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export class PgKeyStore implements IKeyStore {
  constructor(private readonly db: IDbQuery) {}

  async getActiveKey(): Promise<HmacKey> {
    const result = await this.db.query(
      `SELECT key_id, key_value FROM hmac_keys WHERE status = 'ACTIVE' LIMIT 1`,
    );
    if (result.rows.length === 0) {
      throw new Error('No active HMAC key found');
    }
    const row = result.rows[0];
    return {
      keyId: String(row.key_id),
      value: Buffer.isBuffer(row.key_value) ? row.key_value : Buffer.from(String(row.key_value)),
    };
  }

  async getKeyById(keyId: string): Promise<HmacKey> {
    const result = await this.db.query(
      `SELECT key_id, key_value FROM hmac_keys WHERE key_id = $1`,
      [keyId],
    );
    if (result.rows.length === 0) {
      throw new Error(`HMAC key not found: ${keyId}`);
    }
    const row = result.rows[0];
    return {
      keyId: String(row.key_id),
      value: Buffer.isBuffer(row.key_value) ? row.key_value : Buffer.from(String(row.key_value)),
    };
  }

  async getActiveKeyId(): Promise<string> {
    const key = await this.getActiveKey();
    return key.keyId;
  }
}
