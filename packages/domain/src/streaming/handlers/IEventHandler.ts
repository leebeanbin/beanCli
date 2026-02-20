import type { RawEvent } from '../entities/RawEvent.js';

export interface DbTransaction {
  query(sql: string, params?: unknown[]): Promise<{ rowCount: number | null }>;
}

export interface IEventHandler {
  readonly entityType: string;
  upsertState(tx: DbTransaction, entityIdHash: string, event: RawEvent): Promise<void>;
}
