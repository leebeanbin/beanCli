import { RotateKeyUseCase } from './RotateKeyUseCase.js';
import type { IAuditWriter, IDbSession } from '../api/types.js';
import type { IKafkaNotifier } from './RotateKeyUseCase.js';

describe('RotateKeyUseCase', () => {
  const mockDb: IDbSession = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
  };

  const mockKafka: IKafkaNotifier = {
    send: jest.fn().mockResolvedValue(undefined),
  };

  const mockAudit: IAuditWriter = {
    write: jest.fn().mockResolvedValue(undefined),
  };

  const useCase = new RotateKeyUseCase(mockDb, mockKafka, mockAudit);

  beforeEach(() => jest.clearAllMocks());

  it('should call rotate_hmac_key DB function', async () => {
    await useCase.execute('admin');

    expect(mockDb.query).toHaveBeenCalledWith(
      'SELECT rotate_hmac_key($1, $2)',
      expect.arrayContaining([expect.stringMatching(/^key-/)]),
    );
  });

  it('should notify Kafka about new key', async () => {
    await useCase.execute('admin');

    expect(mockKafka.send).toHaveBeenCalledWith('tfsdc.internal.key-rotation', expect.any(Array));
  });

  it('should write audit log', async () => {
    await useCase.execute('admin');

    expect(mockAudit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'SECURITY',
        actor: 'admin',
        action: 'KEY_ROTATION',
        result: 'SUCCESS',
      }),
    );
  });

  it('should return new key ID', async () => {
    const keyId = await useCase.execute('admin');
    expect(keyId).toMatch(/^key-/);
  });
});
