import { apiClient } from '../../../lib/api';
import Link from 'next/link';

const VALID_TABLES = ['state_users', 'state_products', 'state_orders', 'state_payments', 'state_shipments'];

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
    return <div className="text-red-600">Invalid table: {table}</div>;
  }

  const data = await getStateData(table, limit, offset);

  const columns = data?.items[0] ? Object.keys(data.items[0]).slice(0, 8) : [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{table}</h1>
        <span className="text-gray-500 text-sm">({data?.total ?? 0} rows)</span>
      </div>

      <div className="flex gap-2 mb-4">
        {VALID_TABLES.map((t) => (
          <Link
            key={t}
            href={`/state/${t}`}
            className={`text-xs px-3 py-1 rounded border ${t === table ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 border-gray-300 hover:border-blue-400'}`}
          >
            {t.replace('state_', '')}
          </Link>
        ))}
      </div>

      {!data ? (
        <p className="text-gray-500 text-sm">Could not load data — API may be offline.</p>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-3 py-2 text-left font-medium text-gray-500 text-xs">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 text-xs font-mono max-w-xs truncate">
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-4">
            {offset > 0 && (
              <Link
                href={`/state/${table}?limit=${limit}&offset=${Math.max(0, offset - limit)}`}
                className="text-xs px-3 py-1 rounded border border-gray-300 hover:border-blue-400"
              >
                Previous
              </Link>
            )}
            {data.items.length === limit && (
              <Link
                href={`/state/${table}?limit=${limit}&offset=${offset + limit}`}
                className="text-xs px-3 py-1 rounded border border-gray-300 hover:border-blue-400"
              >
                Next
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
