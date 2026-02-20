import type { IScene } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';

export class IndexLabScene implements IScene {
  readonly name = 'indexlab';

  render(canvas: ITerminalCanvas): void {
    canvas.write(0, 0, '[INDEX LAB] Index Analysis', { color: 'blue', bold: true });
    canvas.write(0, 2, 'Index analysis will be available in a future phase.', { color: 'gray' });
  }

  onKeyPress(_key: string): void {}
  onSlowFrame(_durationMs: number): void {}
}
