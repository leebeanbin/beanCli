'use client';

import { StatusBadge } from './StatusBadge';

export interface ChangeRow {
  id: string;
  status: string;
  actor: string;
  environment: string;
  target_table: string;
  sql_statement: string;
  risk_level: string;
  created_at: string;
}

interface ChangeTableProps {
  rows: ChangeRow[];
  onSubmit?: (id: string) => void;
  onExecute?: (id: string) => void;
}

export function ChangeTable({ rows, onSubmit, onExecute }: ChangeTableProps) {
  if (rows.length === 0) {
    return <p className="text-gray-500 text-sm py-4">No change requests found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-500">ID</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Actor</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Table</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Risk</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Env</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Created</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs text-gray-500">{row.id.slice(0, 8)}…</td>
              <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
              <td className="px-3 py-2">{row.actor}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.target_table}</td>
              <td className="px-3 py-2">
                <span className={`font-mono text-xs ${row.risk_level === 'L2' ? 'text-red-600' : row.risk_level === 'L1' ? 'text-yellow-600' : 'text-green-600'}`}>
                  {row.risk_level}
                </span>
              </td>
              <td className="px-3 py-2 text-xs">{row.environment}</td>
              <td className="px-3 py-2 text-xs text-gray-500">
                {new Date(row.created_at).toLocaleString()}
              </td>
              <td className="px-3 py-2 space-x-2">
                {row.status === 'DRAFT' && onSubmit && (
                  <button
                    onClick={() => onSubmit(row.id)}
                    className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Submit
                  </button>
                )}
                {(row.status === 'APPROVED' || row.status === 'WAITING_EXECUTION') && onExecute && (
                  <button
                    onClick={() => onExecute(row.id)}
                    className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                  >
                    Execute
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
