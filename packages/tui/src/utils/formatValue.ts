const HIDDEN_FIELDS = new Set(['last_offset', 'email_hash', 'tracking_number_hash']);

/**
 * Format a cell value for display in the result table.
 * - `_ms`     → human datetime
 * - `_cents`  → currency string ($9.00)
 * - hidden fields → '[private]'
 */
export function formatValue(
  key:   string,
  value: unknown,
  row:   Record<string, unknown>,
): string {
  if (value === null || value === undefined) return '—';
  if (HIDDEN_FIELDS.has(key)) return '[private]';

  if (key.endsWith('_ms')) {
    const n = Number(value);
    if (!isNaN(n) && n > 0) {
      return new Date(n).toLocaleString('en-US', {
        dateStyle: 'short',
        timeStyle: 'medium',
      });
    }
  }

  if (key.endsWith('_cents')) {
    const n = Number(value);
    if (!isNaN(n)) {
      const currency = String(row['currency_code'] ?? 'USD').toUpperCase();
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency', currency, maximumFractionDigits: 2,
        }).format(n / 100);
      } catch {
        return `${(n / 100).toFixed(2)} ${currency}`;
      }
    }
  }

  return String(value);
}

/** Detect SQL statement type from first keyword. */
export function detectQueryType(sql: string): 'select' | 'dml' | 'ddl' | 'other' {
  const s = sql.trim().toUpperCase();
  if (/^(SELECT|WITH|EXPLAIN|SHOW|DESCRIBE|PRAGMA)/.test(s)) return 'select';
  if (/^(INSERT|UPDATE|DELETE|REPLACE|MERGE)/.test(s))        return 'dml';
  if (/^(CREATE|DROP|ALTER|TRUNCATE|RENAME)/.test(s))         return 'ddl';
  return 'other';
}
