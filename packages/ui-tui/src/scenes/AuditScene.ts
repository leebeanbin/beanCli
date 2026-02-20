import type { IScene } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';

export class AuditScene implements IScene {
  readonly name = 'audit';
  private logs: Record<string, unknown>[] = [];

  render(canvas: ITerminalCanvas): void {
    const { cols } = canvas.getSize();
    canvas.write(0, 0, '[AUDIT] Audit Log', { color: 'magenta', bold: true });
    canvas.write(0, 1, '[/] Search  [f] Filter by category', { color: 'gray' });

    const headers = 'Time       | Actor   | Action              | Result';
    canvas.write(0, 3, headers, { bold: true, underline: true });

    for (let i = 0; i < this.logs.length && i < 20; i++) {
      const log = this.logs[i];
      const line = `${String(log.created_at ?? '').slice(11, 19).padEnd(11)}| ${String(log.actor ?? '').padEnd(8)}| ${String(log.action ?? '').padEnd(20)}| ${log.result === 'SUCCESS' ? 'OK' : 'FAIL'}`;
      canvas.write(0, 4 + i, line.slice(0, cols));
    }
  }

  setLogs(logs: Record<string, unknown>[]): void {
    this.logs = logs;
  }

  onKeyPress(_key: string): void {}
  onSlowFrame(_durationMs: number): void {}
}
