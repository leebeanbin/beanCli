import { apiClient } from '../../../lib/api';
import Link from 'next/link';
import { LiveTableRefresh } from '../../../components/LiveTableRefresh';

const VALID_TABLES = ['state_users', 'state_products', 'state_orders', 'state_payments', 'state_shipments'];

const HIDDEN_COLUMNS = new Set(['last_offset', 'email_hash', 'tracking_number_hash']);

function fmtCellValue(col: string, value: unknown, row: Record<string, unknown>): string {
  if (value === null || value === undefined) return '—';
  if (HIDDEN_COLUMNS.has(col)) return '[private]';
  if (col.endsWith('_ms')) {
    const n = Number(value);
    return isNaN(n) ? String(value) : new Date(n).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' });
  }
  if (col.endsWith('_cents')) {
    const n = Number(value);
    if (isNaN(n)) return String(value);
    const currency = String(row['currency_code'] ?? 'USD').toUpperCase();
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n / 100);
    } catch {
      return `${(n / 100).toFixed(2)} ${currency}`;
    }
  }
  return String(value);
}

interface StateRow {
  id: string;
  entity_id_hash: string;
  [key: string]: unknown;
}

async function getStateData(table: string, limit = 50, offset = 0) {
  const res = await apiClient.get<{ items: StateRow[]; total: number }>(
    `/api/v1/state/${table}`,
    { limit: String(limit), offset: String(offset) },
  );
  return res.ok ? res.data : null;
}

export default async function StatePage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>;
  searchParams: Promise<{ limit?: string; offset?: string }>;
}) {
  const { table } = await params;
  const { limit: limitStr, offset: offsetStr } = await searchParams;
  const limit = Number(limitStr ?? 50);
  const offset = Number(offsetStr ?? 0);

  if (!VALID_TABLES.includes(table)) {
    return <div className="text-danger font-mono text-xs">Invalid table: {table}</div>;
  }

  const data = await getStateData(table, limit, offset);

  const allColumns = data?.items[0] ? Object.keys(data.items[0]) : [];
  const columns = allColumns
    .filter(c => !c.startsWith('_') && c !== 'created_at' && !HIDDEN_COLUMNS.has(c))
    .slice(0, 8);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="font-pixel text-3xl text-fg">
          {table}
          <LiveTableRefresh table={table} />
        </h1>
        <span className="text-fg-2 text-xs font-mono">({data?.total ?? 0} rows)</span>
      </div>

      {/* Table tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {VALID_TABLES.map((t) => (
          <Link
            key={t}
            href={`/state/${t}`}
            className={`text-xs font-mono px-3 py-1 border transition-none ${
              t === table
                ? 'border-accent text-accent shadow-px-a'
                : 'border-rim text-fg-2 hover:border-accent hover:text-accent'
            }`}
          >
            {t.replace('state_', '')}
          </Link>
        ))}
      </div>

      {!data ? (
        <p className="text-fg-2 text-xs font-mono">Could not load data — API may be offline.</p>
      ) : (
        <>
          <div className="bg-bg-2 border border-rim shadow-px overflow-x-auto">
            <table className="min-w-full border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-bg border-b border-rim">
                  {columns.map((col) => (
                    <th key={col} className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((row, i) => (
                  <tr key={i} className="border-b border-rim hover:bg-bg transition-none">
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 text-fg max-w-xs truncate">
                        {fmtCellValue(col, row[col], row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex gap-2 mt-4">
            {offset > 0 && (
              <Link
                href={`/state/${table}?limit=${limit}&offset=${Math.max(0, offset - limit)}`}
                className="text-xs font-mono px-3 py-1 border border-rim text-fg-2 hover:border-accent hover:text-accent transition-none"
              >
                [ Previous ]
              </Link>
            )}
            {data.items.length === limit && (
              <Link
                href={`/state/${table}?limit=${limit}&offset=${offset + limit}`}
                className="text-xs font-mono px-3 py-1 border border-rim text-fg-2 hover:border-accent hover:text-accent transition-none"
              >
                [ Next ]
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
