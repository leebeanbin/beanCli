import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import { getTheme } from '../core/Theme.js';

export class HintBar {
  private hints: string;

  constructor(hints: string) {
    this.hints = hints;
  }

  setHints(hints: string): void {
    this.hints = hints;
  }

  render(canvas: ITerminalCanvas, y: number): void {
    const { cols } = canvas.getSize();
    const t = getTheme();

    // Left accent bar
    canvas.write(0, y, '▌', { color: t.palette.brandAlt });

    const parts = this.hints.split('  ');
    let x = 2;

    for (let i = 0; i < parts.length; i++) {
      if (x >= cols - 6) break;

      const part = parts[i] ?? '';

      // Separator between hints
      if (i > 0) {
        canvas.write(x, y, ' · ', t.s.borderDim);
        x += 3;
      }

      const spaceIdx = part.indexOf(' ');
      if (spaceIdx > 0) {
        const keyText = part.slice(0, spaceIdx);
        const desc = part.slice(spaceIdx);
        const keyLabel = `[${keyText}]`;
        canvas.write(x, y, keyLabel, t.s.hintKey);
        x += keyLabel.length;
        canvas.write(x, y, desc, t.s.hintText);
        x += desc.length;
      } else {
        const keyLabel = `[${part}]`;
        canvas.write(x, y, keyLabel, t.s.hintKey);
        x += keyLabel.length;
      }
    }
  }
}
