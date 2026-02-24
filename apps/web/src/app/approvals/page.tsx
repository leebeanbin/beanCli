'use client';

import { useState, useEffect, useCallback } from 'react';
import { ApprovalCard } from '../../components/ApprovalCard';
import { apiClient, getToken } from '../../lib/api';
import type { ApprovalItem } from '../../components/ApprovalCard';

export default function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<{ items: ApprovalItem[] }>('/api/v1/approvals/pending');
    if (res.ok && res.data) {
      setItems(res.data.items ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchPending(); }, [fetchPending]);

  async function handleApprove(id: string) {
    const res = await apiClient.post(`/api/v1/approvals/${id}/approve`);
    setMessage(res.ok ? `Approved ${id.slice(0, 8)}` : (res.error ?? 'Failed'));
    await fetchPending();
  }

  async function handleReject(id: string) {
    const res = await apiClient.post(`/api/v1/approvals/${id}/reject`);
    setMessage(res.ok ? `Rejected ${id.slice(0, 8)}` : (res.error ?? 'Failed'));
    await fetchPending();
  }

  if (!getToken()) {
    return (
      <p className="text-sm text-gray-500">
        Please set a JWT token in the <a href="/auth" className="underline text-blue-600">Auth</a> page first.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pending Approvals</h1>
        <button onClick={fetchPending} className="text-xs text-blue-600 hover:underline">Refresh</button>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
          {message}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-gray-500 text-sm">No pending approvals.</p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
