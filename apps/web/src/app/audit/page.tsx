import { apiClient } from '../../lib/api';

interface AuditLog {
  id: string;
  category: string;
  actor: string;
  action: string;
  resource: string;
  result: string;
  correlation_id: string;
  created_at: string;
}

async function getAuditLogs(limit = 50) {
  const res = await apiClient.get<{ items: AuditLog[]; total: number }>('/api/v1/audit', {
    limit: String(limit),
  });
  return res.ok ? res.data : null;
}

export default async function AuditPage() {
  const data = await getAuditLogs();

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ Audit Log ]</h1>

      {!data ? (
        <p className="text-fg-2 text-xs font-mono">
          Could not load audit logs — API may be offline or authentication required.
        </p>
      ) : (
        <div className="bg-bg-2 border border-rim shadow-px overflow-x-auto">
          <table className="min-w-full border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-bg border-b border-rim">
                <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">Time</th>
                <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">
                  Category
                </th>
                <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">Actor</th>
                <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">Action</th>
                <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">
                  Resource
                </th>
                <th className="px-3 py-2 text-left text-fg-2 uppercase tracking-widest">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((log) => (
                <tr key={log.id} className="border-b border-rim hover:bg-bg transition-none">
                  <td className="px-3 py-2 text-fg-2 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-fg">{log.category}</td>
                  <td className="px-3 py-2 text-fg">{log.actor}</td>
                  <td className="px-3 py-2 text-accent">{log.action}</td>
                  <td className="px-3 py-2 text-fg max-w-xs truncate">{log.resource}</td>
                  <td className="px-3 py-2">
                    <span className={log.result === 'SUCCESS' ? 'text-ok' : 'text-danger'}>
                      {log.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && (
            <p className="text-center text-fg-2 text-xs font-mono py-6">No audit logs found.</p>
          )}
        </div>
      )}
    </div>
  );
}
