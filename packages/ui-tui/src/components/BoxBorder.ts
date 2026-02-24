import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import type { Region } from '../core/Layout.js';
import type { TextStyle } from '../core/TerminalCanvas.js';
import { getTheme } from '../core/Theme.js';

export class BoxBorder {
  render(canvas: ITerminalCanvas, region: Region, style?: TextStyle): void {
    const { x, y, width, height } = region;
    if (width < 2 || height < 2) return;

    const s = style ?? getTheme().s.border;
    canvas.write(x, y, '╔' + '═'.repeat(width - 2) + '╗', s);
    canvas.write(x, y + height - 1, '╚' + '═'.repeat(width - 2) + '╝', s);

    for (let row = 1; row < height - 1; row++) {
      canvas.write(x, y + row, '║', s);
      canvas.write(x + width - 1, y + row, '║', s);
    }
  }

  static hLine(canvas: ITerminalCanvas, y: number, style?: TextStyle): void {
    const { cols } = canvas.getSize();
    const s = style ?? getTheme().s.border;
    canvas.write(0, y, '─'.repeat(cols), s);
  }
}
