'use client';

import { hasAccess } from '@tfsdc/ui-web';
import type { AccessControlConfig } from '@tfsdc/ui-web';
import { parseRole } from '../lib/auth';

interface Props {
  page: keyof AccessControlConfig;
  children: React.ReactNode;
}

export function AccessGuard({ page, children }: Props) {
  const role = parseRole();
  if (!role || !hasAccess(role as Parameters<typeof hasAccess>[0], page)) {
    return (
      <div className="py-12 flex justify-center">
        <div className="border-2 border-danger shadow-px-d p-8 text-center max-w-sm w-full">
          <p className="font-pixel text-4xl text-danger mb-3">ACCESS DENIED</p>
          <p className="font-mono text-xs text-fg-2">
            role: <span className="text-fg">{role ?? 'none'}</span> — not permitted to view this page.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
