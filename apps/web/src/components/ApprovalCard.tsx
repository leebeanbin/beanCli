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
  const riskCls =
    item.risk_level === 'L2'
      ? 'text-danger font-bold'
      : item.risk_level === 'L1'
        ? 'text-warn'
        : 'text-ok';

  return (
    <div className="bg-bg-2 border border-rim shadow-px p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-fg-2">{item.id.slice(0, 8)}…</span>
          <StatusBadge status={item.status} />
          <span className={`text-xs font-mono ${riskCls}`}>{item.risk_level}</span>
        </div>
        <span className="text-xs text-fg-2 font-mono">{item.environment}</span>
      </div>

      <div className="text-xs text-fg-2 mb-1 font-mono">
        <span className="text-fg">Actor:</span> {item.actor} &nbsp;|&nbsp;
        <span className="text-fg">Table:</span>{' '}
        <code className="text-accent">{item.target_table}</code>
      </div>

      <pre className="bg-bg border border-rim p-2 text-xs font-mono overflow-x-auto mb-3 max-h-24 text-fg">
        {item.sql_statement}
      </pre>

      <div className="flex gap-2 justify-end">
        <button
          onClick={() => onReject(item.id)}
          className="px-3 py-1 text-xs font-mono border border-danger text-danger hover:bg-danger hover:text-bg shadow-px-d transition-none"
        >
          [ Reject ]
        </button>
        <button
          onClick={() => onApprove(item.id)}
          className="px-3 py-1 text-xs font-mono border border-ok text-ok hover:bg-ok hover:text-bg shadow-px-o transition-none"
        >
          [ Approve ]
        </button>
      </div>
    </div>
  );
}
