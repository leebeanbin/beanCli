import type { IScene } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import { Table } from '../components/Table.js';
import type { TableColumn } from '../components/Table.js';
import { FilterBar } from '../components/FilterBar.js';
import { HintBar } from '../components/HintBar.js';
import { SectionHeader } from '../components/SectionHeader.js';
import { getTheme } from '../core/Theme.js';

const COLUMNS: TableColumn[] = [
  { key: 'short_id', label: 'ID', width: 10 },
  { key: 'status', label: 'Status', width: 14 },
  { key: 'target_table', label: 'Table', width: 16 },
  { key: 'environment', label: 'Env', width: 6 },
  { key: 'failure_reason', label: 'Failure Reason', width: 24, flex: 3 },
];

const SPINNER_FRAMES = ['|', '/', '-', '\\'] as const;

export class RecoveryScene implements IScene {
  readonly name = 'recovery';

  private readonly header = new SectionHeader('[RECOVERY] Failed Changes — DLQ');
  private readonly table = new Table();
  private readonly filterBar = new FilterBar();
  private readonly hintBar = new HintBar('↑/↓ Navigate  r Revert  / Filter  : SQL  ? AI  Esc Clear');

  private items: Record<string, unknown>[] = [];
  private message: string | null = null;
  private messageExpiry = 0;
  private reverting = false;
  private onReprocess?: (id: string) => Promise<void>;

  setItems(items: Record<string, unknown>[]): void {
    this.items = items.map(item => ({
      ...item,
      short_id: String(item['id'] ?? '').slice(0, 8),
    }));
  }

  setOnReprocess(cb: (id: string) => Promise<void>): void {
    this.onReprocess = cb;
  }

  render(canvas: ITerminalCanvas): void {
    const { cols, rows } = canvas.getSize();
    const t = getTheme();

    // ── Header — pulses when there are failures ──────────
    const hasItems = this.items.length > 0;
    const headerPulse = hasItems && Math.floor(Date.now() / 800) % 2 === 0;
    const headerStyle = headerPulse
      ? { color: t.palette.warning, bold: true }
      : undefined;
    const header = new SectionHeader('[RECOVERY] Failed Changes — DLQ', headerStyle);
    header.render(canvas, 1, `${this.items.length} items`);

    // ── Status message bar ───────────────────────────────
    if (this.message && Date.now() < this.messageExpiry) {
      const isSpinning = this.reverting;
      const isOk = this.message.startsWith('+');
      const isErr = this.message.startsWith('!');

      if (isSpinning) {
        const spinner = SPINNER_FRAMES[Math.floor(Date.now() / 120) % SPINNER_FRAMES.length] ?? '|';
        canvas.write(0, 2, ` ${spinner} `, { color: t.palette.accent, bold: true });
        canvas.write(3, 2, this.message.replace(/^[|/\-\\] ?/, ''), { color: t.palette.accent });
      } else {
        const msgColor = isOk ? t.palette.success : (isErr ? t.palette.error : t.palette.warning);
        const bracket = isOk ? '[ ' : isErr ? '[! ' : '[ ';
        canvas.write(0, 2, bracket, { color: msgColor, bold: true });
        canvas.write(bracket.length, 2, this.message, { color: msgColor, bold: true });
        canvas.write(bracket.length + this.message.length, 2, ' ]', { color: msgColor, bold: true });
      }
    } else if (this.filterBar.hasFilter() && !this.filterBar.isActive()) {
      canvas.write(0, 2, `@ [/${this.filterBar.getText()}]`, t.s.filterLabel);
    } else if (hasItems) {
      // DLQ warning banner — alternates
      const pulse = Math.floor(Date.now() / 700) % 2 === 0;
      const warningMsg = `!  ${this.items.length} failed change${this.items.length !== 1 ? 's' : ''} in DLQ — press [r] to revert selected`;
      canvas.write(0, 2, warningMsg, pulse ? t.s.error : t.s.warning);
    } else {
      canvas.write(0, 2, '+  DLQ is clear — no failed changes', t.s.success);
    }

    // ── Data table ───────────────────────────────────────
    this.table.render(
      canvas,
      { x: 0, y: 3, width: cols, height: rows - 5 },
      COLUMNS,
      this.items,
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

    switch (key) {
      case 'up':
      case 'k':    this.table.moveUp(); break;
      case 'down':
      case 'j':    this.table.moveDown(this.items.length); break;
      case 'pageup':   this.table.movePageUp(); break;
      case 'pagedown': this.table.movePageDown(this.items.length); break;
      case '/':        this.filterBar.activate(); break;
      case '\u001b':   this.filterBar.clear(); this.table.clearFilter(); break;
      case 'r':        this.triggerRevert(); break;
    }
  }

  onSlowFrame(_durationMs: number): void {}

  private triggerRevert(): void {
    const item = this.items[this.table.getSelectedIndex()];
    if (!item || !this.onReprocess) return;
    const id = String(item['id'] ?? '');
    const shortId = String(item['short_id'] ?? id.slice(0, 8));

    this.reverting = true;
    this.message = `Reverting ${shortId}...`;
    this.messageExpiry = Date.now() + 30_000;

    this.onReprocess(id)
      .then(() => {
        this.reverting = false;
        this.message = `+ Reverted ${shortId}`;
        this.messageExpiry = Date.now() + 4_000;
      })
      .catch((err: Error) => {
        this.reverting = false;
        this.message = `! ${err.message}`;
        this.messageExpiry = Date.now() + 5_000;
      });
  }
}
