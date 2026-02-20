import type { UserRole } from '@tfsdc/kernel';
import type { AuthContext, IAuditWriter } from '../types.js';

export interface RbacResult {
  allowed: boolean;
  status?: number;
  error?: string;
}

export async function checkRole(
  context: AuthContext,
  requiredRoles: UserRole[],
  resourceUrl: string,
  auditWriter: IAuditWriter,
): Promise<RbacResult> {
  if (requiredRoles.includes(context.role)) {
    return { allowed: true };
  }

  await auditWriter.write({
    category: 'AUTH',
    actor: context.actor,
    action: 'ACCESS_DENIED',
    resource: resourceUrl,
    result: 'FAILURE',
  });

  return { allowed: false, status: 403, error: 'Forbidden' };
}
