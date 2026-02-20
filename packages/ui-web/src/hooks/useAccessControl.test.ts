import { hasAccess } from './useAccessControl.js';

describe('useAccessControl', () => {
  it('MANAGER can access approval inbox', () => {
    expect(hasAccess('MANAGER', 'approvalInbox')).toBe(true);
  });

  it('ANALYST cannot access approval inbox', () => {
    expect(hasAccess('ANALYST', 'approvalInbox')).toBe(false);
  });

  it('DBA can access policy settings', () => {
    expect(hasAccess('DBA', 'policySettings')).toBe(true);
  });

  it('MANAGER cannot access policy settings', () => {
    expect(hasAccess('MANAGER', 'policySettings')).toBe(false);
  });

  it('SECURITY_ADMIN can access DLQ browser', () => {
    expect(hasAccess('SECURITY_ADMIN', 'dlqBrowser')).toBe(true);
  });

  it('DBA cannot access DLQ browser', () => {
    expect(hasAccess('DBA', 'dlqBrowser')).toBe(false);
  });

  it('SECURITY_ADMIN can access key rotation', () => {
    expect(hasAccess('SECURITY_ADMIN', 'keyRotation')).toBe(true);
  });

  it('all roles can access change timeline', () => {
    expect(hasAccess('ANALYST', 'changeTimeline')).toBe(true);
    expect(hasAccess('MANAGER', 'changeTimeline')).toBe(true);
    expect(hasAccess('DBA', 'changeTimeline')).toBe(true);
    expect(hasAccess('SECURITY_ADMIN', 'changeTimeline')).toBe(true);
  });
});
