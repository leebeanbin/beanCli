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
      <div className="py-12 text-center">
        <p className="text-red-600 font-semibold text-lg">Access Denied</p>
        <p className="text-gray-500 text-sm mt-2">
          Your role ({role ?? 'none'}) is not permitted to view this page.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
