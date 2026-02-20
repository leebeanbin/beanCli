import {
  SqlParseError,
  SqlValidationError,
  InvalidStatusTransitionError,
  InsufficientPermissionError,
  EntityNotFoundError,
} from './errors';

describe('DomainError hierarchy', () => {
  it('SqlParseError has correct code and message', () => {
    const err = new SqlParseError('unexpected token');
    expect(err.code).toBe('SQL_PARSE_ERROR');
    expect(err.message).toContain('unexpected token');
    expect(err).toBeInstanceOf(Error);
  });

  it('SqlValidationError captures rule name', () => {
    const err = new SqlValidationError('NO_UPDATE_WITHOUT_WHERE', 'WHERE clause required');
    expect(err.code).toBe('SQL_VALIDATION_ERROR');
    expect(err.ruleName).toBe('NO_UPDATE_WITHOUT_WHERE');
  });

  it('InvalidStatusTransitionError captures from and to', () => {
    const err = new InvalidStatusTransitionError('DRAFT', 'DONE');
    expect(err.from).toBe('DRAFT');
    expect(err.to).toBe('DONE');
    expect(err.message).toContain('DRAFT');
    expect(err.message).toContain('DONE');
  });

  it('InsufficientPermissionError has correct code', () => {
    const err = new InsufficientPermissionError('ANALYST cannot create');
    expect(err.code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('EntityNotFoundError formats entity type and id', () => {
    const err = new EntityNotFoundError('ChangeRequest', 'abc-123');
    expect(err.code).toBe('ENTITY_NOT_FOUND');
    expect(err.message).toContain('ChangeRequest');
    expect(err.message).toContain('abc-123');
  });
});
