import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import { getTheme, Icons } from '../core/Theme.js';

const LOGO_LINES = [
  '██████╗ ███████╗ █████╗ ███╗   ██╗ ██████╗██╗     ██╗',
  '██╔══██╗██╔════╝██╔══██╗████╗  ██║██╔════╝██║     ██║',
  '██████╔╝█████╗  ███████║██╔██╗ ██║██║     ██║     ██║',
  '██╔══██╗██╔══╝  ██╔══██║██║╚██╗██║██║     ██║     ██║',
  '██████╔╝███████╗██║  ██║██║ ╚████║╚██████╗███████╗██║',
  '╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝╚══════╝╚═╝',
];

const MOTTO = 'Streaming Data Console';
const VERSION = '1.0.0';

export class WelcomePanel {
  renderLogo(canvas: ITerminalCanvas, startY: number): number {
    const t = getTheme();
    const { cols } = canvas.getSize();

    for (let i = 0; i < LOGO_LINES.length; i++) {
      const line = LOGO_LINES[i];
      const x = Math.max(0, Math.floor((cols - line.length) / 2));
      canvas.write(x, startY + i, line, t.gradientStyle(i));
    }

    const subtitleY = startY + LOGO_LINES.length;
    const subtitle = `  ✦ ${MOTTO}  ·  v${VERSION}`;
    const subX = Math.max(0, Math.floor((cols - subtitle.length) / 2));
    canvas.write(subX, subtitleY, '  ✦ ', t.s.accent);
    canvas.write(subX + 4, subtitleY, MOTTO, { color: t.palette.dim, italic: true });
    canvas.write(subX + 4 + MOTTO.length, subtitleY, '  ·  ', t.s.muted);
    canvas.write(subX + 4 + MOTTO.length + 5, subtitleY, `v${VERSION}`, t.s.muted);

    return LOGO_LINES.length + 1;
  }

  renderInfoBox(
    canvas: ITerminalCanvas,
    startY: number,
    info: {
      model?: string;
      connectionStatus?: string;
      dbConnected?: boolean;
      messageCount?: number;
    },
  ): number {
    const t = getTheme();
    const { cols } = canvas.getSize();
    const boxWidth = Math.min(cols - 4, 72);
    const boxX = Math.max(0, Math.floor((cols - boxWidth) / 2));

    const topBorder = '┌' + '─'.repeat(boxWidth - 2) + '┐';
    const botBorder = '└' + '─'.repeat(boxWidth - 2) + '┘';
    canvas.write(boxX, startY, topBorder, t.s.border);

    let y = startY + 1;
    const innerW = boxWidth - 4;
    const halfW = Math.floor(innerW / 2);

    // Left column
    const modelStr = info.model ?? 'unknown';
    const statusStr = info.connectionStatus === 'connected' ? '* connected' : 'o disconnected';
    const statusColor = info.connectionStatus === 'connected' ? t.palette.success : t.palette.error;

    canvas.write(boxX, y, '│', t.s.border);
    canvas.write(boxX + boxWidth - 1, y, '│', t.s.border);
    canvas.write(boxX + 2, y, `${Icons.model} `, t.s.brand);
    canvas.write(boxX + 4, y, modelStr, t.s.text);
    canvas.write(boxX + 4 + modelStr.length, y, '  ·  ', t.s.muted);
    canvas.write(boxX + 9 + modelStr.length, y, statusStr, { color: statusColor, bold: true });

    // Right column (keyboard hints)
    const hintX = boxX + 2 + halfW;
    canvas.write(hintX, y, '/help', t.s.brand);
    canvas.write(hintX + 5, y, ' commands  ', t.s.dim);
    canvas.write(hintX + 16, y, '/sql', t.s.brand);
    canvas.write(hintX + 20, y, ' execute', t.s.dim);

    y++;
    canvas.write(boxX, y, '│', t.s.border);
    canvas.write(boxX + boxWidth - 1, y, '│', t.s.border);

    const dbStr = info.dbConnected ? '* DB connected' : '! DB offline';
    const dbColor = info.dbConnected ? t.palette.success : t.palette.error;
    canvas.write(boxX + 2, y, '💬 ', t.s.accent);
    canvas.write(boxX + 5, y, 'chat mode', t.s.dim);
    canvas.write(boxX + 14, y, '  ·  ', t.s.muted);
    canvas.write(boxX + 19, y, dbStr, { color: dbColor });

    canvas.write(hintX, y, 'Tab', t.s.brand);
    canvas.write(hintX + 3, y, ' complete  ', t.s.dim);
    canvas.write(hintX + 14, y, 'Esc', t.s.brand);
    canvas.write(hintX + 17, y, ' back', t.s.dim);

    y++;
    canvas.write(boxX, y, botBorder, t.s.border);

    return y - startY + 1;
  }

  renderFull(
    canvas: ITerminalCanvas,
    startY: number,
    info: {
      model?: string;
      connectionStatus?: string;
      dbConnected?: boolean;
      messageCount?: number;
    },
  ): number {
    const { rows } = canvas.getSize();
    const availableHeight = rows - startY - 3;

    if (availableHeight >= 14) {
      const logoHeight = this.renderLogo(canvas, startY);
      const boxHeight = this.renderInfoBox(canvas, startY + logoHeight + 1, info);
      return logoHeight + 1 + boxHeight;
    }

    if (availableHeight >= 6) {
      return this.renderInfoBox(canvas, startY + 1, info);
    }

    const t = getTheme();
    const statusIcon = info.connectionStatus === 'connected' ? '*' : 'o';
    const statusColor = info.connectionStatus === 'connected' ? t.palette.success : t.palette.error;
    canvas.write(2, startY, `${statusIcon} ${info.model ?? 'unknown'}`, { color: statusColor });
    canvas.write(20, startY, 'beanCLI — /help for commands', t.s.dim);
    return 1;
  }
}
