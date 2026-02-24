import type { IScene, SceneContext } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import { getTheme } from '../core/Theme.js';

const LOGO_LINES = [
  '  ██████╗ ███████╗ █████╗ ███╗   ██╗',
  '  ██╔══██╗██╔════╝██╔══██╗████╗  ██║',
  '  ██████╦╝█████╗  ███████║██╔██╗ ██║',
  '  ██╔══██╗██╔══╝  ██╔══██║██║╚████║ ',
  '  ██████╦╝███████╗██║  ██║██║  ███║ ',
  '  ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝   ╚══╝',
  '       TERMINAL · STREAMING · DATA  ',
];

const BOOT_STEPS = [
  'Initializing terminal canvas...',
  'Loading configuration...',
  'Connecting to WebSocket...',
  'Fetching schema...',
];

function loadingBar(pct: number, width = 12): string {
  const filled = Math.round(pct * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

export class SplashScene implements IScene {
  readonly name = 'splash';

  private readonly bootTime = Date.now();
  onProceed?: () => void;
  private proceeded = false;

  render(canvas: ITerminalCanvas): void {
    const { cols, rows } = canvas.getSize();
    const t = getTheme();
    const elapsed = Date.now() - this.bootTime;

    // Phase durations
    // Phase 0: 0–600ms — logo lines appear one by one
    // Phase 1: 600–1200ms — gradient color sweep
    // Phase 2: 1200–2500ms — boot steps with loading bar
    // Phase 3: 2500ms+ — "PRESS ANY KEY" blink
    const phase = elapsed < 600 ? 0 : elapsed < 1200 ? 1 : elapsed < 2500 ? 2 : 3;
    const linesVisible = phase === 0 ? Math.floor(elapsed / 90) : LOGO_LINES.length;

    const logoWidth = LOGO_LINES[0]?.length ?? 38;
    const logoX = Math.max(0, Math.floor((cols - logoWidth) / 2));
    const logoStartY = Math.max(2, Math.floor(rows / 2) - 8);

    // Render logo lines
    for (let i = 0; i < LOGO_LINES.length; i++) {
      if (i >= linesVisible) break;
      const line = LOGO_LINES[i] ?? '';
      // Gradient index shifts over time for the sweep effect
      const gradIdx = phase >= 1
        ? (i + Math.floor(elapsed / 200)) % 6
        : i;
      canvas.write(logoX, logoStartY + i, line, t.gradientStyle(gradIdx));
    }

    // Phase 2: boot steps
    if (phase >= 2) {
      const stepStartY = logoStartY + LOGO_LINES.length + 2;
      const stepsElapsed = elapsed - 1200;
      const stepsVisible = Math.min(BOOT_STEPS.length, Math.floor(stepsElapsed / 330) + 1);
      const stepX = Math.max(0, Math.floor((cols - 62) / 2));

      for (let i = 0; i < stepsVisible; i++) {
        const step = BOOT_STEPS[i] ?? '';
        const isDone = i < stepsVisible - 1;
        const isAnimating = i === stepsVisible - 1;

        const icon = isDone ? '*' : 'o';
        const iconStyle = isDone ? t.s.success : t.s.muted;
        const labelStyle = isDone ? t.s.text : t.s.muted;

        canvas.write(stepX, stepStartY + i, icon + ' ', iconStyle);
        canvas.write(stepX + 2, stepStartY + i, step.padEnd(36), labelStyle);

        if (isDone) {
          canvas.write(stepX + 38, stepStartY + i, loadingBar(1.0), t.s.success);
          canvas.write(stepX + 52, stepStartY + i, ' DONE', t.s.success);
        } else if (isAnimating) {
          const pct = Math.min(1, (stepsElapsed - i * 330) / 330);
          canvas.write(stepX + 38, stepStartY + i, loadingBar(pct), t.s.pixelLoading);
          const pctStr = `${Math.round(pct * 100)}%`.padStart(4);
          canvas.write(stepX + 52, stepStartY + i, ' ' + pctStr, t.s.accent);
        }
      }
    }

    // Phase 3: "PRESS ANY KEY" blink at 500ms interval
    if (phase >= 3) {
      const blink = Math.floor(Date.now() / 500) % 2 === 0;
      if (blink) {
        const msg = '>  PRESS ANY KEY TO CONTINUE  <';
        const msgX = Math.max(0, Math.floor((cols - msg.length) / 2));
        const msgY = logoStartY + LOGO_LINES.length + BOOT_STEPS.length + 4;
        canvas.write(msgX, msgY, msg, t.s.brand);
      }
    }
  }

  onKeyPress(_key: string): void {
    const elapsed = Date.now() - this.bootTime;
    // Allow skip from phase 1 onward (600ms+)
    if (elapsed >= 600 && !this.proceeded) {
      this.proceeded = true;
      this.onProceed?.();
    }
  }

  onSlowFrame(_durationMs: number): void {}

  getContext(): SceneContext {
    return { scene: 'splash', summary: 'Boot splash screen' };
  }
}
