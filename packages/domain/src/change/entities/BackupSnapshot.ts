import { CONSTANTS } from '@tfsdc/kernel';
import type { ChangeId } from '../value-objects/ChangeId.js';

export class BackupSnapshot {
  readonly expiresAt: Date;

  private constructor(
    readonly id: string,
    readonly changeId: ChangeId,
    readonly tableName: string,
    readonly whereClause: string,
    readonly snapshot: Record<string, unknown>,
    readonly createdAt: Date,
    expiresAt?: Date,
  ) {
    this.expiresAt =
      expiresAt ??
      new Date(createdAt.getTime() + CONSTANTS.BACKUP_SNAPSHOT_TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  static create(params: {
    changeId: ChangeId;
    tableName: string;
    whereClause: string;
    snapshot: Record<string, unknown>;
  }): BackupSnapshot {
    return new BackupSnapshot(
      crypto.randomUUID(),
      params.changeId,
      params.tableName,
      params.whereClause,
      params.snapshot,
      new Date(),
    );
  }

  static reconstitute(params: {
    id: string;
    changeId: ChangeId;
    tableName: string;
    whereClause: string;
    snapshot: Record<string, unknown>;
    createdAt: Date;
    expiresAt: Date;
  }): BackupSnapshot {
    return new BackupSnapshot(
      params.id,
      params.changeId,
      params.tableName,
      params.whereClause,
      params.snapshot,
      params.createdAt,
      params.expiresAt,
    );
  }

  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }
}
