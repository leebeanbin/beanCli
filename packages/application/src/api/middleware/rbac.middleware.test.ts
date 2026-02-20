import { checkRole } from './rbac.middleware.js';
import type { AuthContext, IAuditWriter } from '../types.js';

describe('checkRole', () => {
  const mockAuditWriter: IAuditWriter = {
    write: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => jest.clearAllMocks());

  it('should allow when role matches', async () => {
    const ctx: AuthContext = { actor: 'user-1', role: 'DBA' };
    const result = await checkRole(ctx, ['MANAGER', 'DBA'], '/api/v1/changes', mockAuditWriter);

    expect(result.allowed).toBe(true);
    expect(mockAuditWriter.write).not.toHaveBeenCalled();
  });

  it('should deny when role does not match and write audit log', async () => {
    const ctx: AuthContext = { actor: 'user-2', role: 'ANALYST' };
    const result = await checkRole(ctx, ['MANAGER', 'DBA'], '/api/v1/changes', mockAuditWriter);

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toBe('Forbidden');
    expect(mockAuditWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'AUTH',
        actor: 'user-2',
        action: 'ACCESS_DENIED',
        result: 'FAILURE',
      }),
    );
  });
});
