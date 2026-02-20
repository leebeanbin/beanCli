import type { SqlOperation } from '@tfsdc/kernel';
import { SqlParseError } from '@tfsdc/kernel';
import type { Result } from '@tfsdc/kernel';

export interface SqlAst {
  readonly operation: SqlOperation;
  readonly targetTable: string;
  readonly hasWhereClause: boolean;
  readonly estimatedAffectedRows?: number;
  readonly astHash: string;
}

export interface ISqlAstValidator {
  parse(sql: string): Result<SqlAst, string>;
}

export class SqlStatement {
  private constructor(
    readonly raw: string,
    readonly ast: SqlAst,
  ) {}

  static parse(raw: string, validator: ISqlAstValidator): SqlStatement {
    const result = validator.parse(raw);

    if (result.isErr()) {
      throw new SqlParseError(result.error);
    }

    return new SqlStatement(raw, result.value);
  }

  static reconstitute(raw: string, ast: SqlAst): SqlStatement {
    return new SqlStatement(raw, ast);
  }

  get operation(): SqlOperation {
    return this.ast.operation;
  }

  get targetTable(): string {
    return this.ast.targetTable;
  }

  get isWriteOperation(): boolean {
    return ['UPDATE', 'DELETE', 'INSERT'].includes(this.ast.operation);
  }
}
