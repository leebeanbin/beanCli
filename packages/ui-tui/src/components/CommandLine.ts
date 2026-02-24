import type { ITerminalCanvas } from '../core/TerminalCanvas.js';

export interface QueryResultData {
  type: 'query' | 'dml' | 'ddl' | 'other';
  rows?: Record<string, unknown>[];
  rowCount?: number;
  columns?: string[];
  message?: string;
  error?: string;
}

export type CommandResult =
  | { type: 'execute'; sql: string }
  | { type: 'ai-query'; prompt: string; actor: string; role: string; environment: string }
  | { type: 'execute-prefill' }
  | { type: 'quit' }
  | { type: 'cancel' };

export interface CommandLineOptions {
  actor?: string;
  role?: string;
  environment?: string;
}

type InputMode = 'sql' | 'ai';

export class CommandLine {
  private active = false;
  private input = '';
  private mode: InputMode = 'sql';
  private feedback = '';
  private feedbackStyle: 'ok' | 'err' | 'info' = 'info';
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSql = '';

  private queryResult: QueryResultData | null = null;
  private resultScrollOffset = 0;
  private resultVisible = false;

  private sqlHistory: string[] = [];
  private historyIndex = -1;

  private opts: Required<CommandLineOptions> = {
    actor: 'cli-user',
    role: 'DBA',
    environment: 'DEV',
  };

  configure(opts: CommandLineOptions): void {
    if (opts.actor) this.opts.actor = opts.actor;
    if (opts.role) this.opts.role = opts.role;
    if (opts.environment) this.opts.environment = opts.environment;
  }

  isActive(): boolean { return this.active; }
  isResultVisible(): boolean { return this.resultVisible; }

  activate(mode: InputMode = 'sql'): void {
    this.active = true;
    this.mode = mode;
    this.input = '';
    this.historyIndex = -1;
  }

  activateWithPrefill(sql: string): void {
    this.active = true;
    this.mode = 'sql';
    this.input = sql;
    this.historyIndex = -1;
  }

  setPendingSql(sql: string): void {
    this.pendingSql = sql;
  }

  getPendingSql(): string { return this.pendingSql; }
  clearPendingSql(): void { this.pendingSql = ''; }

  handleKey(key: string): CommandResult | null {
    if (this.resultVisible) {
      return this.handleResultKey(key);
    }

    if (!this.active) return null;

    if (key === '\u001b') {
      this.active = false;
      this.input = '';
      return { type: 'cancel' };
    }

    if (key === '\u001b[A' && this.mode === 'sql') {
      if (this.sqlHistory.length > 0) {
        if (this.historyIndex < this.sqlHistory.length - 1) {
          this.historyIndex++;
          this.input = this.sqlHistory[this.sqlHistory.length - 1 - this.historyIndex];
        }
      }
      return null;
    }

    if (key === '\u001b[B' && this.mode === 'sql') {
      if (this.historyIndex > 0) {
        this.historyIndex--;
        this.input = this.sqlHistory[this.sqlHistory.length - 1 - this.historyIndex];
      } else {
        this.historyIndex = -1;
        this.input = '';
      }
      return null;
    }

    if (key === '\r' || key === '\n') {
      const cmd = this.input.trim();
      this.active = false;
      this.input = '';

      if (!cmd) return { type: 'cancel' };
      if (cmd === ':q' || cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
        return { type: 'quit' };
      }

      if (this.mode === 'ai') {
        return {
          type: 'ai-query',
          prompt: cmd,
          actor: this.opts.actor,
          role: this.opts.role,
          environment: this.opts.environment,
        };
      }

      if (this.sqlHistory[this.sqlHistory.length - 1] !== cmd) {
        this.sqlHistory.push(cmd);
        if (this.sqlHistory.length > 100) this.sqlHistory.shift();
      }

      return { type: 'execute', sql: cmd };
    }

    if (key === '\u007f' || key === '\b') {
      this.input = this.input.slice(0, -1);
      return null;
    }

    if (key.length === 1 && key >= ' ') {
      this.input += key;
    }

    return null;
  }

  private handleResultKey(key: string): CommandResult | null {
    if (key === '\u001b' || key === 'q') {
      this.resultVisible = false;
      this.queryResult = null;
      return { type: 'cancel' };
    }
    if (key === '\u001b[A' || key === 'up' || key === 'k') {
      this.resultScrollOffset = Math.max(0, this.resultScrollOffset - 1);
      return null;
    }
    if (key === '\u001b[B' || key === 'down' || key === 'j') {
      this.resultScrollOffset++;
      return null;
    }
    if (key === '\u001b[5~' || key === 'pageup') {
      this.resultScrollOffset = Math.max(0, this.resultScrollOffset - 10);
      return null;
    }
    if (key === '\u001b[6~' || key === 'pagedown') {
      this.resultScrollOffset += 10;
      return null;
    }
    if (key === ':') {
      this.resultVisible = false;
      this.queryResult = null;
      this.activate('sql');
      return null;
    }
    return null;
  }

  showQueryResult(result: QueryResultData): void {
    this.queryResult = result;
    this.resultScrollOffset = 0;

    if (result.error) {
      this.showFeedback(`! ${result.error}`, 'err', 8000);
      this.resultVisible = false;
    } else if (result.type === 'query' && result.rows && result.rows.length > 0) {
      this.resultVisible = true;
      this.feedback = '';
    } else {
      const msg = result.message ?? `${result.rowCount ?? 0} row(s) affected`;
      this.showFeedback(`+ ${msg}`, 'ok', 5000);
      this.resultVisible = false;
    }
  }

