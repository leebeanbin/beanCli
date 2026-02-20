export type UserRole = 'ANALYST' | 'MANAGER' | 'DBA' | 'SECURITY_ADMIN';

export type Environment = 'LOCAL' | 'DEV' | 'PROD';

export type ExecutionMode = 'AUTO' | 'CONFIRM' | 'MANUAL';

export type RiskLevel = 'L0' | 'L1' | 'L2';

export type ChangeRequestStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'WAITING_EXECUTION'
  | 'EXECUTING'
  | 'DONE'
  | 'FAILED'
  | 'REVERTED';

export type AuditCategory = 'CHANGE' | 'AUTH' | 'POLICY' | 'SECURITY';

export type AuditResult = 'SUCCESS' | 'FAILURE';

export type KeyStatus = 'ACTIVE' | 'PREVIOUS' | 'RETIRED';

export type SqlOperation = 'SELECT' | 'UPDATE' | 'DELETE' | 'INSERT';

export type StreamMode = 'LIVE' | 'PAUSED';

export type SidecarMode = 'DAEMON' | 'MANAGED' | 'REMOTE';

export interface DomainEvent {
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly correlationId: string;
}

export interface AuditEntry {
  readonly category: AuditCategory;
  readonly actor: string;
  readonly action: string;
  readonly resource: string;
  readonly result: AuditResult;
  readonly correlationId: string;
  readonly data?: Record<string, unknown>;
}
