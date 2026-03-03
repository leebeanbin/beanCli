/** SQL helpers shared across TUI panels */

export function quoteIdent(name: string, dbType: string | undefined): string {
  return dbType === 'mysql'
    ? `\`${name.replace(/`/g, '``')}\``
    : `"${name.replace(/"/g, '""')}"`;
}

export function escStr(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function detectPk(columns: string[]): string {
  return columns.find(c => c === 'entity_id_hash' || c === 'id') ?? columns[0] ?? 'id';
}
