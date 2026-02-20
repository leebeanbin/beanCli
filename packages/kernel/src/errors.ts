export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class SqlParseError extends DomainError {
  readonly code = 'SQL_PARSE_ERROR';

  constructor(detail: string) {
    super(`SQL parsing failed: ${detail}`);
  }
}

export class SqlValidationError extends DomainError {
  readonly code = 'SQL_VALIDATION_ERROR';

  constructor(
    readonly ruleName: string,
    detail: string,
  ) {
    super(`[${ruleName}] ${detail}`);
  }
}

export class InvalidStatusTransitionError extends DomainError {
  readonly code = 'INVALID_STATUS_TRANSITION';

  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid status transition: ${from} → ${to}`);
  }
}

export class InsufficientPermissionError extends DomainError {
  readonly code = 'INSUFFICIENT_PERMISSION';

  constructor(detail: string) {
    super(detail);
  }
}

export class BulkChangePolicyError extends DomainError {
  readonly code = 'BULK_CHANGE_POLICY_ERROR';

  constructor(detail: string) {
    super(detail);
  }
}

export class EntityNotFoundError extends DomainError {
  readonly code = 'ENTITY_NOT_FOUND';

  constructor(entityType: string, id: string) {
    super(`${entityType} not found: ${id}`);
  }
}

export class ConcurrencyError extends DomainError {
  readonly code = 'CONCURRENCY_ERROR';

  constructor(detail: string) {
    super(detail);
  }
}
