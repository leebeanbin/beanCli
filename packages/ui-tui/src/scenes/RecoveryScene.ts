import type { IScene } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';

export class RecoveryScene implements IScene {
  readonly name = 'recovery';

  render(canvas: ITerminalCanvas): void {
    canvas.write(0, 0, '[RECOVERY] DLQ Reprocessing', { color: 'red', bold: true });
    canvas.write(0, 2, 'Press [r] to reprocess selected DLQ event', { color: 'gray' });
  }

  onKeyPress(_key: string): void {}
  onSlowFrame(_durationMs: number): void {}
}
