import { isValidStateTable, listState, getStateById } from './state.routes.js';
import type { IDbSession } from '../types.js';

describe('state routes', () => {
  describe('isValidStateTable', () => {
    it('should accept valid table names', () => {
      expect(isValidStateTable('state_users')).toBe(true);
      expect(isValidStateTable('state_orders')).toBe(true);
      expect(isValidStateTable('state_products')).toBe(true);
      expect(isValidStateTable('state_payments')).toBe(true);
      expect(isValidStateTable('state_shipments')).toBe(true);
    });

    it('should reject invalid table names', () => {
      expect(isValidStateTable('users')).toBe(false);
      expect(isValidStateTable('events_raw')).toBe(false);
      expect(isValidStateTable('state_other')).toBe(false);
    });
  });

  describe('listState', () => {
    const mockDb: IDbSession = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ total: '5' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 }),
    };

    it('should list state with pagination', async () => {
      const result = await listState(mockDb, 'state_orders', { limit: 2, offset: 0 });
      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(2);
    });

    it('should throw for invalid table', async () => {
      await expect(listState(mockDb, 'invalid_table', {})).rejects.toThrow('Invalid state table');
    });
  });

  describe('getStateById', () => {
    it('should return entity when found', async () => {
      const mockDb: IDbSession = {
        query: jest.fn().mockResolvedValue({ rows: [{ entity_id_hash: 'abc', status: 'ACTIVE' }], rowCount: 1 }),
      };

      const result = await getStateById(mockDb, 'state_products', 'abc');
      expect(result).toEqual({ entity_id_hash: 'abc', status: 'ACTIVE' });
    });

    it('should return null when not found', async () => {
      const mockDb: IDbSession = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      };

      const result = await getStateById(mockDb, 'state_products', 'nonexistent');
      expect(result).toBeNull();
    });
  });
});
