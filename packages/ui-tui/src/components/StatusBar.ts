import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import type { Region } from '../core/Layout.js';
import { getTheme } from '../core/Theme.js';

export interface StatusBarProps {
  scene: string;
  streamMode: 'LIVE' | 'PAUSED';
  wsConnected: boolean;
  overloadWarning?: string | null;
  filterText?: string;
  role?: string;
  environment?: string;
}

export class StatusBar {
  render(canvas: ITerminalCanvas, region: Region, props: StatusBarProps): void {
    const { cols } = canvas.getSize();
    const t = getTheme();
    const y = region.y;

    // ── Top separator — double line ─────────────────────
    canvas.write(0, y, '═'.repeat(cols), t.s.borderDim);

    let x = 1;

    // ── Stream mode — animated live indicator ───────────
    const liveFrames = ['*', '+', '*', 'o'];
    const liveIcon = props.streamMode === 'LIVE'
      ? (liveFrames[Math.floor(Date.now() / 400) % liveFrames.length] ?? '◉')
      : '◌';
    const modeStr = `${liveIcon} ${props.streamMode}`;
    canvas.write(x, y, modeStr, {
      color: props.streamMode === 'LIVE' ? t.palette.success : t.palette.warning,
      bold: true,
    });
    x += modeStr.length + 1;

    canvas.write(x, y, '│', t.s.borderDim);
    x += 2;

    // ── WebSocket — ASCII up/down (▲▼ are EAW=Ambiguous → 2-wide in CJK terminals)
    const wsIcon = props.wsConnected ? '^' : 'v';
    const wsStr = `${wsIcon} WS`;
    canvas.write(x, y, wsStr, {
      color: props.wsConnected ? t.palette.success : t.palette.error,
      bold: true,
    });
    x += wsStr.length + 1;

    canvas.write(x, y, '│', t.s.borderDim);
    x += 2;

    // ── Role ────────────────────────────────────────────
    if (props.role) {
      canvas.write(x, y, props.role, t.s.brand);
      x += props.role.length + 1;
    }

    // ── Environment badge — [ENV] with PROD pulse ───────
    if (props.environment) {
      const envColors: Record<string, string> = {
        LOCAL:   t.palette.text,
        DEV:     t.palette.accent,
        STAGING: t.palette.warning,
        PROD:    t.palette.error,
      };
      const isProd = props.environment === 'PROD';
      const pulsing = isProd && Math.floor(Date.now() / 600) % 2 === 0;
      const envColor = envColors[props.environment] ?? t.palette.text;
      const envLabel = `[${props.environment}]`;
      canvas.write(x, y, envLabel, {
        color: pulsing ? t.palette.warning : envColor,
        bold: true,
      });
      x += envLabel.length + 1;
    }

    // ── Active scene ─────────────────────────────────────
    if (props.scene) {
      const sceneLabel = `[${props.scene.toUpperCase()}]`;
      canvas.write(x, y, sceneLabel, t.s.muted);
      x += sceneLabel.length + 1;
    }

    // ── Right side — reserve space first ────────────────
    const time = new Date().toLocaleTimeString('en', { hour12: false });
    const warnStr = props.overloadWarning ? `[!] ${props.overloadWarning}  ` : '';
    // clock: * + space + time
    const clockLen = 2 + time.length;
    const rightReserved = warnStr.length + clockLen + 2;

    // ── Filter text ──────────────────────────────────────
    if (props.filterText) {
      const maxFilterLen = cols - x - rightReserved - 6;
      if (maxFilterLen > 3) {
        canvas.write(x, y, '│', t.s.borderDim);
        const filterDisplay = props.filterText.length > maxFilterLen
          ? props.filterText.slice(0, maxFilterLen - 1) + '…'
          : props.filterText;
        canvas.write(x + 2, y, `◈ /${filterDisplay}`, t.s.filterLabel);
      }
    }

    // ── Overload warning — pulsing ───────────────────────
    if (props.overloadWarning) {
      const pulsing = Math.floor(Date.now() / 500) % 2 === 0;
      canvas.write(cols - rightReserved, y, warnStr.trimEnd(), pulsing ? t.s.error : t.s.warning);
    }

    // ── Clock ────────────────────────────────────────────
    canvas.write(cols - clockLen - 1, y, '* ', t.s.accent);
    canvas.write(cols - time.length - 1, y, time, t.s.accent);
  }
}
