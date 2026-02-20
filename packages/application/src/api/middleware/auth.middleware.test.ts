import { authenticate } from './auth.middleware.js';
import type { IJwtVerifier } from '../types.js';

describe('authenticate', () => {
  const mockVerifier: IJwtVerifier = {
    verify: jest.fn().mockResolvedValue({ sub: 'user-1', role: 'MANAGER' }),
  };

  beforeEach(() => jest.clearAllMocks());

  it('should return success with valid token', async () => {
    const result = await authenticate('Bearer valid-token', mockVerifier);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.context.actor).toBe('user-1');
      expect(result.context.role).toBe('MANAGER');
    }
    expect(mockVerifier.verify).toHaveBeenCalledWith('valid-token');
  });

  it('should return 401 when no authorization header', async () => {
    const result = await authenticate(undefined, mockVerifier);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(401);
      expect(result.error).toBe('Unauthorized');
    }
  });

  it('should return 401 when token verification fails', async () => {
    (mockVerifier.verify as jest.Mock).mockRejectedValueOnce(new Error('expired'));

    const result = await authenticate('Bearer bad-token', mockVerifier);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(401);
      expect(result.error).toBe('Invalid token');
    }
  });
});
