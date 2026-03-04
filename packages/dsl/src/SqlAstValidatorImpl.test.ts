import { SqlAstValidatorImpl } from './SqlAstValidatorImpl';

describe('SqlAstValidatorImpl', () => {
  const validator = new SqlAstValidatorImpl();

  describe('valid SQL', () => {
    it('parses SELECT statement', () => {
      const result = validator.parse('SELECT * FROM state_orders WHERE id = 1');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.operation).toBe('SELECT');
        expect(result.value.targetTable).toBe('state_orders');
        expect(result.value.hasWhereClause).toBe(true);
        expect(result.value.astHash).toBeTruthy();
      }
    });

    it('parses UPDATE with WHERE', () => {
      const result = validator.parse(
        "UPDATE state_orders SET status = 'DONE' WHERE entity_id_hash = 'abc'",
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.operation).toBe('UPDATE');
        expect(result.value.targetTable).toBe('state_orders');
        expect(result.value.hasWhereClause).toBe(true);
      }
    });

    it('parses DELETE with WHERE', () => {
      const result = validator.parse("DELETE FROM state_users WHERE status = 'INACTIVE'");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.operation).toBe('DELETE');
        expect(result.value.hasWhereClause).toBe(true);
      }
    });

    it('parses INSERT', () => {
      const result = validator.parse(
        "INSERT INTO state_users (entity_id_hash, updated_event_time_ms, last_offset, status) VALUES ('h1', 100, 1, 'ACTIVE')",
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.operation).toBe('INSERT');
      }
    });
  });

  describe('invariant rule violations', () => {
    it('rejects UPDATE without WHERE', () => {
      const result = validator.parse("UPDATE state_orders SET status = 'DONE'");
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('NO_UPDATE_WITHOUT_WHERE');
      }
    });

    it('rejects DELETE without WHERE', () => {
      const result = validator.parse('DELETE FROM state_orders');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('NO_DELETE_WITHOUT_WHERE');
      }
    });

    it('rejects DDL: DROP', () => {
      const result = validator.parse('DROP TABLE state_orders');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('DDL');
      }
    });

    it('rejects DDL: TRUNCATE', () => {
      const result = validator.parse('TRUNCATE TABLE state_orders');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('DDL');
      }
    });

    it('rejects DDL: ALTER', () => {
      const result = validator.parse('ALTER TABLE state_orders ADD COLUMN foo TEXT');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain('DDL');
      }
    });
  });

  describe('error cases', () => {
    it('rejects empty SQL', () => {
      const result = validator.parse('');
      expect(result.isErr()).toBe(true);
    });

    it('rejects whitespace-only SQL', () => {
      const result = validator.parse('   ');
      expect(result.isErr()).toBe(true);
    });

    it('rejects invalid SQL syntax', () => {
      const result = validator.parse('NOT A VALID SQL');
      expect(result.isErr()).toBe(true);
    });
  });

  describe('AST hash determinism', () => {
    it('same SQL produces same hash', () => {
      const r1 = validator.parse('SELECT * FROM state_orders WHERE id = 1');
      const r2 = validator.parse('SELECT * FROM state_orders WHERE id = 1');
      if (r1.isOk() && r2.isOk()) {
        expect(r1.value.astHash).toBe(r2.value.astHash);
      }
    });
  });
});
