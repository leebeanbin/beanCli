import { apiClient } from '../../lib/api';
import { StatusBadge } from '../../components/StatusBadge';

interface FailedChange {
  id: string;
  actor: string;
  status: string;
  target_table: string;
  sql_statement: string;
  failure_reason: string;
  risk_level: string;
  environment: string;
  created_at: string;
}

async function getFailedChanges() {
  const res = await apiClient.get<{ items: FailedChange[]; total: number }>(
    '/api/v1/changes',
    { status: 'FAILED', limit: '50' },
  );
  return res.ok ? res.data : null;
}

export default async function RecoveryPage() {
  const data = await getFailedChanges();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Recovery / DLQ</h1>
      <p className="text-sm text-gray-500 mb-6">
        Failed change requests that may need manual intervention or revert.
      </p>

      {!data ? (
        <p className="text-gray-500 text-sm">Could not load data — API may be offline.</p>
      ) : data.items.length === 0 ? (
        <p className="text-gray-500 text-sm">No failed changes. System is healthy.</p>
      ) : (
        <div className="space-y-4">
          {data.items.map((item) => (
            <div key={item.id} className="bg-white rounded-lg p-4 shadow-sm border border-red-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs text-gray-500">{item.id.slice(0, 8)}…</span>
                <StatusBadge status={item.status} />
                <span className="text-xs text-gray-500">{item.environment}</span>
                <span className={`text-xs font-mono ${item.risk_level === 'L2' ? 'text-red-600 font-bold' : 'text-yellow-600'}`}>
                  {item.risk_level}
                </span>
              </div>

              <div className="text-xs text-gray-600 mb-1">
                <span className="font-medium">Actor:</span> {item.actor} &nbsp;|&nbsp;
                <span className="font-medium">Table:</span> <code>{item.target_table}</code>
              </div>

              {item.failure_reason && (
                <div className="text-xs text-red-600 mb-2">
                  <span className="font-medium">Error:</span> {item.failure_reason}
                </div>
              )}

              <pre className="bg-gray-50 rounded p-2 text-xs font-mono overflow-x-auto max-h-20">
                {item.sql_statement}
              </pre>

              <div className="text-xs text-gray-400 mt-2">
                Created: {new Date(item.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
