import type { ITerminalCanvas } from './TerminalCanvas.js';

export interface IScene {
  readonly name: string;
  render(canvas: ITerminalCanvas): void;
  onKeyPress(key: string): void;
  onSlowFrame(durationMs: number): void;
}
