'use client';

import { StatusBadge } from './StatusBadge';

export interface ApprovalItem {
  id: string;
  actor: string;
  environment: string;
  target_table: string;
  sql_statement: string;
  risk_level: string;
  created_at: string;
  status: string;
}

interface ApprovalCardProps {
  item: ApprovalItem;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ApprovalCard({ item, onApprove, onReject }: ApprovalCardProps) {
  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-500">{item.id.slice(0, 8)}…</span>
          <StatusBadge status={item.status} />
          <span className={`text-xs font-mono ${item.risk_level === 'L2' ? 'text-red-600 font-bold' : item.risk_level === 'L1' ? 'text-yellow-600' : 'text-green-600'}`}>
            {item.risk_level}
          </span>
        </div>
        <span className="text-xs text-gray-500">{item.environment}</span>
      </div>

      <div className="text-xs text-gray-600 mb-1">
        <span className="font-medium">Actor:</span> {item.actor} &nbsp;|&nbsp;
        <span className="font-medium">Table:</span> <code>{item.target_table}</code>
      </div>

      <pre className="bg-gray-50 rounded p-2 text-xs font-mono overflow-x-auto mb-3 max-h-24">
        {item.sql_statement}
      </pre>

      <div className="flex gap-2 justify-end">
        <button
          onClick={() => onReject(item.id)}
          className="px-3 py-1 text-sm rounded border border-red-300 text-red-700 hover:bg-red-50"
        >
          Reject
        </button>
        <button
          onClick={() => onApprove(item.id)}
          className="px-3 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700"
        >
          Approve
        </button>
      </div>
    </div>
  );
}
