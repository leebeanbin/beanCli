import { shouldAudit, writeAuditLog } from './audit.middleware.js';
import type { IAuditWriter } from '../types.js';

describe('audit middleware', () => {
  describe('shouldAudit', () => {
    it('should return true for write methods', () => {
      expect(shouldAudit('POST')).toBe(true);
      expect(shouldAudit('PUT')).toBe(true);
      expect(shouldAudit('PATCH')).toBe(true);
      expect(shouldAudit('DELETE')).toBe(true);
    });

    it('should return false for read methods', () => {
      expect(shouldAudit('GET')).toBe(false);
      expect(shouldAudit('HEAD')).toBe(false);
      expect(shouldAudit('OPTIONS')).toBe(false);
    });
  });

  describe('writeAuditLog', () => {
    const mockWriter: IAuditWriter = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => jest.clearAllMocks());

    it('should write SUCCESS audit for 200 response on POST', async () => {
      await writeAuditLog(
        { method: 'POST', url: '/api/v1/changes', actor: 'user-1' },
        201,
        mockWriter,
      );

      expect(mockWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'CHANGE',
          actor: 'user-1',
          result: 'SUCCESS',
        }),
      );
    });

    it('should write FAILURE audit for 4xx response on POST', async () => {
      await writeAuditLog(
        { method: 'POST', url: '/api/v1/changes', actor: 'user-1' },
        400,
        mockWriter,
      );

      expect(mockWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'FAILURE' }),
      );
    });

    it('should skip audit for GET requests', async () => {
      await writeAuditLog(
        { method: 'GET', url: '/api/v1/state/orders', actor: 'user-1' },
        200,
        mockWriter,
      );

      expect(mockWriter.write).not.toHaveBeenCalled();
    });
  });
});
