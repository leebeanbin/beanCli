import { HintBar } from '../HintBar.js';
import { MockCanvas } from '@tfsdc/testing';

describe('HintBar', () => {
  test('renders hint text at specified row', () => {
    // New format: keys wrapped in brackets, separated by " · "
    const bar = new HintBar('↑/↓ Navigate  / Filter');
    const canvas = new MockCanvas(80, 5);
    canvas.beginFrame();
    bar.render(canvas, 2);
    // New format wraps keys: [↑/↓] Navigate · [/] Filter
    expect(canvas.hasText('[↑/↓]')).toBe(true);
    expect(canvas.hasText('Navigate')).toBe(true);
    expect(canvas.hasText('[/]')).toBe(true);
    expect(canvas.hasText('Filter')).toBe(true);
  });

  test('hint text appears at the correct y row', () => {
    const bar = new HintBar('HINTS_HERE');
    const canvas = new MockCanvas(80, 10);
    canvas.beginFrame();
    bar.render(canvas, 4);
    // New format: key-only hint becomes [HINTS_HERE]
    expect(canvas.row(4)).toContain('HINTS_HERE');
    expect(canvas.row(0)).not.toContain('HINTS_HERE');
  });

  test('setHints updates the displayed text', () => {
    const bar = new HintBar('old action');
    const canvas = new MockCanvas(80, 5);

    canvas.beginFrame();
    bar.render(canvas, 0);
    // New format: key "old" becomes [old], desc " action"
    expect(canvas.hasText('[old]')).toBe(true);
    expect(canvas.hasText('action')).toBe(true);

    bar.setHints('new action');
    canvas.beginFrame();
    bar.render(canvas, 0);
    expect(canvas.hasText('[new]')).toBe(true);
    expect(canvas.hasText('[old]')).toBe(false);
  });
});
