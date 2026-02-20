import { randomBytes, createHash } from 'crypto';
import type { IAuditWriter, IDbSession } from '../api/types.js';

export class SidecarApiKeyService {
  constructor(
    private readonly db: IDbSession,
    private readonly auditWriter: IAuditWriter,
  ) {}

  async issue(actor: string, label: string): Promise<string> {
    const key = `sck_${randomBytes(24).toString('hex')}`;
    const hashed = createHash('sha256').update(key).digest('hex');

    await this.db.query(
      `INSERT INTO sidecar_api_keys (key_hash, label, issued_by, rate_limit_rps)
      VALUES ($1, $2, $3, 100)`,
      [hashed, label, actor],
    );

    await this.auditWriter.write({
      category: 'SECURITY',
      actor,
      action: 'SIDECAR_KEY_ISSUED',
      resource: `sidecar_api_keys/${label}`,
      result: 'SUCCESS',
    });

    return key;
  }

  async revoke(keyHash: string, actor: string): Promise<void> {
    await this.db.query(
      'UPDATE sidecar_api_keys SET revoked_at = now() WHERE key_hash = $1',
      [keyHash],
    );

    await this.auditWriter.write({
      category: 'SECURITY',
      actor,
      action: 'SIDECAR_KEY_REVOKED',
      resource: `sidecar_api_keys/${keyHash}`,
      result: 'SUCCESS',
    });
  }

  async validate(apiKey: string): Promise<boolean> {
    const hashed = createHash('sha256').update(apiKey).digest('hex');
    const result = await this.db.query(
      'SELECT 1 FROM sidecar_api_keys WHERE key_hash = $1 AND revoked_at IS NULL',
      [hashed],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
