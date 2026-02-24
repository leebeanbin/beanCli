import { FilterBar } from '../FilterBar.js';
import { MockCanvas } from '@tfsdc/testing';

function makeFilterBar() {
  return { bar: new FilterBar(), canvas: new MockCanvas(80, 5) };
}

describe('FilterBar — state', () => {
  test('initially inactive with empty text', () => {
    const { bar } = makeFilterBar();
    expect(bar.isActive()).toBe(false);
    expect(bar.getText()).toBe('');
    expect(bar.hasFilter()).toBe(false);
  });

  test('activate() sets active=true and clears text', () => {
    const { bar } = makeFilterBar();
    bar.activate();
    expect(bar.isActive()).toBe(true);
    expect(bar.getText()).toBe('');
  });

  test('clear() resets state', () => {
    const { bar } = makeFilterBar();
    bar.activate();
    // simulate typing
    bar.handleKey('h');
    bar.handleKey('i');
    bar.clear();
    expect(bar.isActive()).toBe(false);
    expect(bar.getText()).toBe('');
    expect(bar.hasFilter()).toBe(false);
  });
});

describe('FilterBar — handleKey', () => {
  test('returns false when inactive', () => {
    const { bar } = makeFilterBar();
    expect(bar.handleKey('a')).toBe(false);
  });

  test('printable chars append to text', () => {
    const { bar } = makeFilterBar();
    bar.activate();
    bar.handleKey('f');
    bar.handleKey('o');
    bar.handleKey('o');
    expect(bar.getText()).toBe('foo');
  });

  test('backspace removes last char', () => {
    const { bar } = makeFilterBar();
    bar.activate();
    bar.handleKey('a');
    bar.handleKey('b');
    bar.handleKey('\u007f'); // DEL
    expect(bar.getText()).toBe('a');
  });

  test('\\b also removes last char', () => {
    const { bar } = makeFilterBar();
    bar.activate();
    bar.handleKey('x');
    bar.handleKey('\b');
    expect(bar.getText()).toBe('');
  });

  test('Esc deactivates filter without clearing text', () => {
    const { bar } = makeFilterBar();
    bar.activate();
    bar.handleKey('q');
    bar.handleKey('\u001b'); // Escape
    expect(bar.isActive()).toBe(false);
    // text is preserved after deactivation (hasFilter still true)
    expect(bar.getText()).toBe('q');
  });

  test('hasFilter is true after typing', () => {
    const { bar } = makeFilterBar();
    bar.activate();
    bar.handleKey('x');
    expect(bar.hasFilter()).toBe(true);
  });

  test('returns true for all keys when active', () => {
    const { bar } = makeFilterBar();
    bar.activate();
    expect(bar.handleKey('\u001b[A')).toBe(true); // arrow up consumed
    expect(bar.handleKey('\u001b[B')).toBe(true); // arrow down consumed
  });
});

describe('FilterBar — render', () => {
  test('shows / prompt when active', () => {
    const { bar, canvas } = makeFilterBar();
    bar.activate();
    canvas.beginFrame();
    bar.render(canvas, 0);
    expect(canvas.hasText('/')).toBe(true);
  });

  test('shows filter indicator when inactive but has text', () => {
    const { bar, canvas } = makeFilterBar();
    bar.activate();
    bar.handleKey('h');
    bar.handleKey('i');
    bar.handleKey('\u001b'); // deactivate
    canvas.beginFrame();
    bar.render(canvas, 0);
    expect(canvas.hasText('[/hi]')).toBe(true);
    expect(canvas.hasText('[Esc] clear')).toBe(true);
  });

  test('renders nothing when no filter and not active', () => {
    const { bar, canvas } = makeFilterBar();
    canvas.beginFrame();
    bar.render(canvas, 0);
    expect(canvas.hasText('/')).toBe(false);
  });
});
