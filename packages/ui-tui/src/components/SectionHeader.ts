import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import type { TextStyle } from '../core/TerminalCanvas.js';
import { getTheme } from '../core/Theme.js';

export class SectionHeader {
  constructor(
    private readonly prefix: string,
    private readonly style?: TextStyle,
  ) {}

  render(canvas: ITerminalCanvas, y: number, rightInfo?: string): void {
    const { cols } = canvas.getSize();
    const t = getTheme();
    const s = this.style ?? t.s.header;

    // ── Double accent bar ────────────────────────────────
    canvas.write(0, y, '▍', { color: t.palette.brandAlt });
    canvas.write(1, y, '▌', { color: t.palette.brand });

    // ── Scene title ──────────────────────────────────────
    canvas.write(3, y, this.prefix, s);

    const prefixEnd = 3 + this.prefix.length;

    if (rightInfo) {
      const badge = `[ ${rightInfo} ]`;
      const badgeX = cols - badge.length - 1;
      // Fill line between title and badge
      if (badgeX > prefixEnd + 2) {
        canvas.write(prefixEnd + 1, y, '─'.repeat(badgeX - prefixEnd - 2), t.s.borderDim);
      }
      canvas.write(badgeX, y, badge, t.s.accent);
    } else {
      // Fill to edge
      if (cols > prefixEnd + 2) {
        canvas.write(prefixEnd + 1, y, '─'.repeat(cols - prefixEnd - 2), t.s.borderDim);
      }
    }
  }
}
