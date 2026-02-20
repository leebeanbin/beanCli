import { createHash } from 'crypto';
import { Parser } from 'node-sql-parser';
import type { SqlOperation, Result } from '@tfsdc/kernel';
import { ok, err } from '@tfsdc/kernel';
import type { SqlAst, ISqlAstValidator } from '@tfsdc/domain';

interface AstRule {
  name: string;
  check: (ast: SqlAst) => boolean;
  message: string;
}

const INVARIANT_RULES: AstRule[] = [
  {
    name: 'NO_UPDATE_WITHOUT_WHERE',
    check: (ast) => !(ast.operation === 'UPDATE' && !ast.hasWhereClause),
    message: 'UPDATE without WHERE clause is forbidden',
  },
  {
    name: 'NO_DELETE_WITHOUT_WHERE',
    check: (ast) => !(ast.operation === 'DELETE' && !ast.hasWhereClause),
    message: 'DELETE without WHERE clause is forbidden',
  },
  {
    name: 'NO_DDL_IN_CHANGE_REQUEST',
    check: (ast) => !['DROP', 'TRUNCATE', 'ALTER'].includes(ast.operation),
    message: 'DDL operations are not allowed via ChangeRequest',
  },
];

const SUPPORTED_OPERATIONS = new Set(['SELECT', 'UPDATE', 'DELETE', 'INSERT']);

export class SqlAstValidatorImpl implements ISqlAstValidator {
  private readonly parser = new Parser();

  parse(sql: string): Result<SqlAst, string> {
    const trimmed = sql.trim();
    if (!trimmed) {
      return err('SQL statement is empty');
    }

    let parsed: ReturnType<Parser['astify']>;
    try {
      parsed = this.parser.astify(trimmed, { database: 'PostgresQL' });
    } catch (e) {
      return err(`SQL parse error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stmt: any = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!stmt) {
      return err('No SQL statement found');
    }

    const rawType = (stmt.type ?? '').toUpperCase();
    if (!SUPPORTED_OPERATIONS.has(rawType)) {
      const dummyAst: SqlAst = {
        operation: rawType as SqlOperation,
        targetTable: '',
        hasWhereClause: false,
        astHash: '',
      };
      for (const rule of INVARIANT_RULES) {
        if (!rule.check(dummyAst)) {
          return err(`[${rule.name}] ${rule.message}`);
        }
      }
      return err(`Unsupported SQL operation: ${rawType}`);
    }

    const operation = rawType as SqlOperation;
    const targetTable = this.extractTable(stmt, operation);
    const hasWhereClause = stmt.where != null;

    const partialAst: SqlAst = {
      operation,
      targetTable,
      hasWhereClause,
      astHash: '',
    };

    for (const rule of INVARIANT_RULES) {
      if (!rule.check(partialAst)) {
        return err(`[${rule.name}] ${rule.message}`);
      }
    }

    const astHash = createHash('sha256')
      .update(JSON.stringify({ operation, targetTable, hasWhereClause }))
      .digest('hex');

    return ok({
      operation,
      targetTable,
      hasWhereClause,
      astHash,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractTable(stmt: any, operation: SqlOperation): string {
    if (operation === 'SELECT' || operation === 'DELETE') {
      const from = stmt.from;
      if (Array.isArray(from) && from.length > 0) {
        return from[0].table ?? from[0].value ?? '';
      }
    }

    if (operation === 'UPDATE') {
      const table = stmt.table;
      if (Array.isArray(table) && table.length > 0) {
        return table[0].table ?? table[0].value ?? '';
      }
    }

    if (operation === 'INSERT') {
      const table = stmt.table;
      if (Array.isArray(table) && table.length > 0) {
        return table[0].table ?? table[0].value ?? '';
      }
    }

    return '';
  }
}
