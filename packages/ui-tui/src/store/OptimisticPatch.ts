export interface OptimisticPatch {
  table: string;
  entityIdHash: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  appliedAt: number;
}

export interface ChangeAppliedEvent {
  changeId: string;
  tableName: string;
  affectedCount: number;
  pkList?: string[];
  pkListTruncated: boolean;
}

export interface IViewportRefetcher {
  reloadViewport(table: string): void;
  refetchRows(table: string, pkList: string[]): void;
}

export interface IDirtyMarker {
  markDirty(): void;
}

export class OptimisticPatchManager {
  private patches = new Map<string, OptimisticPatch[]>();

  constructor(
    private readonly dirtyMarker: IDirtyMarker,
    private readonly refetcher: IViewportRefetcher,
  ) {}

  apply(changeId: string, patch: OptimisticPatch): void {
    const list = this.patches.get(changeId) ?? [];
    list.push({ ...patch, appliedAt: Date.now() });
    this.patches.set(changeId, list);
    this.dirtyMarker.markDirty();
  }

  confirm(changeId: string, event: ChangeAppliedEvent): void {
    this.patches.delete(changeId);

    if (event.pkListTruncated) {
      this.refetcher.reloadViewport(event.tableName);
    } else if (event.pkList) {
      this.refetcher.refetchRows(event.tableName, event.pkList);
    }

    this.dirtyMarker.markDirty();
  }

  rollback(changeId: string): void {
    this.patches.delete(changeId);
    this.dirtyMarker.markDirty();
  }

  getPatches(changeId: string): OptimisticPatch[] {
    return this.patches.get(changeId) ?? [];
  }

  hasPendingPatches(): boolean {
    return this.patches.size > 0;
  }
}
