import { TabBar } from '../TabBar.js';
import { MockCanvas } from '@tfsdc/testing';

const TABS = ['orders', 'users', 'products'] as const;

function makeTabBar() {
  return { bar: new TabBar(TABS), canvas: new MockCanvas(80, 5) };
}

describe('TabBar — state', () => {
  test('initial index is 0', () => {
    const { bar } = makeTabBar();
    expect(bar.currentIndex()).toBe(0);
    expect(bar.current()).toBe('orders');
  });

  test('next() advances index', () => {
    const { bar } = makeTabBar();
    bar.next();
    expect(bar.currentIndex()).toBe(1);
    expect(bar.current()).toBe('users');
  });

  test('next() wraps around', () => {
    const { bar } = makeTabBar();
    bar.next();
    bar.next();
    bar.next(); // wraps back to 0
    expect(bar.currentIndex()).toBe(0);
  });

  test('prev() wraps to last', () => {
    const { bar } = makeTabBar();
    bar.prev();
    expect(bar.currentIndex()).toBe(TABS.length - 1);
    expect(bar.current()).toBe('products');
  });

  test('setIndex() sets specific tab', () => {
    const { bar } = makeTabBar();
    bar.setIndex(2);
    expect(bar.current()).toBe('products');
  });

  test('setIndex() ignores out-of-range', () => {
    const { bar } = makeTabBar();
    bar.setIndex(99);
    expect(bar.currentIndex()).toBe(0); // unchanged
  });

  test('setByValue() sets tab by string value', () => {
    const { bar } = makeTabBar();
    bar.setByValue('products');
    expect(bar.currentIndex()).toBe(2);
  });

  test('setByValue() ignores unknown value', () => {
    const { bar } = makeTabBar();
    bar.setByValue('nonexistent');
    expect(bar.currentIndex()).toBe(0); // unchanged
  });

  test('length() returns tab count', () => {
    const { bar } = makeTabBar();
    expect(bar.length()).toBe(TABS.length);
  });
});

describe('TabBar — render', () => {
  test('active tab text is rendered', () => {
    const { bar, canvas } = makeTabBar();
    canvas.beginFrame();
    bar.render(canvas, 0, 0);
    expect(canvas.hasText('orders')).toBe(true);
  });

  test('inactive tabs are also rendered', () => {
    const { bar, canvas } = makeTabBar();
    canvas.beginFrame();
    bar.render(canvas, 0, 0);
    const row = canvas.row(0);
    expect(row).toContain('users');
    expect(row).toContain('products');
  });

  test('after next(), second tab becomes active', () => {
    const { bar, canvas } = makeTabBar();
    bar.next();
    canvas.beginFrame();
    bar.render(canvas, 0, 0);
    expect(canvas.hasText('users')).toBe(true);
  });

  test('labelFn transforms displayed labels', () => {
    const { bar, canvas } = makeTabBar();
    canvas.beginFrame();
    bar.render(canvas, 0, 0, (t) => t.toUpperCase());
    expect(canvas.hasText('ORDERS')).toBe(true);
    expect(canvas.hasText('USERS')).toBe(true);
  });
});
