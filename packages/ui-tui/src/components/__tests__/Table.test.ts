import { Table } from '../Table.js';
import { MockCanvas } from '@tfsdc/testing';
import { getTheme } from '../../core/Theme.js';

const COLS = [
  { key: 'id', label: 'ID', width: 8 },
  { key: 'status', label: 'Status', width: 12 },
];

const ROWS = [
  { id: 'a1', status: 'DONE' },
  { id: 'b2', status: 'FAILED' },
  { id: 'c3', status: 'PENDING' },
  { id: 'd4', status: 'EXECUTING' },
];

const REGION = { x: 0, y: 0, width: 80, height: 20 };

function makeTable() {
  return { table: new Table(), canvas: new MockCanvas(80, 40) };
}

describe('Table — rendering', () => {
  test('renders all rows when no filter', () => {
    const { table, canvas } = makeTable();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    expect(canvas.hasText('DONE')).toBe(true);
    expect(canvas.hasText('FAILED')).toBe(true);
    expect(canvas.hasText('PENDING')).toBe(true);
  });

  test('renders column headers', () => {
    const { table, canvas } = makeTable();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    expect(canvas.hasText('ID')).toBe(true);
    expect(canvas.hasText('Status')).toBe(true);
  });

  test('DONE cell uses theme statusOk color when not selected', () => {
    const t = getTheme();
    const { table, canvas } = makeTable();
    table.moveDown(ROWS.length);
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    const pos = canvas.findText('DONE');
    expect(pos).not.toBeNull();
    expect(canvas.styleAt(pos!.x, pos!.y)?.color).toBe(t.palette.success);
  });

  test('FAILED cell uses theme statusErr color when not selected', () => {
    const t = getTheme();
    const { table, canvas } = makeTable();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    const pos = canvas.findText('FAILED');
    expect(pos).not.toBeNull();
    expect(canvas.styleAt(pos!.x, pos!.y)?.color).toBe(t.palette.error);
  });

  test('PENDING cell uses theme statusWarn color when not selected', () => {
    const t = getTheme();
    const { table, canvas } = makeTable();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    const pos = canvas.findText('PENDING');
    expect(pos).not.toBeNull();
    expect(canvas.styleAt(pos!.x, pos!.y)?.color).toBe(t.palette.warning);
  });

  test('selection marker > appears on selected row', () => {
    const { table, canvas } = makeTable();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    expect(canvas.hasText('>')).toBe(true);
  });
});

describe('Table — navigation', () => {
  test('initial selection is row 0', () => {
    const { table } = makeTable();
    expect(table.getSelectedIndex()).toBe(0);
  });

  test('moveDown increments selectedIndex', () => {
    const { table, canvas } = makeTable();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    table.moveDown(ROWS.length);
    expect(table.getSelectedIndex()).toBe(1);
  });

  test('moveDown stops at last row', () => {
    const { table, canvas } = makeTable();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    for (let i = 0; i < 10; i++) table.moveDown(ROWS.length);
    expect(table.getSelectedIndex()).toBe(ROWS.length - 1);
  });

  test('moveUp stops at 0', () => {
    const { table, canvas } = makeTable();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    table.moveUp();
    expect(table.getSelectedIndex()).toBe(0);
  });

  test('moveDown scrolls viewport when row exits visible area', () => {
    const { table, canvas } = makeTable();
    const smallRegion = { x: 0, y: 0, width: 80, height: 3 };
    canvas.beginFrame();
    table.render(canvas, smallRegion, COLS, ROWS);
    table.moveDown(ROWS.length);
    table.moveDown(ROWS.length);
    table.moveDown(ROWS.length);
    canvas.beginFrame();
    table.render(canvas, smallRegion, COLS, ROWS);
    expect(table.getSelectedIndex()).toBe(3);
    expect(canvas.hasText('d4')).toBe(true);
  });

  test('movePageDown jumps by visible height', () => {
    const { table, canvas } = makeTable();
    // height 6 → lastVisibleHeight = 4 (6 - header - separator), page jump ≥ 2
    const smallRegion = { x: 0, y: 0, width: 80, height: 6 };
    canvas.beginFrame();
    table.render(canvas, smallRegion, COLS, ROWS);
    table.movePageDown(ROWS.length);
    expect(table.getSelectedIndex()).toBeGreaterThan(1);
  });

  test('movePageUp from bottom returns toward top', () => {
    const { table, canvas } = makeTable();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    for (let i = 0; i < 10; i++) table.moveDown(ROWS.length);
    table.movePageUp();
    expect(table.getSelectedIndex()).toBeLessThan(ROWS.length - 1);
  });

  test('moveLeft/moveRight navigates columns', () => {
    const { table, canvas } = makeTable();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    expect(table.getSelectedCol()).toBe(0);
    table.moveRight();
    expect(table.getSelectedCol()).toBe(1);
    table.moveLeft();
    expect(table.getSelectedCol()).toBe(0);
  });

  test('goToRow navigates to target row', () => {
    const { table, canvas } = makeTable();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    const ok = table.goToRow(2, ROWS.length);
    expect(ok).toBe(true);
    expect(table.getSelectedIndex()).toBe(2);
  });
});

describe('Table — filter', () => {
  test('filter hides non-matching rows', () => {
    const { table, canvas } = makeTable();
    table.setFilter('fail');
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    expect(canvas.hasText('FAILED')).toBe(true);
    expect(canvas.hasText('DONE')).toBe(false);
  });

  test('filter is case-insensitive', () => {
    const { table, canvas } = makeTable();
    table.setFilter('PEND');
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    expect(canvas.hasText('PENDING')).toBe(true);
  });

  test('clearFilter restores all rows', () => {
    const { table, canvas } = makeTable();
    table.setFilter('fail');
    table.clearFilter();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    expect(canvas.hasText('DONE')).toBe(true);
    expect(canvas.hasText('FAILED')).toBe(true);
    expect(canvas.hasText('PENDING')).toBe(true);
  });

  test('filter resets selectedIndex to 0', () => {
    const { table, canvas } = makeTable();
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    table.moveDown(ROWS.length);
    table.moveDown(ROWS.length);
    table.setFilter('done');
    expect(table.getSelectedIndex()).toBe(0);
  });

  test('empty filter result shows no-match message', () => {
    const { table, canvas } = makeTable();
    table.setFilter('xyznotexist');
    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    expect(canvas.hasText('No matches')).toBe(true);
  });
});

describe('Table — formatting and style consistency', () => {
  test('format callback receives full row context', () => {
    const table = new Table();
    const canvas = new MockCanvas(80, 20);
    const columns = [
      {
        key: 'amount_cents',
        label: 'Amount',
        width: 16,
        format: (value: unknown, row?: Record<string, unknown>) => {
          const c = Number(value);
          const currency = String(row?.currency_code ?? 'USD');
          return `${(c / 100).toFixed(2)} ${currency}`;
        },
      },
    ];
    const rows = [{ amount_cents: 9900, currency_code: 'KRW' }];

    canvas.beginFrame();
    table.render(canvas, REGION, columns, rows);
    expect(canvas.hasText('99.00 KRW')).toBe(true);
  });

  test('selected header style avoids hard black foreground', () => {
    const table = new Table();
    const canvas = new MockCanvas(80, 20);

    canvas.beginFrame();
    table.render(canvas, REGION, COLS, ROWS);
    const pos = canvas.findText('ID');
    expect(pos).not.toBeNull();
    expect(canvas.styleAt(pos!.x, pos!.y)?.color).not.toBe('#000000');
  });
});
