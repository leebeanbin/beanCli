import type { BackupSnapshot } from '../entities/BackupSnapshot.js';
import type { ChangeId } from '../value-objects/ChangeId.js';

export interface IBackupSnapshotRepository {
  save(snapshot: BackupSnapshot): Promise<void>;
  findByChangeId(changeId: ChangeId): Promise<BackupSnapshot[]>;
}
