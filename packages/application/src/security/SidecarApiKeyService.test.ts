import { SidecarApiKeyService } from './SidecarApiKeyService.js';
import { createHash } from 'crypto';
import type { IAuditWriter, IDbSession } from '../api/types.js';

describe('SidecarApiKeyService', () => {
  let mockDb: IDbSession;
  let mockAudit: IAuditWriter;
  let service: SidecarApiKeyService;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    };
    mockAudit = {
      write: jest.fn().mockResolvedValue(undefined),
    };
    service = new SidecarApiKeyService(mockDb, mockAudit);
  });

  it('should issue a key starting with sck_ prefix', async () => {
    const key = await service.issue('admin', 'test-key');

    expect(key).toMatch(/^sck_/);
    expect(key.length).toBeGreaterThan(10);
  });

  it('should store hashed key in DB, not plaintext', async () => {
    const key = await service.issue('admin', 'test-key');
    const expectedHash = createHash('sha256').update(key).digest('hex');

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sidecar_api_keys'),
      [expectedHash, 'test-key', 'admin'],
    );
  });

  it('should write audit log on issue', async () => {
    await service.issue('admin', 'my-key');

    expect(mockAudit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SIDECAR_KEY_ISSUED',
        actor: 'admin',
      }),
    );
  });

  it('should revoke key and write audit log', async () => {
    await service.revoke('hash-abc', 'admin');

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE sidecar_api_keys SET revoked_at'),
      ['hash-abc'],
    );
    expect(mockAudit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SIDECAR_KEY_REVOKED',
      }),
    );
  });

  it('should validate active API key', async () => {
    (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });
    const valid = await service.validate('sck_somekey');

    expect(valid).toBe(true);
  });

  it('should reject revoked API key', async () => {
    (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const valid = await service.validate('sck_revokedkey');

    expect(valid).toBe(false);
  });
});
