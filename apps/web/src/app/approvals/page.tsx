'use client';

import { useState, useEffect, useCallback } from 'react';
import { ApprovalCard } from '../../components/ApprovalCard';
import { AccessGuard } from '../../components/AccessGuard';
import { apiClient } from '../../lib/api';
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

  return (
    <AccessGuard page="approvalInbox">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-pixel text-3xl text-fg">[ Pending Approvals ]</h1>
          <button
            onClick={fetchPending}
            className="text-xs font-mono text-fg-2 hover:text-accent border border-rim hover:border-accent px-2 py-0.5 transition-none"
          >
            Refresh
          </button>
        </div>

        {message && (
          <div className="mb-4 p-3 bg-bg-2 border border-accent text-xs font-mono text-accent shadow-px-a">
            {message}
          </div>
        )}

        {loading ? (
          <p className="text-fg-2 text-xs font-mono">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-fg-2 text-xs font-mono">No pending approvals.</p>
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
    </AccessGuard>
  );
}
