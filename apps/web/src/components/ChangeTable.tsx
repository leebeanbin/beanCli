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
    return <p className="text-fg-2 text-xs font-mono py-4">No change requests found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-xs font-mono">
        <thead>
          <tr className="bg-bg border-b border-rim">
            <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">ID</th>
            <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">Status</th>
            <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">Actor</th>
            <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">Table</th>
            <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">Risk</th>
            <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">Env</th>
            <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">Created</th>
            <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const riskCls = row.risk_level === 'L2'
              ? 'text-danger'
              : row.risk_level === 'L1'
              ? 'text-warn'
              : 'text-ok';
            return (
              <tr key={row.id} className="border-b border-rim hover:bg-bg transition-none">
                <td className="px-3 py-2 text-fg-2">{row.id.slice(0, 8)}…</td>
                <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                <td className="px-3 py-2 text-fg">{row.actor}</td>
                <td className="px-3 py-2 text-accent">{row.target_table}</td>
                <td className="px-3 py-2"><span className={riskCls}>{row.risk_level}</span></td>
                <td className="px-3 py-2 text-fg-2">{row.environment}</td>
                <td className="px-3 py-2 text-fg-2">{new Date(row.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 space-x-2">
                  {row.status === 'DRAFT' && onSubmit && (
                    <button
                      onClick={() => onSubmit(row.id)}
                      className="px-2 py-0.5 border border-accent text-accent hover:bg-accent hover:text-bg shadow-px-a transition-none"
                    >
                      Submit
                    </button>
                  )}
                  {(row.status === 'APPROVED' || row.status === 'WAITING_EXECUTION') && onExecute && (
                    <button
                      onClick={() => onExecute(row.id)}
                      className="px-2 py-0.5 border border-ok text-ok hover:bg-ok hover:text-bg shadow-px-o transition-none"
                    >
                      Execute
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
