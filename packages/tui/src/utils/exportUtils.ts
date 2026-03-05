/**
 * Export utilities — convert query result rows to CSV or JSON strings.
 */

export function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    // Quote if contains comma, double-quote, or newline
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = columns.map(escape).join(',');
  const body = rows.map((row) => columns.map((c) => escape(row[c])).join(',')).join('\n');
  return header + '\n' + body + '\n';
}

export function rowsToJson(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, null, 2) + '\n';
}
