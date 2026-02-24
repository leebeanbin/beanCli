import { randomUUID } from 'crypto';
import type { AuditEntry } from '@tfsdc/kernel';

export interface IDbQuery {
  query(sql: string, params?: unknown[]): Promise<{ rowCount: number | null }>;
}

export class AuditEventWriter {
  constructor(private readonly db: IDbQuery) {}

  async write(entry: Omit<AuditEntry, 'correlationId'> & { correlationId?: string }): Promise<void> {
    const correlationId = entry.correlationId ?? randomUUID();
    await this.db.query(
      `INSERT INTO audit_events (category, actor, action, resource, result, correlation_id, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.category,
        entry.actor,
        entry.action,
        entry.resource,
        entry.result,
        correlationId,
        JSON.stringify(entry.data ?? {}),
      ],
    ).catch((err: Error) => console.error('[audit] write failed:', err.message));
  }
}
