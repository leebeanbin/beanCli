export interface TextStyle {
  color?: string;
  bgColor?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
}

export interface ITerminalCanvas {
  beginFrame(): void;
  endFrame(): void;
  write(x: number, y: number, text: string, style?: TextStyle): void;
  clear(): void;
  getSize(): { cols: number; rows: number };
}

export class TerminalCanvas implements ITerminalCanvas {
  private buffer: string[] = [];
  private cols: number;
  private rows: number;

  constructor(
    private readonly stdout: { write: (data: string) => void; columns?: number; rows?: number },
  ) {
    this.cols = stdout.columns ?? 80;
    this.rows = stdout.rows ?? 24;
  }

  beginFrame(): void {
    this.buffer = [];
    this.buffer.push('\x1b[?25l'); // hide cursor
    this.buffer.push('\x1b[H');    // move to top-left
  }

  endFrame(): void {
    this.buffer.push('\x1b[?25h'); // show cursor
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
    const codes: number[] = [];
    if (style.bold) codes.push(1);
    if (style.dim) codes.push(2);
    if (style.underline) codes.push(4);

    const colorMap: Record<string, number> = {
      black: 30, red: 31, green: 32, yellow: 33,
      blue: 34, magenta: 35, cyan: 36, white: 37, gray: 90,
    };
    if (style.color && colorMap[style.color]) codes.push(colorMap[style.color]);
    if (style.bgColor && colorMap[style.bgColor]) codes.push(colorMap[style.bgColor] + 10);

    return codes.length > 0 ? `\x1b[${codes.join(';')}m` : '';
  }
}
