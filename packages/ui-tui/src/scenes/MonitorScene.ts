import type { IScene, SceneContext } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import type { AppState } from '../store/AppState.js';
import { FilterBar } from '../components/FilterBar.js';
import { HintBar } from '../components/HintBar.js';
import { SectionHeader } from '../components/SectionHeader.js';
import { getTheme } from '../core/Theme.js';

const BAR_WIDTH = 24;

function activityBar(intensity: number, gradient: (i: number) => string): { chars: string[]; colors: string[] } {
  const filled = Math.min(BAR_WIDTH, Math.round(intensity * BAR_WIDTH));
  const chars: string[] = [];
  const colors: string[] = [];
  for (let i = 0; i < BAR_WIDTH; i++) {
    if (i < filled) {
      const level = intensity > 0.8 ? '█' : intensity > 0.5 ? '▓' : intensity > 0.25 ? '▒' : '░';
      chars.push(level);
      colors.push(gradient(Math.floor(intensity * 5)));
    } else {
      chars.push('░');
      colors.push('#374151');
    }
  }
  return { chars, colors };
}

export class MonitorScene implements IScene {
  readonly name = 'monitor';

  private readonly header = new SectionHeader('[MONITOR] Streaming Health');
  private readonly filterBar = new FilterBar();
  private readonly hintBar = new HintBar('↑/↓ Navigate  / Filter  : SQL  ? AI  Esc Clear');

  private filterText = '';
  private cursorIdx = 0;

  constructor(private readonly appState: AppState) {}

  render(canvas: ITerminalCanvas): void {
    const { cols, rows: termRows } = canvas.getSize();
    const t = getTheme();

    const allStats = this.appState.getStreamStats();
    const stats = this.filterText
      ? allStats.filter(s => s.entityType.toLowerCase().includes(this.filterText.toLowerCase()))
      : allStats;

    const maxEpm = Math.max(1, ...stats.map(s => s.eventsPerMinute));

    this.header.render(canvas, 1, `${allStats.length} stream${allStats.length !== 1 ? 's' : ''}`);

    // ── Column headers ───────────────────────────────────
    const colH = t.s.colHeader;
    canvas.write(2, 2, 'STREAM'.padEnd(16), colH);
    canvas.write(19, 2, 'ACTIVITY'.padEnd(BAR_WIDTH + 2), colH);
    canvas.write(19 + BAR_WIDTH + 3, 2, 'EVT/MIN'.padStart(9), colH);
    canvas.write(19 + BAR_WIDTH + 13, 2, 'LAST'.padStart(8), colH);
    canvas.write(19 + BAR_WIDTH + 22, 2, 'DLQ'.padStart(5), colH);
    canvas.write(0, 3, '─'.repeat(cols), t.s.borderDim);

    // ── Empty state ──────────────────────────────────────
    if (stats.length === 0) {
      const msgY = Math.floor((termRows - 6) / 2) + 4;
      const msg = '-  NO STREAMS CONNECTED';
      const sub = 'Waiting for Kafka events...';
      canvas.write(Math.max(0, Math.floor((cols - msg.length) / 2)), msgY, msg, t.s.muted);
      canvas.write(Math.max(0, Math.floor((cols - sub.length) / 2)), msgY + 1, sub, t.s.dim);
      this.hintBar.render(canvas, termRows - 2);
      return;
    }

    const pulse = Math.floor(Date.now() / 300) % 2 === 0;

    for (let i = 0; i < stats.length; i++) {
      const s = stats[i]!;
      const rowY = 4 + i;
      if (rowY >= termRows - 3) break;

      const elapsed = Math.floor((Date.now() - s.lastEventAt) / 1000);
      const isActive = elapsed < 10 && s.eventsPerMinute > 0;
      const isSelected = i === this.cursorIdx;
      const intensity = s.eventsPerMinute / maxEpm;

      // Row color by activity intensity
      const rowColor = isActive
        ? (intensity > 0.7 ? t.palette.accent : (intensity > 0.3 ? t.palette.brand : t.palette.text))
        : t.palette.muted;

      // Selection background hint
      if (isSelected) {
        canvas.write(0, rowY, '>', t.s.accent);
      }

      // Activity icon — pulses when active
      const icon = isActive ? (pulse ? '*' : '+') : '-';
      canvas.write(1, rowY, icon, {
        color: isActive ? t.palette.success : t.palette.muted,
        bold: isActive,
      });

      // Entity name
      canvas.write(3, rowY, s.entityType.slice(0, 14).padEnd(15), {
        color: isSelected ? t.palette.accent : rowColor,
        bold: isSelected,
      });

      // Activity bar — per-character color
      const { chars, colors } = activityBar(intensity, t.gradient.bind(t));
      for (let b = 0; b < BAR_WIDTH; b++) {
        canvas.write(19 + b, rowY, chars[b] ?? '░', { color: colors[b] ?? '#374151' });
      }

      // EPM
      const epmStr = String(s.eventsPerMinute).padStart(9);
      canvas.write(19 + BAR_WIDTH + 3, rowY, epmStr, { color: rowColor, bold: isActive });

      // Last event
      const elapsedStr = elapsed < 60
        ? `${elapsed}s ago`
        : elapsed < 3600 ? `${Math.floor(elapsed / 60)}m ago`
        : `${Math.floor(elapsed / 3600)}h ago`;
      canvas.write(19 + BAR_WIDTH + 13, rowY, elapsedStr.padStart(8), t.s.dim);

      // DLQ count
      const dlqStr = String(s.dlqCount).padStart(5);
      if (s.dlqCount > 0) {
        const dlqPulse = Math.floor(Date.now() / 500) % 2 === 0;
        canvas.write(19 + BAR_WIDTH + 22, rowY, dlqStr, dlqPulse ? t.s.error : t.s.warning);
        canvas.write(19 + BAR_WIDTH + 28, rowY, ' !', t.s.error);
      } else {
        canvas.write(19 + BAR_WIDTH + 22, rowY, dlqStr, t.s.dim);
      }
    }

    if (this.filterBar.isActive() || this.filterBar.hasFilter()) {
      this.filterBar.render(canvas, termRows - 2);
    } else {
      this.hintBar.render(canvas, termRows - 2);
    }
  }

  onKeyPress(key: string): void {
    if (this.filterBar.handleKey(key)) {
      this.filterText = this.filterBar.getText();
      return;
    }

    const stats = this.appState.getStreamStats();
    switch (key) {
      case 'up':
      case 'k':
        this.cursorIdx = Math.max(0, this.cursorIdx - 1);
        break;
      case 'down':
      case 'j':
        this.cursorIdx = Math.min(Math.max(0, stats.length - 1), this.cursorIdx + 1);
        break;
      case '/':
        this.filterBar.activate();
        break;
      case '\u001b':
        this.filterBar.clear();
        this.filterText = '';
        break;
    }
  }

  getContext(): SceneContext {
    const stats = this.appState.getStreamStats();
    return {
      scene: 'monitor',
      summary: `Monitoring ${stats.length} stream(s). ${stats.map(s => `${s.entityType}: ${s.eventsPerMinute} evt/min`).join(', ')}`,
      details: {
        streams: stats.map(s => ({
          entityType: s.entityType,
          eventsPerMinute: s.eventsPerMinute,
          dlqCount: s.dlqCount,
          lastEventAt: s.lastEventAt,
        })),
      },
    };
  }

  onSlowFrame(_durationMs: number): void {}
}
