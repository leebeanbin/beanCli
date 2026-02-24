import type { IScene, SceneContext } from '../core/IScene.js';
import type { ITerminalCanvas, TextStyle } from '../core/TerminalCanvas.js';
import { getTheme } from '../core/Theme.js';

export type DbType = 'postgresql' | 'mysql' | 'sqlite' | 'mongodb' | 'redis';

export interface DbConnection {
  id: string;
  label: string;
  type: DbType;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  isDefault?: boolean;
}

type ConnectionPhase = 'list' | 'form' | 'testing' | 'error';

const DB_TYPES: DbType[] = ['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis'];

const DEFAULT_PORTS: Record<DbType, number | undefined> = {
  postgresql: 5432,
  mysql: 3306,
  sqlite: undefined,
  mongodb: 27017,
  redis: 6379,
};

const FORM_FIELDS = ['label', 'type', 'host', 'port', 'database', 'username', 'password'] as const;
type FormField = typeof FORM_FIELDS[number];

const SPINNER_FRAMES = ['|', '/', '-', '\\'];

function centered(text: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function loadingBar(pct: number, width: number): string {
  const filled = Math.round(pct * width);
  return '[' + '='.repeat(filled) + ' '.repeat(width - filled) + ']';
}

export class ConnectionScene implements IScene {
  readonly name = 'connection';

  private phase: ConnectionPhase = 'list';
  private connections: DbConnection[] = [];
  private listCursor = 0;
  private errorMsg = '';
  private spinnerIdx = 0;
  private testStartTime = 0;
  private markDirtyFn?: () => void;

  // Form state
  private formIsEdit = false;
  private formFieldIdx = 0;
  private formValues: Record<FormField, string> = {
    label: '', type: 'postgresql', host: 'localhost', port: '5432',
    database: '', username: '', password: '',
  };

  onConnect?: (conn: DbConnection) => Promise<boolean>;
  onSave?:   (conn: DbConnection) => void;
  onDelete?: (id: string) => void;

  setMarkDirty(fn: () => void): void {
    this.markDirtyFn = fn;
  }

  setConnections(conns: DbConnection[]): void {
    this.connections = [...conns];
    // Clamp cursor
    if (this.listCursor >= this.connections.length) {
      this.listCursor = Math.max(0, this.connections.length - 1);
    }
  }

  // ── Render ────────────────────────────────────────────

  render(canvas: ITerminalCanvas): void {
    const { cols, rows } = canvas.getSize();
    const t = getTheme();

    switch (this.phase) {
      case 'list':    this.renderList(canvas, cols, rows, t); break;
      case 'form':    this.renderForm(canvas, cols, rows, t); break;
      case 'testing': this.renderTesting(canvas, cols, rows, t); break;
      case 'error':   this.renderError(canvas, cols, rows, t); break;
    }
  }

  private bg(style: TextStyle, bgColor: string): TextStyle {
    return { ...style, bgColor };
  }

  private drawBox(
    canvas: ITerminalCanvas,
    bx: number, by: number, bw: number, bh: number,
    bg: string, t: ReturnType<typeof getTheme>,
  ): void {
    canvas.write(bx, by, '╔' + '═'.repeat(bw - 2) + '╗', t.s.brand);
    for (let i = 1; i < bh - 1; i++) {
      canvas.write(bx, by + i, '║', t.s.brand);
      canvas.write(bx + 1, by + i, ' '.repeat(bw - 2), { bgColor: bg });
      canvas.write(bx + bw - 1, by + i, '║', t.s.brand);
    }
    canvas.write(bx, by + bh - 1, '╚' + '═'.repeat(bw - 2) + '╝', t.s.brand);
  }

  private renderList(
    canvas: ITerminalCanvas,
    cols: number, rows: number,
    t: ReturnType<typeof getTheme>,
  ): void {
    const bw = Math.min(cols - 4, 62);
    const listH = Math.max(4, Math.min(this.connections.length, 8));
    const bh = listH + 6;
    const bx = Math.max(0, Math.floor((cols - bw) / 2));
    const by = Math.max(0, Math.floor((rows - bh) / 2));
    const inner = bw - 2;
    const panel = t.palette.bgPanel;

    this.drawBox(canvas, bx, by, bw, bh, panel, t);

    canvas.write(bx + 1, by + 1,
      centered('[ beanCLI — DATABASE CONNECTIONS ]', inner),
      this.bg(t.s.brand, panel));
    canvas.write(bx, by + 2, '╠' + '═'.repeat(inner) + '╣', t.s.brand);

    if (this.connections.length === 0) {
      canvas.write(bx + 1, by + 3,
        centered('No saved connections.  Press n to add one.', inner),
        this.bg(t.s.muted, panel));
      // Fill empty rows
      for (let i = 1; i < listH; i++) {
        canvas.write(bx + 1, by + 3 + i, ' '.repeat(inner), { bgColor: panel });
      }
    } else {
      for (let i = 0; i < listH; i++) {
        const conn = this.connections[i];
        if (!conn) {
          canvas.write(bx + 1, by + 3 + i, ' '.repeat(inner), { bgColor: panel });
          continue;
        }
        const isCursor = i === this.listCursor;
        const cursor = isCursor ? '> ' : '  ';
        const star   = conn.isDefault ? '* ' : '  ';
        const host   = conn.type === 'sqlite'
          ? (conn.database ?? '')
          : `${conn.host ?? 'localhost'}:${conn.port ?? DEFAULT_PORTS[conn.type] ?? ''}`;
        const label  = (conn.label ?? conn.id).padEnd(20).slice(0, 20);
        const type   = conn.type.padEnd(12).slice(0, 12);
        const hostTr = host.slice(0, inner - 38);
        const line = `${cursor}${star}${label} ${type} ${hostTr}`;
        canvas.write(bx + 1, by + 3 + i,
          line.slice(0, inner).padEnd(inner),
          this.bg(isCursor ? t.s.accent : t.s.text, panel));
      }
    }

    canvas.write(bx, by + 3 + listH, '╠' + '─'.repeat(inner) + '╣', t.s.borderDim);
    const hint = '  n: new   d: delete   *: default   Enter: connect';
    canvas.write(bx + 1, by + 4 + listH,
      hint.slice(0, inner).padEnd(inner),
      this.bg(t.s.muted, panel));
    canvas.write(bx + 1, by + 5 + listH, ' '.repeat(inner), { bgColor: panel });
  }

  private renderForm(
    canvas: ITerminalCanvas,
    cols: number, rows: number,
    t: ReturnType<typeof getTheme>,
  ): void {
    const bw = Math.min(cols - 4, 46);
    const bh = FORM_FIELDS.length + 6;
    const bx = Math.max(0, Math.floor((cols - bw) / 2));
    const by = Math.max(0, Math.floor((rows - bh) / 2));
    const inner = bw - 2;
    const panel = t.palette.bgPanel;
    const fieldBg = '#1a2a3a';

    this.drawBox(canvas, bx, by, bw, bh, panel, t);

    const title = this.formIsEdit ? '[ EDIT CONNECTION ]' : '[ ADD CONNECTION ]';
    canvas.write(bx + 1, by + 1,
      centered(title, inner),
      this.bg(t.s.brand, panel));
    canvas.write(bx, by + 2, '╠' + '═'.repeat(inner) + '╣', t.s.brand);

    const cursor = Math.floor(Date.now() / 500) % 2 === 0 ? '_' : ' ';

    for (let i = 0; i < FORM_FIELDS.length; i++) {
      const field = FORM_FIELDS[i]!;
      const isActive = i === this.formFieldIdx;
      const label = field.padEnd(10);
      let rawVal = this.formValues[field];
      const displayVal = field === 'password'
        ? '*'.repeat(rawVal.length)
        : rawVal;
      const inputStr = displayVal + (isActive ? cursor : ' ');
      const labelPart = `  ${label}: `;
      const maxInput = inner - labelPart.length - 1;
      const shown = inputStr.length > maxInput
        ? inputStr.slice(inputStr.length - maxInput)
        : inputStr.padEnd(maxInput);
      const line = (labelPart + shown).slice(0, inner);

      canvas.write(bx + 1, by + 3 + i,
        line.padEnd(inner),
        this.bg(isActive ? { color: t.palette.text, bold: true } : t.s.muted,
                isActive ? fieldBg : panel));
    }

    canvas.write(bx, by + 3 + FORM_FIELDS.length, '╠' + '─'.repeat(inner) + '╣', t.s.borderDim);
    canvas.write(bx + 1, by + 4 + FORM_FIELDS.length,
      '  Tab: next field   Enter: save & test'.slice(0, inner).padEnd(inner),
      this.bg(t.s.muted, panel));
    canvas.write(bx + 1, by + 5 + FORM_FIELDS.length, ' '.repeat(inner), { bgColor: panel });
  }

  private renderTesting(
    canvas: ITerminalCanvas,
    cols: number, rows: number,
    t: ReturnType<typeof getTheme>,
  ): void {
    const elapsed = Date.now() - this.testStartTime;
    const pct = Math.min(0.95, elapsed / 2000);
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
      `  ${frame}  CONNECTING...`.padEnd(inner),
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

  private renderError(
    canvas: ITerminalCanvas,
    cols: number, rows: number,
    t: ReturnType<typeof getTheme>,
  ): void {
    const bw = Math.min(cols - 4, 54);
    const bh = 8;
    const bx = Math.max(0, Math.floor((cols - bw) / 2));
    const by = Math.max(0, Math.floor((rows - bh) / 2));
    const inner = bw - 2;
    const panel = t.palette.bgPanel;

    this.drawBox(canvas, bx, by, bw, bh, panel, t);

    canvas.write(bx + 1, by + 1,
      centered('[ CONNECTION FAILED ]', inner),
      this.bg(t.s.error, panel));
    canvas.write(bx, by + 2, '╠' + '═'.repeat(inner) + '╣', t.s.brand);

    canvas.write(bx + 1, by + 3,
      ('  ' + this.errorMsg).slice(0, inner).padEnd(inner),
      this.bg(t.s.error, panel));

    canvas.write(bx + 1, by + 4, ' '.repeat(inner), { bgColor: panel });

    canvas.write(bx, by + 5, '╠' + '─'.repeat(inner) + '╣', t.s.borderDim);
    canvas.write(bx + 1, by + 6,
      '  Enter: retry   Esc: back to list'.slice(0, inner).padEnd(inner),
      this.bg(t.s.muted, panel));
  }

  // ── Input ─────────────────────────────────────────────

  onKeyPress(key: string): void {
    switch (this.phase) {
      case 'list':  this.handleListKey(key); break;
      case 'form':  this.handleFormKey(key); break;
      case 'error': this.handleErrorKey(key); break;
      // 'testing' ignores all keys while connecting
    }
    this.markDirtyFn?.();
  }

  private handleListKey(key: string): void {
    const len = this.connections.length;

    if (key === 'up' || key === 'k') {
      this.listCursor = Math.max(0, this.listCursor - 1);
    } else if (key === 'down' || key === 'j') {
      this.listCursor = Math.min(Math.max(0, len - 1), this.listCursor + 1);
    } else if (key === 'n' || key === 'N') {
      this.openForm(null);
    } else if ((key === 'e' || key === 'E') && len > 0) {
      const conn = this.connections[this.listCursor];
      if (conn) this.openForm(conn);
    } else if ((key === 'd' || key === 'D') && len > 0) {
      const conn = this.connections[this.listCursor];
      if (conn) {
        this.onDelete?.(conn.id);
        // Caller is expected to remove it and call setConnections again
      }
    } else if (key === '*' && len > 0) {
      this.toggleDefault();
    } else if ((key === '\r' || key === '\n') && len > 0) {
      const conn = this.connections[this.listCursor];
      if (conn) this.startConnect(conn);
    }
  }

  private handleFormKey(key: string): void {
    if (key === '\u001b') {
      this.phase = 'list';
      return;
    }

    if (key === '\t') {
      this.formFieldIdx = (this.formFieldIdx + 1) % FORM_FIELDS.length;
      // When switching to 'type' field, make sure value is valid
      this.clampTypeField();
      return;
    }

    if (key === '\r' || key === '\n') {
      this.submitForm();
      return;
    }

    const field = FORM_FIELDS[this.formFieldIdx]!;

    if (field === 'type') {
      // Tab-cycle through DB types with left/right arrows
      if (key === 'right' || key === 'l') {
        const idx = DB_TYPES.indexOf(this.formValues.type as DbType);
        this.formValues.type = DB_TYPES[(idx + 1) % DB_TYPES.length]!;
        this.updateDefaultPort();
      } else if (key === 'left' || key === 'h') {
        const idx = DB_TYPES.indexOf(this.formValues.type as DbType);
        this.formValues.type = DB_TYPES[(idx - 1 + DB_TYPES.length) % DB_TYPES.length]!;
        this.updateDefaultPort();
      }
      return;
    }

    if (key === '\u007f' || key === '\b') {
      this.formValues[field] = this.formValues[field].slice(0, -1);
    } else if (key.length === 1 && key >= ' ') {
      this.formValues[field] += key;
    }
  }

  private handleErrorKey(key: string): void {
    if (key === '\u001b') {
      this.phase = 'list';
    } else if (key === '\r' || key === '\n') {
      // retry last connection attempt
      const conn = this.connections[this.listCursor];
      if (conn) this.startConnect(conn);
    }
  }

  // ── Helpers ───────────────────────────────────────────

  private openForm(conn: DbConnection | null): void {
    if (conn) {
      this.formIsEdit = true;
      this.formValues = {
        label:    conn.label,
        type:     conn.type,
        host:     conn.host ?? 'localhost',
        port:     String(conn.port ?? DEFAULT_PORTS[conn.type] ?? ''),
        database: conn.database ?? '',
        username: conn.username ?? '',
        password: conn.password ?? '',
      };
    } else {
      this.formIsEdit = false;
      this.formValues = {
        label: '', type: 'postgresql', host: 'localhost',
        port: '5432', database: '', username: '', password: '',
      };
    }
    this.formFieldIdx = 0;
    this.phase = 'form';
  }

  private clampTypeField(): void {
    if (!DB_TYPES.includes(this.formValues.type as DbType)) {
      this.formValues.type = 'postgresql';
    }
  }

  private updateDefaultPort(): void {
    const dbType = this.formValues.type as DbType;
    const def = DEFAULT_PORTS[dbType];
    // Only overwrite if port field is empty or was a previous default
    const currentPort = Number(this.formValues.port);
    const isDefaultPort = Object.values(DEFAULT_PORTS).includes(currentPort) || !this.formValues.port;
    if (isDefaultPort) {
      this.formValues.port = def != null ? String(def) : '';
    }
  }

  private toggleDefault(): void {
    const conn = this.connections[this.listCursor];
    if (!conn) return;
    const isDefault = !conn.isDefault;
    const updated = this.connections.map((c, i) => ({
      ...c,
      isDefault: i === this.listCursor ? isDefault : (isDefault ? false : c.isDefault),
    }));
    this.connections = updated;
    if (conn) {
      this.onSave?.({ ...conn, isDefault });
    }
  }

  private submitForm(): void {
    const label = this.formValues.label.trim() || 'my-connection';
    const conn: DbConnection = {
      id: this.formIsEdit
        ? (this.connections[this.listCursor]?.id ?? nanoidSimple())
        : nanoidSimple(),
      label,
      type: this.formValues.type as DbType,
      host: this.formValues.host.trim() || undefined,
      port: this.formValues.port ? Number(this.formValues.port) : undefined,
      database: this.formValues.database.trim() || undefined,
      username: this.formValues.username.trim() || undefined,
      password: this.formValues.password || undefined,
    };

    this.onSave?.(conn);
    this.phase = 'list';
    this.startConnect(conn);
  }

  private startConnect(conn: DbConnection): void {
    this.phase = 'testing';
    this.testStartTime = Date.now();
    this.spinnerIdx = 0;
    this.markDirtyFn?.();

    void this.onConnect?.(conn)
      .then((ok) => {
        if (!ok) {
          this.errorMsg = 'Connection refused or credentials invalid';
          this.phase = 'error';
          this.markDirtyFn?.();
        }
        // On success, caller transitions the boot phase — no action needed here
      })
      .catch((err: unknown) => {
        this.errorMsg = err instanceof Error ? err.message.slice(0, 60) : 'Unknown error';
        this.phase = 'error';
        this.markDirtyFn?.();
      });
  }

  onSlowFrame(_ms: number): void {}

  getContext(): SceneContext {
    return { scene: 'connection', summary: 'Database connection manager' };
  }
}

/** Tiny nano-id substitute — no external dep needed */
function nanoidSimple(len = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
