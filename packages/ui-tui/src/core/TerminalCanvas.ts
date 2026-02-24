export interface TextStyle {
  color?: string;
  bgColor?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
  italic?: boolean;
}

export interface ITerminalCanvas {
  beginFrame(): void;
  endFrame(): void;
  write(x: number, y: number, text: string, style?: TextStyle): void;
  clear(): void;
  getSize(): { cols: number; rows: number };
  enterAltScreen(): void;
  leaveAltScreen(): void;
}

const NAMED_COLORS: Record<string, number> = {
  black: 30, red: 31, green: 32, yellow: 33,
  blue: 34, magenta: 35, cyan: 36, white: 37, gray: 90,
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function buildColorCode(color: string, isBg: boolean): string {
  const named = NAMED_COLORS[color];
  if (named !== undefined) {
    return String(isBg ? named + 10 : named);
  }
  const rgb = hexToRgb(color);
  if (rgb) {
    const prefix = isBg ? 48 : 38;
    return `${prefix};2;${rgb[0]};${rgb[1]};${rgb[2]}`;
  }
  return '';
}

export class TerminalCanvas implements ITerminalCanvas {
  private buffer: string[] = [];
  private cols: number;
  private rows: number;
  private inAltScreen = false;

  constructor(
    private readonly stdout: { write: (data: string) => void; columns?: number; rows?: number },
  ) {
    this.cols = stdout.columns ?? 80;
    this.rows = stdout.rows ?? 24;
  }

  enterAltScreen(): void {
    if (this.inAltScreen) return;
    this.inAltScreen = true;
    this.stdout.write('\x1b[?1049h');
  }

  leaveAltScreen(): void {
    if (!this.inAltScreen) return;
    this.inAltScreen = false;
    this.stdout.write('\x1b[?1049l\x1b[?25h');
  }

  beginFrame(): void {
    this.buffer = [];
    this.buffer.push('\x1b[?25l');
    this.buffer.push('\x1b[H');
    this.buffer.push('\x1b[2J');
  }

  endFrame(): void {
    this.buffer.push('\x1b[?25h');
    this.stdout.write(this.buffer.join(''));
  }

  write(x: number, y: number, text: string, style?: TextStyle): void {
    const esc = this.buildEscape(style);
    this.buffer.push(`\x1b[${y + 1};${x + 1}H${esc}${text}\x1b[0m`);
  }

  clear(): void {
    this.buffer.push('\x1b[2J');
  }

  getSize(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows };
  }

  updateSize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
  }

  private buildEscape(style?: TextStyle): string {
    if (!style) return '';
    const parts: string[] = [];
    if (style.bold) parts.push('1');
    if (style.dim) parts.push('2');
    if (style.italic) parts.push('3');
    if (style.underline) parts.push('4');

    if (style.color) {
      const c = buildColorCode(style.color, false);
      if (c) parts.push(c);
    }
    if (style.bgColor) {
      const c = buildColorCode(style.bgColor, true);
      if (c) parts.push(c);
    }

    return parts.length > 0 ? `\x1b[${parts.join(';')}m` : '';
  }
}