  showFeedback(message: string, style: 'ok' | 'err' | 'info' = 'info', ms = 3000): void {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.feedback = message;
    this.feedbackStyle = style;
    this.feedbackTimer = setTimeout(() => { this.feedback = ''; }, ms);
  }

  showAiSqlResult(sql: string, explanation?: string): void {
    this.pendingSql = sql;
    const preview = sql.length > 50 ? sql.slice(0, 50) + '...' : sql;
    const msg = explanation
      ? `AI: ${preview}  [: to edit+execute]`
      : `AI SQL: ${preview}  [: to edit+execute]`;
    this.showFeedback(msg, 'ok', 15000);
  }

  render(canvas: ITerminalCanvas): void {
    const { cols, rows } = canvas.getSize();

    if (this.resultVisible && this.queryResult?.rows) {
      this.renderResultOverlay(canvas, cols, rows);
      return;
    }

    const y = rows - 1;

    if (this.active) {
      const prefix = this.mode === 'ai' ? '? ' : ':';
      const prefixColor = this.mode === 'ai' ? 'magenta' : 'cyan';
      const inputDisplay = this.input + '▍';
      const maxInputLen = cols - 35;
      const shown = inputDisplay.length > maxInputLen
        ? inputDisplay.slice(inputDisplay.length - maxInputLen)
        : inputDisplay;
      const prompt = `${prefix}${shown}`;

      canvas.write(0, y, prompt, { color: prefixColor, bold: true });

      const hint = this.mode === 'ai'
        ? '[Enter] ask  [Esc] cancel'
        : '[Enter] execute  [↑↓] history  [Esc] cancel';
      if (cols - hint.length - 1 > prompt.length) {
        canvas.write(cols - hint.length - 1, y, hint, { color: '#e5e7eb' });
      }
      return;
    }

    if (this.feedback) {
      const colorMap = { ok: 'green', err: 'red', info: 'yellow' } as const;
      canvas.write(1, y, this.feedback, { color: colorMap[this.feedbackStyle], bold: true });
    }
  }

  private renderResultOverlay(canvas: ITerminalCanvas, cols: number, rows: number): void {
    const result = this.queryResult;
    if (!result?.rows?.length || !result.columns?.length) return;

    const dbRows = result.rows;
    const dbCols = result.columns;

    const colWidths: number[] = dbCols.map(c => c.length);
    for (const row of dbRows) {
      for (let i = 0; i < dbCols.length; i++) {
        const val = String(row[dbCols[i]] ?? '');
        colWidths[i] = Math.min(Math.max(colWidths[i], val.length), 30);
      }
    }

    const availWidth = cols - 4;
    let totalWidth = colWidths.reduce((s, w) => s + w + 3, 1);
    if (totalWidth > availWidth) {
      const scale = availWidth / totalWidth;
      for (let i = 0; i < colWidths.length; i++) {
        colWidths[i] = Math.max(3, Math.floor(colWidths[i] * scale));
      }
      totalWidth = colWidths.reduce((s, w) => s + w + 3, 1);
    }

    const headerHeight = 3;
    const footerHeight = 2;
    const dataAreaHeight = rows - headerHeight - footerHeight;
    const maxScroll = Math.max(0, dbRows.length - dataAreaHeight);
    if (this.resultScrollOffset > maxScroll) this.resultScrollOffset = maxScroll;

    const buildTableRow = (cells: string[], widths: number[]): string => {
      return '│' + cells.map((c, i) => ` ${c.slice(0, widths[i]).padEnd(widths[i])} `).join('│') + '│';
    };
    const buildSep = (left: string, mid: string, right: string, widths: number[]): string => {
      return left + widths.map(w => '─'.repeat(w + 2)).join(mid) + right;
    };

    let y = 0;

    const info = `${result.rowCount ?? dbRows.length} rows │ ↑↓ scroll │ Esc/q close │ : new query`;
    canvas.write(1, y, info, { color: '#67e8f9', bold: true });
    y++;

    canvas.write(1, y, buildSep('┌', '┬', '┐', colWidths), { color: '#67e8f9' });
    y++;
    canvas.write(1, y, buildTableRow(dbCols, colWidths), { color: '#67e8f9', bold: true });
    y++;

    const visibleRows = dbRows.slice(this.resultScrollOffset, this.resultScrollOffset + dataAreaHeight);

    for (let i = 0; i < visibleRows.length && y < rows - footerHeight; i++) {
      if (i === 0) {
        canvas.write(1, y, buildSep('├', '┼', '┤', colWidths), { color: '#67e8f9' });
        y++;
      }
      const row = visibleRows[i];
      const cells = dbCols.map(c => {
        const val = String(row[c] ?? '');
        return val;
      });
      canvas.write(1, y, buildTableRow(cells, colWidths), { color: '#e5e7eb' });
      y++;
    }

    if (y < rows - 1) {
      canvas.write(1, y, buildSep('└', '┴', '┘', colWidths), { color: '#67e8f9' });
      y++;
    }

    if (dbRows.length > dataAreaHeight) {
      const pct = Math.round(((this.resultScrollOffset + dataAreaHeight) / dbRows.length) * 100);
      const scrollInfo = `rows ${this.resultScrollOffset + 1}-${Math.min(this.resultScrollOffset + dataAreaHeight, dbRows.length)} of ${dbRows.length} (${pct}%)`;
      canvas.write(1, rows - 1, scrollInfo, { color: '#e5e7eb' });
    }
  }
}
