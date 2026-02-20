import { Layout } from './Layout.js';

describe('Layout', () => {
  const layout = new Layout();

  it('should return compact mode for < 80 columns', () => {
    const result = layout.compute(60, 24);

    expect(result.mode).toBe('compact');
    expect(result.sidebar).toBeUndefined();
    expect(result.main.x).toBe(0);
    expect(result.main.width).toBe(60);
  });

  it('should return split mode for 80-119 columns', () => {
    const result = layout.compute(100, 30);

    expect(result.mode).toBe('split');
    expect(result.sidebar).toBeDefined();
    expect(result.sidebar!.width).toBeLessThanOrEqual(24);
    expect(result.detail).toBeUndefined();
  });

  it('should return full mode for >= 120 columns', () => {
    const result = layout.compute(140, 30);

    expect(result.mode).toBe('full');
    expect(result.sidebar).toBeDefined();
    expect(result.detail).toBeDefined();
  });

  it('status bar is always at bottom', () => {
    const result = layout.compute(80, 24);
    expect(result.statusBar.y).toBe(23);
    expect(result.statusBar.width).toBe(80);
  });
});
