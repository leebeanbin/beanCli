import type { IScene } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import { Table } from '../components/Table.js';
import type { TableColumn } from '../components/Table.js';
import { FilterBar } from '../components/FilterBar.js';
import { HintBar } from '../components/HintBar.js';
import { SectionHeader } from '../components/SectionHeader.js';
import { getTheme, fmtTimestamp } from '../core/Theme.js';

const CATEGORIES = ['ALL', 'AUTH', 'CHANGE', 'APPROVAL', 'SYSTEM'] as const;

// Color per category
const CATEGORY_COLORS: Record<string, string> = {
  ALL:      '#a78bfa',  // brand
  AUTH:     '#f87171',  // error/red
  CHANGE:   '#fbbf24',  // warning/amber
  APPROVAL: '#4ade80',  // success/green
  SYSTEM:   '#67e8f9',  // info/cyan
};

const COLUMNS: TableColumn[] = [
  { key: 'time', label: 'Time', width: 10 },
  { key: 'category', label: 'Category', width: 12 },
  { key: 'actor', label: 'Actor', width: 14, flex: 1 },
  { key: 'action', label: 'Action', width: 22, flex: 2 },
  { key: 'result', label: 'Result', width: 8 },
];

export class AuditScene implements IScene {
  readonly name = 'audit';

  private readonly header = new SectionHeader('[AUDIT] Audit Log');
  private readonly table = new Table();
  private readonly filterBar = new FilterBar();
  private readonly hintBar = new HintBar('↑/↓ Navigate  f Category  / Filter  : SQL  ? AI  Esc Clear');

  private logs: Record<string, unknown>[] = [];
  private categoryIdx = 0;

  setLogs(logs: Record<string, unknown>[]): void {
    this.logs = logs.map(log => ({
      ...log,
      time: fmtTimestamp(log['created_at'], 'time'),
      // Neon result badge
      result: log['result'] === 'SUCCESS' ? '+ OK' : '! FAIL',
    }));
  }

  render(canvas: ITerminalCanvas): void {
    const { cols, rows } = canvas.getSize();
    const t = getTheme();
    const visible = this.visibleLogs();
    const currentCat = CATEGORIES[this.categoryIdx] ?? 'ALL';

    this.header.render(canvas, 1, `${visible.length} entries`);

    // ── Custom category tab bar with neon colors ─────────
    let tabX = 1;
    for (let i = 0; i < CATEGORIES.length; i++) {
      const cat = CATEGORIES[i]!;
      const isActive = i === this.categoryIdx;
      const color = CATEGORY_COLORS[cat] ?? t.palette.brand;

      if (i > 0) {
        canvas.write(tabX, 2, ' │ ', t.s.borderDim);
        tabX += 3;
      }

      if (isActive) {
        canvas.write(tabX, 2, `> ${cat}`, { color, bold: true, underline: true });
        tabX += 2 + cat.length;
      } else {
        canvas.write(tabX, 2, cat, { color: t.palette.muted });
        tabX += cat.length;
      }
    }

    // Filter indicator next to tab bar
    if (this.filterBar.hasFilter() && !this.filterBar.isActive()) {
      canvas.write(tabX + 2, 2, `@ [/${this.filterBar.getText()}]`, t.s.filterLabel);
    }

    // Category accent line
    canvas.write(0, 3, '─'.repeat(cols), { color: CATEGORY_COLORS[currentCat] ?? t.palette.borderDim });

    this.table.render(
      canvas,
      { x: 0, y: 4, width: cols, height: rows - 6 },
      COLUMNS,
      visible,
    );

    if (this.filterBar.isActive() || this.filterBar.hasFilter()) {
      this.filterBar.render(canvas, rows - 2);
    } else {
      this.hintBar.render(canvas, rows - 2);
    }
  }

  onKeyPress(key: string): void {
    if (this.filterBar.handleKey(key)) {
      this.table.setFilter(this.filterBar.getText());
      return;
    }

    const visible = this.visibleLogs();
    switch (key) {
      case 'up':
      case 'k':    this.table.moveUp(); break;
      case 'down':
      case 'j':    this.table.moveDown(visible.length); break;
      case 'pageup':   this.table.movePageUp(); break;
      case 'pagedown': this.table.movePageDown(visible.length); break;
      case '/':        this.filterBar.activate(); break;
      case '\u001b':   this.filterBar.clear(); this.table.clearFilter(); break;
      case 'f':
        this.categoryIdx = (this.categoryIdx + 1) % CATEGORIES.length;
        this.table.reset();
        break;
    }
  }

  onSlowFrame(_durationMs: number): void {}

  private visibleLogs(): Record<string, unknown>[] {
    const cat = CATEGORIES[this.categoryIdx] ?? 'ALL';
    if (cat === 'ALL') return this.logs;
    return this.logs.filter(l => String(l['category'] ?? '').toUpperCase() === cat);
  }
}
