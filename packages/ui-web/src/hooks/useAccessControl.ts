import type { UserRole } from '@tfsdc/kernel';

export interface AccessControlConfig {
  approvalInbox: UserRole[];
  changeTimeline: UserRole[];
  policySettings: UserRole[];
  dlqBrowser: UserRole[];
  keyRotation: UserRole[];
}

export const DEFAULT_ACCESS_CONTROL: AccessControlConfig = {
  approvalInbox: ['MANAGER', 'DBA'],
  changeTimeline: ['ANALYST', 'MANAGER', 'DBA', 'SECURITY_ADMIN'],
  policySettings: ['DBA'],
  dlqBrowser: ['SECURITY_ADMIN'],
  keyRotation: ['SECURITY_ADMIN'],
};

export function hasAccess(
  role: UserRole,
  page: keyof AccessControlConfig,
  config = DEFAULT_ACCESS_CONTROL,
): boolean {
  return config[page].includes(role);
}
