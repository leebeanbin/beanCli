import type { IScene } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import type { AppState } from '../store/AppState.js';

export class MonitorScene implements IScene {
  readonly name = 'monitor';

  constructor(private readonly appState: AppState) {}

  render(canvas: ITerminalCanvas): void {
    const { cols } = canvas.getSize();
    canvas.write(0, 0, '[MONITOR] Streaming Health', { color: 'green', bold: true });

    const headers = 'Entity Type    | Events/min | Last Event    | DLQ';
    canvas.write(0, 2, headers, { bold: true, underline: true });

    const stats = this.appState.getStreamStats();
    for (let i = 0; i < stats.length; i++) {
      const s = stats[i];
      const elapsed = Math.floor((Date.now() - s.lastEventAt) / 1000);
      const line = `${s.entityType.padEnd(15)}| ${String(s.eventsPerMinute).padStart(10)} | ${elapsed}s ago`.padEnd(50) +
        `| ${s.dlqCount}`;
      canvas.write(0, 3 + i, line.slice(0, cols));
    }
  }

  onKeyPress(_key: string): void {}
  onSlowFrame(_durationMs: number): void {}
}
