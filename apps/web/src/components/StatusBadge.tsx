'use client';

const STATUS_STYLE: Record<string, string> = {
  DRAFT:            'border-rim text-fg-2',
  PENDING_APPROVAL: 'border-accent text-accent',
  APPROVED:         'border-ok text-ok',
  WAITING_EXECUTION:'border-warn text-warn',
  EXECUTING:        'border-special text-special',
  DONE:             'border-ok text-ok',
  FAILED:           'border-danger text-danger',
  REVERTED:         'border-warn text-warn',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] ?? 'border-rim text-fg-2';
  return (
    <span className={`inline-block border ${cls} px-2 py-0.5 text-xs font-mono shadow-px`}>
      {status}
    </span>
  );
}
