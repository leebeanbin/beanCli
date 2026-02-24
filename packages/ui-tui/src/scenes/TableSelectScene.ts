import type { IScene, SceneContext } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import { getTheme } from '../core/Theme.js';

export interface TableMeta {
  name: string;
  rowEstimate: number;
  sizeBytes: number;
  sizeHuman: string;
}

function miniBar(sizeBytes: number, maxBytes: number, width = 10): string {
  const filled = maxBytes > 0 ? Math.round((sizeBytes / maxBytes) * width) : 0;
  return '▐' + '█'.repeat(filled) + '░'.repeat(width - filled) + '▌';
}

function fmtRows(n: number): string {
  if (n < 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export class TableSelectScene implements IScene {
  readonly name = 'table-select';

  private tables: TableMeta[] = [];
  private selected: Set<string> = new Set();
  private cursorIdx = 0;
  private filterText = '';
  private filterActive = false;
  private loading = true;
  private onConfirmCb?: (tables: string[]) => void;

  setOnConfirm(cb: (tables: string[]) => void): void {
    this.onConfirmCb = cb;
  }

  setTables(tables: TableMeta[]): void {
    this.tables = tables;
    this.loading = false;
    // Pre-select tables whose name starts with state_
    this.selected = new Set(tables.filter(t => t.name.startsWith('state_')).map(t => t.name));
    this.cursorIdx = 0;
  }

  private filteredTables(): TableMeta[] {
    if (!this.filterText) return this.tables;
    const lower = this.filterText.toLowerCase();
    return this.tables.filter(t => t.name.toLowerCase().includes(lower));
  }

  render(canvas: ITerminalCanvas): void {
    const { cols, rows } = canvas.getSize();
    const t = getTheme();
    const filtered = this.filteredTables();
    const maxBytes = this.tables.reduce((m, tbl) => Math.max(m, tbl.sizeBytes), 1);

    // Layout: centered box
    const boxW = Math.min(cols - 4, 74);
    const boxX = Math.max(0, Math.floor((cols - boxW) / 2));
    const maxVisible = Math.max(4, rows - 10);
    const contentH = this.loading ? 1 : Math.min(filtered.length, maxVisible);
    const boxH = contentH + 6; // title + sep + rows + sep + hints + bottom
    const boxY = Math.max(0, Math.floor((rows - boxH) / 2));

    // ── Top border ──────────────────────────────────────
    canvas.write(boxX, boxY, '╔' + '═'.repeat(boxW - 2) + '╗', t.s.border);

    // ── Title row ────────────────────────────────────────
    const titleText = '  DATABASE TABLES  ◉ postgres@localhost:5432/tfsdc';
    canvas.write(boxX, boxY + 1, '║', t.s.border);
    canvas.write(boxX + 1, boxY + 1, titleText.slice(0, boxW - 2).padEnd(boxW - 2), t.s.brand);
    canvas.write(boxX + boxW - 1, boxY + 1, '║', t.s.border);

    // ── Separator ────────────────────────────────────────
    canvas.write(boxX, boxY + 2, '╠' + '═'.repeat(boxW - 2) + '╣', t.s.border);

    if (this.loading) {
      // Loading state
      canvas.write(boxX, boxY + 3, '║', t.s.border);
      canvas.write(boxX + 1, boxY + 3, '  Loading tables...'.padEnd(boxW - 2), t.s.pixelLoading);
      canvas.write(boxX + boxW - 1, boxY + 3, '║', t.s.border);
    } else if (filtered.length === 0) {
      canvas.write(boxX, boxY + 3, '║', t.s.border);
      canvas.write(boxX + 1, boxY + 3, '  No tables found.'.padEnd(boxW - 2), t.s.muted);
      canvas.write(boxX + boxW - 1, boxY + 3, '║', t.s.border);
    } else {
      // Scrolling window
      const half = Math.floor(maxVisible / 2);
      const visStart = Math.max(0, Math.min(this.cursorIdx - half, filtered.length - maxVisible));
      const visEnd = Math.min(filtered.length, visStart + maxVisible);

      for (let i = visStart; i < visEnd; i++) {
        const tbl = filtered[i]!;
        const isCursor = i === this.cursorIdx;
        const isSelected = this.selected.has(tbl.name);
        const rowY = boxY + 3 + (i - visStart);

        canvas.write(boxX, rowY, '║', t.s.border);

        const cursor = isCursor ? '▶' : ' ';
        const check = isSelected ? '[✓]' : '[ ]';
        const bar = miniBar(tbl.sizeBytes, maxBytes);
        const rowsStr = fmtRows(tbl.rowEstimate).padStart(7);
        const nameCol = tbl.name.padEnd(22).slice(0, 22);
        const rowContent = ` ${cursor} ${check} ${nameCol} ${bar}  ${rowsStr} rows  ${tbl.sizeHuman.padEnd(6)}`;

        const style = isCursor
          ? t.s.pixelSelected
          : (isSelected ? t.s.rowSelected : t.s.pixelUnselected);

        canvas.write(boxX + 1, rowY, rowContent.slice(0, boxW - 2).padEnd(boxW - 2), style);
        canvas.write(boxX + boxW - 1, rowY, '║', t.s.border);
      }

      // Fill empty rows below table list
      for (let i = visEnd - visStart; i < maxVisible; i++) {
        const rowY = boxY + 3 + i;
        canvas.write(boxX, rowY, '║', t.s.border);
        canvas.write(boxX + 1, rowY, ' '.repeat(boxW - 2), t.s.text);
        canvas.write(boxX + boxW - 1, rowY, '║', t.s.border);
      }
    }

    // ── Hint separator ───────────────────────────────────
    const hintY = boxY + 3 + contentH;
    canvas.write(boxX, hintY, '╠' + '═'.repeat(boxW - 2) + '╣', t.s.border);

    // ── Hints row ────────────────────────────────────────
    canvas.write(boxX, hintY + 1, '║', t.s.border);
    const hints = this.filterActive
      ? `  / ${this.filterText}▍  Enter apply filter  Esc clear`
      : '  ↑/↓ Navigate  Space Select  / Filter  Enter Confirm  g/G Top/Bot';
    canvas.write(boxX + 1, hintY + 1, hints.slice(0, boxW - 2).padEnd(boxW - 2), t.s.hintText);
    canvas.write(boxX + boxW - 1, hintY + 1, '║', t.s.border);

    // ── Bottom border ────────────────────────────────────
    canvas.write(boxX, hintY + 2, '╚' + '═'.repeat(boxW - 2) + '╝', t.s.border);

    // ── Selection count ──────────────────────────────────
    const count = this.selected.size;
    const countMsg = count === 0
      ? 'No tables selected — press Space to select'
      : `${count} table${count !== 1 ? 's' : ''} selected`;
    const countX = Math.max(0, Math.floor((cols - countMsg.length) / 2));
    canvas.write(countX, hintY + 3, countMsg, count > 0 ? t.s.accent : t.s.muted);
  }

  onKeyPress(key: string): void {
    if (this.filterActive) {
      if (key === '\u001b') {
        this.filterActive = false;
        this.filterText = '';
      } else if (key === '\r' || key === '\n') {
        this.filterActive = false;
      } else if (key === '\u007f' || key === '\b') {
        this.filterText = this.filterText.slice(0, -1);
      } else if (key.length === 1 && key >= ' ') {
        this.filterText += key;
      }
      this.cursorIdx = 0;
      return;
    }

    const filtered = this.filteredTables();

    switch (key) {
      case 'up':
      case 'k':
        this.cursorIdx = Math.max(0, this.cursorIdx - 1);
        break;
      case 'down':
      case 'j':
        this.cursorIdx = Math.min(Math.max(0, filtered.length - 1), this.cursorIdx + 1);
        break;
      case 'g':
        this.cursorIdx = 0;
        break;
      case 'G':
        this.cursorIdx = Math.max(0, filtered.length - 1);
        break;
      case ' ': {
        const tbl = filtered[this.cursorIdx];
        if (tbl) {
          if (this.selected.has(tbl.name)) {
            this.selected.delete(tbl.name);
          } else {
            this.selected.add(tbl.name);
          }
        }
        break;
      }
      case '/':
        this.filterActive = true;
        this.filterText = '';
        break;
      case '\u001b':
        this.filterText = '';
        break;
      case '\r':
      case '\n': {
        const selectedTables = Array.from(this.selected);
        if (selectedTables.length > 0) {
          this.onConfirmCb?.(selectedTables);
        }
        break;
      }
    }
  }

  onSlowFrame(_durationMs: number): void {}

  getContext(): SceneContext {
    return {
      scene: 'table-select',
      summary: 'Select database tables to explore',
      details: { selected: Array.from(this.selected), total: this.tables.length },
    };
  }
}
