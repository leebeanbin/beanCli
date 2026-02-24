import {
  isValidStateTable,
  listState,
  getStateById,
  updateStateField,
  insertStateRow,
  getStateSchema,
  StateValidationError,
} from './state.routes.js';
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

    it('should sanitize invalid orderBy to updated_event_time_ms', async () => {
      const query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ entity_id_hash: 'x' }], rowCount: 1 });
      const db: IDbSession = { query };

      await listState(db, 'state_orders', { orderBy: 'DROP TABLE users', order: 'desc' });
      const sql = query.mock.calls[1][0] as string;
      expect(sql).toContain('"updated_event_time_ms" DESC');
      expect(sql).not.toContain('DROP TABLE');
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

  describe('updateStateField', () => {
    it('should normalize and validate status values', async () => {
      const query = jest.fn().mockResolvedValue({ rowCount: 1, rows: [] });
      const db: IDbSession = { query };

      const result = await updateStateField(db, 'state_orders', 'ord_001', 'status', 'paid');
      expect(result.updated).toBe(true);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "state_orders" SET "status" = $1'),
        expect.arrayContaining(['PAID']),
      );
    });

    it('should reject invalid status values', async () => {
      const db: IDbSession = { query: jest.fn() };
      await expect(updateStateField(db, 'state_orders', 'ord_001', 'status', 'BOGUS')).rejects.toBeInstanceOf(StateValidationError);
    });

    it('should reject invalid currency format', async () => {
      const db: IDbSession = { query: jest.fn() };
      await expect(updateStateField(db, 'state_orders', 'ord_001', 'currency_code', 'US')).rejects.toBeInstanceOf(StateValidationError);
    });

    it('should reject non-writable fields', async () => {
      const db: IDbSession = { query: jest.fn() };
      await expect(updateStateField(db, 'state_orders', 'ord_001', 'created_event_time_ms', 1)).rejects.toThrow('is not writable');
    });
  });

  describe('insertStateRow', () => {
    it('should normalize category and currency fields before insert', async () => {
      const query = jest.fn().mockResolvedValue({ rowCount: 1, rows: [] });
      const db: IDbSession = { query };

      await insertStateRow(db, 'state_products', {
        entity_id_hash: 'prd_x',
        name: 'Sample',
        category: 'electronics',
        price_cents: '1000',
        stock_quantity: '10',
        status: 'active',
      });

      const params = query.mock.calls[0][1] as unknown[];
      expect(params).toContain('Electronics');
      expect(params).toContain('ACTIVE');
    });

    it('should reject invalid payment method', async () => {
      const db: IDbSession = { query: jest.fn() };
      await expect(insertStateRow(db, 'state_payments', {
        entity_id_hash: 'pay_x',
        status: 'PENDING',
        amount_cents: 100,
        currency_code: 'USD',
        payment_method: 'CRYPTO',
      })).rejects.toBeInstanceOf(StateValidationError);
    });
  });

  describe('getStateSchema', () => {
    it('should return writable fields and field metadata', () => {
      const schema = getStateSchema('state_orders');
      expect(schema.table).toBe('state_orders');
      expect(schema.writableFields).toContain('status');
      expect(schema.fieldMeta.currency_code?.pattern).toBe('^[A-Z]{3}$');
    });

    it('should reject invalid table schema request', () => {
      expect(() => getStateSchema('bad_table')).toThrow('Invalid state table');
    });
  });
});
