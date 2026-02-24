import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import { getTheme } from '../core/Theme.js';

export class FilterBar {
  private active = false;
  private text = '';

  isActive(): boolean { return this.active; }
  getText(): string { return this.text; }
  hasFilter(): boolean { return this.text.length > 0; }

  activate(): void {
    this.active = true;
    this.text = '';
  }

  clear(): void {
    this.active = false;
    this.text = '';
  }

  handleKey(key: string): boolean {
    if (!this.active) return false;
    if (key === '\u001b') { this.active = false; return true; }
    if (key === '\u007f' || key === '\b') { this.text = this.text.slice(0, -1); return true; }
    if (key.length === 1 && key >= ' ') { this.text += key; return true; }
    return true;
  }

  render(canvas: ITerminalCanvas, y: number): void {
    const { cols } = canvas.getSize();
    const t = getTheme();

    if (this.active) {
      // Animated block cursor
      const cursor = Math.floor(Date.now() / 250) % 2 === 0 ? '▍' : '▊';
      const prefix = '@ / ';
      canvas.write(0, y, prefix, { color: t.palette.accent, bold: true });
      canvas.write(prefix.length, y, this.text + cursor, t.s.filterInput);
      const hint = '[Esc] cancel';
      canvas.write(cols - hint.length - 1, y, hint, t.s.muted);
    } else if (this.text) {
      const indicator = `@ [/${this.text}]`;
      canvas.write(0, y, indicator, t.s.filterLabel);
      canvas.write(indicator.length + 1, y, '[Esc] clear', t.s.muted);
    }
  }
}
