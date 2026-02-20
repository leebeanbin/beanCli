import { OptimisticPatchManager } from './OptimisticPatch.js';
import type { IDirtyMarker, IViewportRefetcher, ChangeAppliedEvent } from './OptimisticPatch.js';

describe('OptimisticPatchManager', () => {
  let dirtyMarker: IDirtyMarker;
  let refetcher: IViewportRefetcher;
  let manager: OptimisticPatchManager;

  beforeEach(() => {
    dirtyMarker = { markDirty: jest.fn() };
    refetcher = {
      reloadViewport: jest.fn(),
      refetchRows: jest.fn(),
    };
    manager = new OptimisticPatchManager(dirtyMarker, refetcher);
  });

  it('should apply and track patches', () => {
    manager.apply('change-1', {
      table: 'state_orders',
      entityIdHash: 'abc',
      field: 'status',
      oldValue: 'CREATED',
      newValue: 'SHIPPED',
      appliedAt: 0,
    });

    expect(manager.hasPendingPatches()).toBe(true);
    expect(manager.getPatches('change-1')).toHaveLength(1);
    expect(dirtyMarker.markDirty).toHaveBeenCalled();
  });

  it('should trigger full reload when pkListTruncated=true', () => {
    manager.apply('change-1', {
      table: 'state_orders',
      entityIdHash: 'abc',
      field: 'status',
      oldValue: 'A',
      newValue: 'B',
      appliedAt: 0,
    });

    const event: ChangeAppliedEvent = {
      changeId: 'change-1',
      tableName: 'state_orders',
      affectedCount: 600,
      pkListTruncated: true,
    };

    manager.confirm('change-1', event);

    expect(refetcher.reloadViewport).toHaveBeenCalledWith('state_orders');
    expect(manager.hasPendingPatches()).toBe(false);
  });

  it('should trigger row refetch when pkListTruncated=false', () => {
    manager.apply('change-2', {
      table: 'state_orders',
      entityIdHash: 'xyz',
      field: 'status',
      oldValue: 'A',
      newValue: 'B',
      appliedAt: 0,
    });

    const event: ChangeAppliedEvent = {
      changeId: 'change-2',
      tableName: 'state_orders',
      affectedCount: 2,
      pkList: ['pk1', 'pk2'],
      pkListTruncated: false,
    };

    manager.confirm('change-2', event);

    expect(refetcher.refetchRows).toHaveBeenCalledWith('state_orders', ['pk1', 'pk2']);
  });

  it('should rollback patches', () => {
    manager.apply('change-3', {
      table: 'state_orders',
      entityIdHash: 'abc',
      field: 'status',
      oldValue: 'A',
      newValue: 'B',
      appliedAt: 0,
    });

    manager.rollback('change-3');

    expect(manager.hasPendingPatches()).toBe(false);
  });
});
