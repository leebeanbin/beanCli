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
  const res = await apiClient.get<{ items: AuditLog[]; total: number }>(
    '/api/v1/audit',
    { limit: String(limit) },
  );
  return res.ok ? res.data : null;
}

export default async function AuditPage() {
  const data = await getAuditLogs();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>

      {!data ? (
        <p className="text-gray-500 text-sm">Could not load audit logs — API may be offline or authentication required.</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs">Time</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs">Category</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs">Actor</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs">Action</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs">Resource</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">{log.category}</td>
                  <td className="px-3 py-2 text-xs">{log.actor}</td>
                  <td className="px-3 py-2 text-xs font-mono">{log.action}</td>
                  <td className="px-3 py-2 text-xs font-mono max-w-xs truncate">{log.resource}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={log.result === 'SUCCESS' ? 'text-green-600' : 'text-red-600'}>
                      {log.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-6">No audit logs found.</p>
          )}
        </div>
      )}
    </div>
  );
}
