import { CONSTANTS } from './constants';

describe('CONSTANTS', () => {
  it('BULK_CHANGE_THRESHOLD_ROWS is 1000', () => {
    expect(CONSTANTS.BULK_CHANGE_THRESHOLD_ROWS).toBe(1000);
  });

  it('TUI_TARGET_FPS is 30', () => {
    expect(CONSTANTS.TUI_TARGET_FPS).toBe(30);
  });

  it('TUI_FRAME_BUDGET_MS is approximately 33.33ms', () => {
    expect(CONSTANTS.TUI_FRAME_BUDGET_MS).toBeCloseTo(33.33, 1);
  });

  it('CHANGE_APPLIED_PK_LIST_MAX is 500', () => {
    expect(CONSTANTS.CHANGE_APPLIED_PK_LIST_MAX).toBe(500);
  });
});
