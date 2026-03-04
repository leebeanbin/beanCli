import type { UserRole, AuditEntry } from '@tfsdc/kernel';

// ─── WebSocket Messages ──────────────────────────────────

export type ClientMessage =
  | { type: 'SUBSCRIBE'; tables: string[] }
  | { type: 'UNSUBSCRIBE'; tables: string[] }
  | { type: 'PING' };

export interface ChangeAppliedPayload {
  changeId: string;
  tableName: string;
  affectedCount: number;
  pkList?: string[];
  pkListTruncated: boolean;
  correlationId: string;
}

export type ServerMessage =
  | { type: 'SUBSCRIBED'; tables: string[] }
  | { type: 'CHANGE_APPLIED'; event: ChangeAppliedPayload }
  | { type: 'STREAM_EVENT'; entityType: string; count: number }
  | { type: 'OVERLOAD_WARNING'; reason: string }
  | { type: 'PONG' }
  | { type: 'ERROR'; message: string };

// ─── Auth Context ────────────────────────────────────────

export interface AuthContext {
  actor: string;
  role: UserRole;
}

// ─── Port interfaces for API ─────────────────────────────

export interface IAuditWriter {
  write(entry: Omit<AuditEntry, 'correlationId'> & { correlationId?: string }): Promise<void>;
}

export interface IJwtVerifier {
  verify(token: string): Promise<{ sub: string; role: string }>;
}

export interface IDbSession {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}
