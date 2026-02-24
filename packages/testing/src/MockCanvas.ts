import type { ITerminalCanvas, TextStyle } from '@tfsdc/ui-tui';

interface CellData {
  text: string;
  style?: TextStyle;
}

/**
 * In-memory ITerminalCanvas for unit tests.
 * Records every write() call so tests can assert rendered output
 * without a real terminal.
 *
 * Usage:
 *   const canvas = new MockCanvas();
 *   scene.render(canvas);
 *   expect(canvas.hasText('FAILED')).toBe(true);
 *   expect(canvas.styleAt(canvas.findText('DONE')!)).toMatchObject({ color: 'green' });
 */
export class MockCanvas implements ITerminalCanvas {
  private cells = new Map<string, CellData>();
  private readonly _cols: number;
  private readonly _rows: number;

  constructor(cols = 120, rows = 40) {
    this._cols = cols;
    this._rows = rows;
  }

  // ── ITerminalCanvas ────────────────────────────────────
  beginFrame(): void { this.cells.clear(); }
  endFrame(): void {}
  clear(): void { this.cells.clear(); }
  enterAltScreen(): void {}
  leaveAltScreen(): void {}

  write(x: number, y: number, text: string, style?: TextStyle): void {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch !== undefined) {
        this.cells.set(`${x + i},${y}`, { text: ch, style });
      }
    }
  }

  getSize(): { cols: number; rows: number } {
    return { cols: this._cols, rows: this._rows };
  }

  // ── Test helpers ───────────────────────────────────────

  /** Get the character at (x, y). Returns ' ' for empty cells. */
  at(x: number, y: number): string {
    return this.cells.get(`${x},${y}`)?.text ?? ' ';
  }

  /** Get the style applied at (x, y). */
  styleAt(x: number, y: number): TextStyle | undefined {
    return this.cells.get(`${x},${y}`)?.style;
  }

  /** Reconstruct the text content of row y as a string. */
  row(y: number): string {
    let maxX = -1;
    for (const key of this.cells.keys()) {
      const [, yStr] = key.split(',');
      if (Number(yStr) === y) {
        const xVal = Number(key.split(',')[0]);
        if (xVal > maxX) maxX = xVal;
      }
    }
    let result = '';
    for (let x = 0; x <= maxX; x++) {
      result += this.cells.get(`${x},${y}`)?.text ?? ' ';
    }
    return result;
  }

  /** Returns true if the given text appears anywhere on the canvas. */
  hasText(text: string): boolean {
    for (let y = 0; y < this._rows; y++) {
      if (this.row(y).includes(text)) return true;
    }
    return false;
  }

  /**
   * Returns the top-left position of the first occurrence of `text`.
   * Returns null if not found.
   */
  findText(text: string): { x: number; y: number } | null {
    for (let y = 0; y < this._rows; y++) {
      const x = this.row(y).indexOf(text);
      if (x >= 0) return { x, y };
    }
    return null;
  }

  /** Debug helper: dump all non-empty rows as a string. */
  dump(): string {
    const lines: string[] = [];
    for (let y = 0; y < this._rows; y++) {
      const r = this.row(y).trimEnd();
      if (r) lines.push(`${String(y).padStart(2)}: ${r}`);
    }
    return lines.join('\n');
  }
}
