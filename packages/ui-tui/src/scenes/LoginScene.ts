import type { IScene, SceneContext } from '../core/IScene.js';
import type { ITerminalCanvas, TextStyle } from '../core/TerminalCanvas.js';
import { getTheme } from '../core/Theme.js';

type LoginPhase = 'init-bar' | 'notice' | 'form' | 'authenticating' | 'error';

export interface LoginResult {
  token: string;
  username: string;
  role: string;
}

const INIT_STEPS = [
  'Bootstrapping beanCLI runtime...',
  'Loading secure keychain...',
  'Preparing encrypted session...',
] as const;

const SPINNER_FRAMES = ['|', '/', '-', '\\'];
const INIT_DURATION_MS = 1600;

function loadingBar(pct: number, width: number): string {
  const filled = Math.round(pct * width);
  return '[' + '='.repeat(filled) + ' '.repeat(width - filled) + ']';
}

function centered(text: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

export class LoginScene implements IScene {
  readonly name = 'login';

  private phase: LoginPhase = 'init-bar';
  private readonly startTime = Date.now();
  private authStartTime = 0;
  private username = '';
  private password = '';
  private activeField: 'username' | 'password' = 'username';
  private errorMsg = '';
  private spinnerIdx = 0;
  private markDirtyFn?: () => void;

  onSubmit?: (username: string, password: string) => Promise<LoginResult | null>;
  onSuccess?: (result: LoginResult) => void;

  setMarkDirty(fn: () => void): void {
    this.markDirtyFn = fn;
  }

  render(canvas: ITerminalCanvas): void {
    const { cols, rows } = canvas.getSize();
    const t = getTheme();
    const elapsed = Date.now() - this.startTime;

    // Auto-advance from init-bar to notice
    if (this.phase === 'init-bar' && elapsed >= INIT_DURATION_MS) {
      this.phase = 'notice';
    }

    switch (this.phase) {
      case 'init-bar':
        this.renderInitBar(canvas, cols, rows, elapsed, t);
        break;
      case 'notice':
        this.renderNotice(canvas, cols, rows, t);
        break;
      case 'form':
      case 'error':
        this.renderForm(canvas, cols, rows, t);
        break;
      case 'authenticating':
        this.renderAuthenticating(canvas, cols, rows, t);
        break;
    }
  }

  // ── Helpers ──────────────────────────────────────────

  private drawBox(
    canvas: ITerminalCanvas,
    bx: number, by: number,
    bw: number, bh: number,
    bg: string,
    t: ReturnType<typeof getTheme>,
  ): void {
    canvas.write(bx, by, '╔' + '═'.repeat(bw - 2) + '╗', t.s.brand);
    for (let i = 1; i < bh - 1; i++) {
      canvas.write(bx, by + i, '║', t.s.brand);
      canvas.write(bx + 1, by + i, ' '.repeat(bw - 2), { bgColor: bg });
      canvas.write(bx + bw - 1, by + i, '║', t.s.brand);
    }
    canvas.write(bx, by + bh - 1, '╚' + '═'.repeat(bw - 2) + '╝', t.s.brand);
  }

  private bg(style: TextStyle, bgColor: string): TextStyle {
    return { ...style, bgColor };
  }

  // ── Phase renderers ──────────────────────────────────

  private renderInitBar(
    canvas: ITerminalCanvas,
    cols: number,
    rows: number,
    elapsed: number,
    t: ReturnType<typeof getTheme>,
  ): void {
    const stepDur = INIT_DURATION_MS / INIT_STEPS.length;
    const stepsVisible = Math.min(INIT_STEPS.length, Math.floor(elapsed / stepDur) + 1);
    const lineW = 56;
    const sx = Math.max(0, Math.floor((cols - lineW) / 2));
    const sy = Math.max(2, Math.floor(rows / 2) - 5);

    canvas.write(sx, sy, 'beanCLI  --  TERMINAL STREAMING CONSOLE', {
      color: t.palette.brand, bold: true,
    });
    canvas.write(sx, sy + 1, '='.repeat(44), { color: t.palette.borderDim });

    for (let i = 0; i < stepsVisible; i++) {
      const step = INIT_STEPS[i] ?? '';
      const isDone = i < stepsVisible - 1;
      const isAnim = i === stepsVisible - 1;
      const stepY = sy + 3 + i;
      const pct = isDone ? 1.0 : Math.min(1, (elapsed - i * stepDur) / stepDur);

      canvas.write(sx, stepY, isDone ? '+ ' : '| ', isDone ? t.s.success : t.s.pixelLoading);
      canvas.write(sx + 2, stepY, step.padEnd(32), isDone ? t.s.text : t.s.muted);
      canvas.write(sx + 34, stepY, loadingBar(pct, 14), isAnim ? t.s.pixelLoading : t.s.success);

      if (isDone) {
        canvas.write(sx + 49, stepY, ' OK', t.s.success);
      } else if (isAnim) {
        canvas.write(sx + 49, stepY, ` ${Math.round(pct * 100)}%`, t.s.accent);
      }
    }
  }

  private renderNotice(
    canvas: ITerminalCanvas,
    cols: number,
    rows: number,
    t: ReturnType<typeof getTheme>,
  ): void {
    const bw = Math.min(cols - 4, 58);
    const bh = 14;
    const bx = Math.max(0, Math.floor((cols - bw) / 2));
    const by = Math.max(0, Math.floor((rows - bh) / 2));
    const inner = bw - 2;
    const panel = t.palette.bgPanel;

    this.drawBox(canvas, bx, by, bw, bh, panel, t);

    // Title
    canvas.write(bx + 1, by + 1,
      centered('[ AUTHENTICATION REQUIRED ]', inner),
      this.bg(t.s.brand, panel));
    canvas.write(bx, by + 2, '╠' + '═'.repeat(inner) + '╣', t.s.brand);

    // Credential section header
    canvas.write(bx + 1, by + 3,
      centered('DEV ACCOUNT CREDENTIALS', inner),
      this.bg(t.s.muted, panel));
    canvas.write(bx + 1, by + 4,
      centered('(password = username for dev)', inner),
      this.bg(t.s.dim, panel));

    canvas.write(bx, by + 5, '╠' + '─'.repeat(inner) + '╣', t.s.borderDim);

    // Account rows
    const accounts: [string, string, string][] = [
      ['admin',   'DBA',     '-- full access'],
      ['manager', 'MANAGER', '-- approve / review'],
      ['analyst', 'ANALYST', '-- read + query'],
    ];
    for (let i = 0; i < accounts.length; i++) {
      const [user, role, note] = accounts[i]!;
      const row = `  ${user.padEnd(10)} ${role.padEnd(14)} ${note}`;
      canvas.write(bx + 1, by + 6 + i,
        row.slice(0, inner).padEnd(inner),
        this.bg(t.s.accent, panel));
    }

    canvas.write(bx, by + 9, '╠' + '═'.repeat(inner) + '╣', t.s.brand);

    // Blinking ENTER prompt
    const blink = Math.floor(Date.now() / 500) % 2 === 0;
    const promptText = '[  PRESS ENTER TO CONTINUE  ]';
    canvas.write(bx + 1, by + 10,
      centered(blink ? promptText : ' '.repeat(promptText.length), inner),
      this.bg({ color: t.palette.success, bold: true }, panel));

    canvas.write(bx + 1, by + 11,
      centered('Enter credentials to access beanCLI', inner),
      this.bg(t.s.dim, panel));

    canvas.write(bx + 1, by + 12,
      ' '.repeat(inner),
      { bgColor: panel });
  }

  private renderForm(
    canvas: ITerminalCanvas,
    cols: number,
    rows: number,
    t: ReturnType<typeof getTheme>,
  ): void {
    const bw = Math.min(cols - 4, 52);
    const bh = 14;
    const bx = Math.max(0, Math.floor((cols - bw) / 2));
    const by = Math.max(0, Math.floor((rows - bh) / 2));
    const inner = bw - 2;
    const panel = t.palette.bgPanel;
    const fieldBg = '#1a2a3a';

    this.drawBox(canvas, bx, by, bw, bh, panel, t);

    // Title
    canvas.write(bx + 1, by + 1,
      centered('[ beanCLI LOGIN ]', inner),
      this.bg(t.s.brand, panel));
    canvas.write(bx, by + 2, '╠' + '═'.repeat(inner) + '╣', t.s.brand);

    // Error line or blank spacer
    if (this.phase === 'error' && this.errorMsg) {
      canvas.write(bx + 1, by + 3,
        ('! ' + this.errorMsg).slice(0, inner).padEnd(inner),
        this.bg(t.s.error, panel));
    } else {
      canvas.write(bx + 1, by + 3, ' '.repeat(inner), { bgColor: panel });
    }

    // Spacer
    canvas.write(bx + 1, by + 4, ' '.repeat(inner), { bgColor: panel });

    // Blinking text cursor (alternates every 500ms)
    const cursor = Math.floor(Date.now() / 500) % 2 === 0 ? '_' : ' ';
    const uActive = this.activeField === 'username';
    const pActive = this.activeField === 'password';

    // Username field
    canvas.write(bx + 1, by + 5,
      ' Username:'.padEnd(inner),
      this.bg(uActive ? t.s.accent : t.s.muted, panel));

    const uVal = this.username + (uActive ? cursor : ' ');
    const uDisplay = uVal.slice(-Math.max(1, inner - 5));
    canvas.write(bx + 1, by + 6,
      ('  > ' + uDisplay).padEnd(inner),
      { color: uActive ? t.palette.text : t.palette.dim, bgColor: uActive ? fieldBg : panel, bold: uActive });

    canvas.write(bx + 1, by + 7, ' '.repeat(inner), { bgColor: panel });

    // Password field
    canvas.write(bx + 1, by + 8,
      ' Password:'.padEnd(inner),
      this.bg(pActive ? t.s.accent : t.s.muted, panel));

    const pMasked = '*'.repeat(this.password.length) + (pActive ? cursor : ' ');
    const pDisplay = pMasked.slice(-Math.max(1, inner - 5));
    canvas.write(bx + 1, by + 9,
      ('  > ' + pDisplay).padEnd(inner),
      { color: pActive ? t.palette.text : t.palette.dim, bgColor: pActive ? fieldBg : panel, bold: pActive });

    // Spacers
    canvas.write(bx + 1, by + 10, ' '.repeat(inner), { bgColor: panel });
    canvas.write(bx + 1, by + 11, ' '.repeat(inner), { bgColor: panel });

    // Hint bar
    canvas.write(bx, by + 12, '╠' + '─'.repeat(inner) + '╣', t.s.borderDim);
    canvas.write(bx + 1, by + 13,
      '  Tab: switch field    Enter: login'.padEnd(inner),
      this.bg(t.s.muted, panel));
  }

  private renderAuthenticating(
    canvas: ITerminalCanvas,
    cols: number,
    rows: number,
    t: ReturnType<typeof getTheme>,
  ): void {
    const elapsed = Date.now() - this.authStartTime;
    const pct = Math.min(0.95, elapsed / 1500);  // cap at 95% until result arrives
    const frame = SPINNER_FRAMES[this.spinnerIdx % SPINNER_FRAMES.length] ?? '|';
    this.spinnerIdx++;

    const bw = Math.min(cols - 4, 46);
    const bh = 9;
    const bx = Math.max(0, Math.floor((cols - bw) / 2));
    const by = Math.max(0, Math.floor((rows - bh) / 2));
    const inner = bw - 2;
    const panel = t.palette.bgPanel;

    this.drawBox(canvas, bx, by, bw, bh, panel, t);

    canvas.write(bx + 1, by + 1,
      centered('[ beanCLI ]', inner),
      this.bg(t.s.brand, panel));
    canvas.write(bx, by + 2, '╠' + '═'.repeat(inner) + '╣', t.s.brand);

    canvas.write(bx + 1, by + 3,
      `  ${frame}  AUTHENTICATING...`.padEnd(inner),
      this.bg({ color: t.palette.brand, bold: true }, panel));

    canvas.write(bx + 1, by + 4, ' '.repeat(inner), { bgColor: panel });

    const barWidth = Math.max(6, inner - 6);
    canvas.write(bx + 1, by + 5,
      centered(loadingBar(pct, barWidth), inner),
      this.bg(t.s.pixelLoading, panel));

    canvas.write(bx + 1, by + 6,
      centered(`${Math.round(pct * 100)}%`, inner),
      this.bg(t.s.accent, panel));

    canvas.write(bx + 1, by + 7, ' '.repeat(inner), { bgColor: panel });
  }

  // ── Input ────────────────────────────────────────────

  onKeyPress(key: string): void {
    // Skip init-bar after 600ms on any key
    if (this.phase === 'init-bar') {
      if (Date.now() - this.startTime >= 600) {
        this.phase = 'notice';
      }
      return;
    }

    if (this.phase === 'notice') {
      if (key === '\r' || key === '\n') {
        this.phase = 'form';
      }
      return;
    }

    if (this.phase === 'form' || this.phase === 'error') {
      // Any keystroke clears error state
      if (this.phase === 'error' && key !== '\r' && key !== '\n') {
        this.phase = 'form';
      }

      const isUser = this.activeField === 'username';

      if (key === '\t') {
        this.activeField = isUser ? 'password' : 'username';
      } else if (key === '\r' || key === '\n') {
        if (this.username.trim() && this.password) {
          this.doSubmit();
        }
      } else if (key === '\u007f' || key === '\b') {
        // Backspace
        if (isUser) this.username = this.username.slice(0, -1);
        else this.password = this.password.slice(0, -1);
      } else if (key.length === 1 && key >= ' ') {
        if (isUser) this.username += key;
        else this.password += key;
      }
    }
  }

  private doSubmit(): void {
    this.phase = 'authenticating';
    this.authStartTime = Date.now();
    this.spinnerIdx = 0;
    this.markDirtyFn?.();

    void this.onSubmit?.(this.username.trim(), this.password)
      .then((result) => {
        if (result) {
          this.onSuccess?.(result);
        } else {
          this.errorMsg = 'Invalid credentials — try again';
          this.phase = 'error';
          this.markDirtyFn?.();
        }
      })
      .catch(() => {
        this.errorMsg = 'Cannot reach server — is the API running?';
        this.phase = 'error';
        this.markDirtyFn?.();
      });
  }

  onSlowFrame(_ms: number): void {}

  getContext(): SceneContext {
    return { scene: 'login', summary: 'Authentication' };
  }
}
