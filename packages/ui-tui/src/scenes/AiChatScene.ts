import type { IScene } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import { SectionHeader } from '../components/SectionHeader.js';
import { WelcomePanel } from '../components/WelcomePanel.js';
import { getTheme, Icons, fmtTimestamp } from '../core/Theme.js';

function fmtTime(ts: number): string {
  return fmtTimestamp(ts, 'short');
}

interface ChatMessage {
  role: 'user' | 'ai' | 'system';
  content: string;
  sql?: string | null;
  intent?: string | null;
  model?: string;
  timestamp: number;
  queryResult?: SqlExecResult;
}

interface AiModelInfo {
  name: string;
  provider: string;
  active: boolean;
}

export interface SqlExecResult {
  type: 'query' | 'dml' | 'ddl' | 'other';
  rows?: Record<string, unknown>[];
  rowCount?: number;
  columns?: string[];
  message?: string;
  error?: string;
}

export interface AiChatCallbacks {
  onSendStream: (
    messages: { role: string; content: string }[],
    opts?: { model?: string; mode?: 'stream' | 'agentic' },
  ) => Promise<void>;
  onExecuteSql: (sql: string) => Promise<SqlExecResult>;
  onFetchModels: () => Promise<{ models: AiModelInfo[]; default: string; providers: string[] }>;
}

type SlashCommand = {
  name: string;
  desc: string;
  handler: (args: string) => void;
};

type AiConnectionStatus = 'checking' | 'connected' | 'disconnected';

export class AiChatScene implements IScene {
  readonly name = 'aichat';

  private readonly header = new SectionHeader('AI CHAT');
  private readonly welcomePanel = new WelcomePanel();
  private chatStartTime = Date.now();

  private messages: ChatMessage[] = [];
  private input = '';
  private inputActive = true;
  private scrollOffset = 0;
  private loading = false;
  private selectedSqlIndex = -1;
  private callbacks?: AiChatCallbacks;

  private currentModel = '';
  private activeProviders: string[] = [];
  private availableModels: AiModelInfo[] = [];
  private showModelPicker = false;
  private modelPickerIndex = 0;

  private streamingContent = '';
  private streamingIntent: string | null = null;

  private markDirtyFn?: () => void;

  private slashCommands: SlashCommand[] = [];
  private sceneContext = '';

  private connectionStatus: AiConnectionStatus = 'checking';
  private lastRetryAt = 0;

  constructor() {
    this.messages.push({
      role: 'system',
      content: 'beanllm AI Database Assistant — Type a message or use /help for commands.',
      timestamp: Date.now(),
    });

    this.slashCommands = [
      { name: 'help', desc: 'Show available commands', handler: () => this.cmdHelp() },
      { name: 'model', desc: 'Switch LLM model (/model <name>)', handler: (a) => this.cmdModel(a) },
      { name: 'clear', desc: 'Clear chat history', handler: () => this.cmdClear() },
      { name: 'models', desc: 'List available models', handler: () => this.cmdListModels() },
      { name: 'sql', desc: 'Execute SQL (/sql SELECT * FROM ...)', handler: (a) => this.cmdSql(a) },
      { name: 'tables', desc: 'Show all tables', handler: () => this.cmdTables() },
      { name: 'describe', desc: 'Describe table (/describe state_users)', handler: (a) => this.cmdDescribe(a) },
      { name: 'index', desc: 'Manage indexes (/index create|drop ...)', handler: (a) => this.cmdIndex(a) },
      { name: 'context', desc: 'Show current DB context', handler: () => this.cmdContext() },
      { name: 'retry', desc: 'Retry connecting to beanllm', handler: () => this.cmdRetry() },
    ];
  }

  setCallbacks(cb: AiChatCallbacks): void {
    this.callbacks = cb;
  }

  setMarkDirty(fn: () => void): void {
    this.markDirtyFn = fn;
  }

  setSceneContext(ctx: string): void {
    this.sceneContext = ctx;
  }

  appendStreamChunk(chunk: string): void {
    this.streamingContent += chunk;
    this.markDirtyFn?.();
  }

  setStreamIntent(intent: string): void {
    this.streamingIntent = intent;
    this.markDirtyFn?.();
  }

  finalizeStream(content: string, sql: string | null, model: string, intent?: string | null): void {
    this.messages.push({
      role: 'ai',
      content,
      sql,
      intent,
      model,
      timestamp: Date.now(),
    });
    this.streamingContent = '';
    this.streamingIntent = null;
    this.loading = false;
    this.scrollToBottom();
    if (sql) this.selectLastSql();
    this.markDirtyFn?.();
  }

  setStreamError(error: string): void {
    this.messages.push({
      role: 'ai',
      content: `Error: ${error}`,
      timestamp: Date.now(),
    });
    this.streamingContent = '';
    this.streamingIntent = null;
    this.loading = false;
    this.scrollToBottom();
    this.markDirtyFn?.();
  }

  setModelInfo(model: string, providers: string[], models: AiModelInfo[]): void {
    this.currentModel = model;
    this.activeProviders = providers;
    this.availableModels = models;
    this.connectionStatus = 'connected';
  }

  setConnectionStatus(status: AiConnectionStatus): void {
    const prev = this.connectionStatus;
    this.connectionStatus = status;

    if (status === 'disconnected' && prev !== 'disconnected') {
      this.messages.push({
        role: 'system',
        content: [
          '⚠ beanllm AI sidecar에 연결할 수 없습니다.',
          '',
          '  시작 방법:',
          '    1. python3 scripts/ai-sidecar.py',
          '    2. 또는 pnpm dev:all (자동 시작)',
          '',
          '  필요 조건:',
          '    • beanllm이 ../beanllm 에 설치되어 있어야 합니다',
          '    • pip install fastapi uvicorn',
          '    • LLM 프로바이더 설정 (.env 또는 beanllm/.env)',
          '',
          '  /retry 로 재연결 시도  │  /sql 로 직접 SQL 실행 가능',
        ].join('\n'),
        timestamp: Date.now(),
      });
      this.scrollToBottom();
    } else if (status === 'connected' && prev === 'disconnected') {
      this.messages.push({
        role: 'system',
        content: '+ beanllm AI sidecar 연결됨!',
        timestamp: Date.now(),
      });
      this.scrollToBottom();
    }
  }

  getConnectionStatus(): AiConnectionStatus {
    return this.connectionStatus;
  }

  // ─── Rendering ────────────────────────────────────────────

  render(canvas: ITerminalCanvas): void {
    const { cols, rows } = canvas.getSize();
    const t = getTheme();

    let modelBadge: string;
    let badgeStyle: { color: string; bold?: boolean } | undefined;

    switch (this.connectionStatus) {
      case 'connected':
        modelBadge = `* ${this.currentModel} │ ${this.activeProviders.join(', ') || '...'}`;
        badgeStyle = { color: t.palette.success };
        break;
      case 'checking':
        modelBadge = 'o connecting...';
        badgeStyle = { color: t.palette.sysColor };
        break;
      case 'disconnected':
        modelBadge = '! disconnected — /retry';
        badgeStyle = { color: t.palette.error };
        break;
    }

    this.header.render(canvas, 1, modelBadge);
    if (badgeStyle) {
      canvas.write(cols - modelBadge.length - 2, 1, modelBadge, badgeStyle);
    }

    const chatTop = 2;
    const chatBottom = rows - 2;
    const chatHeight = chatBottom - chatTop;

    const userMessages = this.messages.filter(m => m.role !== 'system');
    if (userMessages.length === 0 && !this.loading) {
      this.welcomePanel.renderFull(canvas, chatTop, {
        model: this.currentModel || 'unknown',
        connectionStatus: this.connectionStatus,
        dbConnected: true,
        messageCount: 0,
      });
    } else {
      this.renderMessages(canvas, chatTop, chatHeight, cols);
    }

    if (this.showModelPicker) {
      this.renderModelPicker(canvas, rows - 2, cols);
    } else {
      this.renderInput(canvas, rows - 2, cols);
    }
  }

  private renderMessages(canvas: ITerminalCanvas, startY: number, height: number, cols: number): void {
    const lines = this.buildDisplayLines(cols - 4);
    const totalLines = lines.length;
    const maxScroll = Math.max(0, totalLines - height);
    if (this.scrollOffset > maxScroll) this.scrollOffset = maxScroll;

    const visible = lines.slice(this.scrollOffset, this.scrollOffset + height);

    for (let i = 0; i < visible.length && i < height; i++) {
      const line = visible[i];
      canvas.write(1, startY + i, line.text.padEnd(cols - 2).slice(0, cols - 2), {
        color: line.color,
        bold: line.bold,
      });
    }

    if (totalLines > height) {
      const thumbSize = Math.max(1, Math.round((height / totalLines) * height));
      const thumbStart = Math.round((this.scrollOffset / maxScroll) * (height - thumbSize));
      for (let i = 0; i < height; i++) {
        const ch = i >= thumbStart && i < thumbStart + thumbSize ? '█' : '░';
        canvas.write(cols - 1, startY + i, ch, { color: '#67e8f9' });
      }
    }
  }

  private buildDisplayLines(maxWidth: number): DisplayLine[] {
    const t = getTheme();
    const p = t.palette;
    const lines: DisplayLine[] = [];
    let sqlBlockIndex = 0;
    const sepLine = '─'.repeat(Math.min(maxWidth, 76));

    for (const msg of this.messages) {
      if (msg.role === 'system') {
        lines.push({ text: `  ${Icons.info} ${msg.content}`, color: p.dim });
        lines.push({ text: '', color: p.text });
        continue;
      }

      const isUser = msg.role === 'user';
      const time = fmtTime(msg.timestamp);

      // ─── beanllm-style separator + header ─────
      lines.push({ text: ` ${sepLine}`, color: p.separator });

      if (isUser) {
        lines.push({ text: ` ${Icons.user} You  ${time}`, color: p.userColor, bold: true });
      } else {
        const modelTag = msg.model ? `  (${msg.model})` : '';
        lines.push({ text: ` ${Icons.assistant} Assistant${modelTag}  ${time}`, color: p.assistColor, bold: true });
        if (msg.intent) {
          lines.push({ text: `   [${msg.intent}]`, color: p.sysColor, bold: true });
        }
      }

      // ─── Content ──────────────────────────────
      const contentLines = this.wrapText(msg.content, maxWidth - 4);
      for (const cl of contentLines) {
        lines.push({ text: `   ${cl}`, color: p.text });
      }

      // ─── SQL block ────────────────────────────
      if (msg.sql) {
        const isSelected = sqlBlockIndex === this.selectedSqlIndex;
        const sqlColor = isSelected ? p.accent : p.success;
        const marker = isSelected ? ` ${Icons.arrow} ` : '   ';
        lines.push({ text: `${marker}┌─ SQL ${'─'.repeat(Math.max(0, maxWidth - 12))}`, color: sqlColor, bold: isSelected });
        for (const sl of msg.sql.split('\n')) {
          lines.push({ text: `${marker}│ ${sl}`, color: sqlColor });
        }
        lines.push({ text: `${marker}└${'─'.repeat(Math.max(0, maxWidth - 6))}`, color: sqlColor, bold: isSelected });
        if (isSelected) {
          lines.push({ text: `    ${Icons.arrow} Enter execute  │  Tab cycle`, color: p.sysColor, bold: true });
        }
        sqlBlockIndex++;
      }

      // ─── Query result ─────────────────────────
      if (msg.queryResult) {
        this.renderQueryResultLines(lines, msg.queryResult, maxWidth);
      }

      // ─── Response meta (AI only) ──────────────
      if (!isUser && !this.loading) {
        const charCount = msg.content.length;
        if (charCount > 0) {
          lines.push({ text: `   ⏱  ·  ${charCount.toLocaleString()} chars`, color: p.muted });
        }
      }

      lines.push({ text: '', color: p.text });
    }

    // ─── Streaming / thinking ───────────────────
    if (this.loading) {
      lines.push({ text: ` ${sepLine}`, color: p.separator });
      const time = fmtTime(Date.now());
      const intentTag = this.streamingIntent ? ` [${this.streamingIntent}]` : '';
      lines.push({ text: ` ${Icons.assistant} Assistant${intentTag}  ${time}`, color: p.assistColor, bold: true });

      if (this.streamingContent) {
        const streamLines = this.wrapText(this.streamingContent, maxWidth - 4);
        for (const sl of streamLines) {
          lines.push({ text: `   ${sl}`, color: p.text });
        }
        lines.push({ text: '   ▍', color: p.brand });
      } else {
        const frames = ['|', '/', '-', '\\'];
        const frame = frames[Math.floor(Date.now() / 200) % frames.length];
        lines.push({ text: `   ${frame} Thinking...`, color: p.brand });
      }
    }

    return lines;
  }

  private renderInput(canvas: ITerminalCanvas, y: number, cols: number): void {
    const t = getTheme();
    const msgCount = this.messages.filter(m => m.role !== 'system').length;
    const elapsed = Math.floor((Date.now() - this.chatStartTime) / 1000);
    const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m`;
    const rightInfo = `${Icons.model} ${this.currentModel || '?'} · ${msgCount} msgs · ${elapsedStr}`;

    if (this.inputActive) {
      const isSlash = this.input.startsWith('/');
      const prefix = isSlash ? ` / ` : ` ${Icons.prompt} `;
      const prefixStyle = isSlash
        ? { color: t.palette.success, bold: true }
        : { color: t.palette.brand, bold: true };
      canvas.write(1, y, prefix, prefixStyle);
      const rightLen = rightInfo.length + 2;
      const maxLen = cols - prefix.length - rightLen - 2;
      const inputDisplay = this.input + '▍';
      const shown = inputDisplay.length > maxLen
        ? inputDisplay.slice(inputDisplay.length - maxLen)
        : inputDisplay;
      canvas.write(prefix.length + 1, y, shown, t.s.text);
      canvas.write(cols - rightLen, y, rightInfo, t.s.dim);
    } else {
      canvas.write(1, y, ` ${Icons.prompt} `, { color: t.palette.brand, bold: true });
      canvas.write(5, y, 'Enter Send  / Cmd  Esc Back  ↑↓ Scroll', t.s.muted);
      canvas.write(cols - rightInfo.length - 2, y, rightInfo, t.s.dim);
    }
  }

  private renderModelPicker(canvas: ITerminalCanvas, y: number, cols: number): void {
    const t = getTheme();
    canvas.write(1, y, ' Select Model:', t.s.accent);
    const maxShow = Math.min(this.availableModels.length, 5);
    const start = Math.max(0, this.modelPickerIndex - 2);
    for (let i = 0; i < maxShow && start + i < this.availableModels.length; i++) {
      const m = this.availableModels[start + i];
      const idx = start + i;
      const sel = idx === this.modelPickerIndex ? ' > ' : '   ';
      const label = `${m.name} (${m.provider})`;
      const active = m.active ? '' : ' [inactive]';
      const maxLen = cols - 10;
      canvas.write(1, y + 1 + i, `${sel}${(label + active).slice(0, maxLen)}`, {
        color: idx === this.modelPickerIndex ? 'cyan' : 'white',
        bold: idx === this.modelPickerIndex,
      });
    }
  }

  // ─── Input Handling ───────────────────────────────────────

  onKeyPress(key: string): void {
    if (this.showModelPicker) {
      this.handleModelPickerKey(key);
      return;
    }

    if (this.loading && key === '\u001b') {
      return;
    }

    if (!this.inputActive) {
      if (key === 'up') {
        this.scrollOffset = Math.max(0, this.scrollOffset - 1);
        return;
      }
      if (key === 'down') {
        this.scrollOffset += 1;
        return;
      }
      if (key === '\t') {
        this.cycleSqlSelection();
        return;
      }
      if (key === '\r' || key === '\n') {
        this.executeSqlBlock();
        return;
      }
      if (key === 'pageup') {
        this.scrollOffset = Math.max(0, this.scrollOffset - 10);
        return;
      }
      if (key === 'pagedown') {
        this.scrollOffset += 10;
        return;
      }
      if (key !== '\u001b') {
        this.inputActive = true;
        if (key.length === 1 && key >= ' ') {
          this.input = key;
        }
        return;
      }
      return;
    }

    if (key === '\u001b') {
      if (this.input) {
        this.input = '';
      } else {
        this.inputActive = false;
        this.selectLastSql();
      }
      return;
    }

    if (key === '\r' || key === '\n') {
      if (this.input.trim()) {
        this.processInput(this.input.trim());
      }
      return;
    }

    if (key === '\u007f' || key === '\b') {
      this.input = this.input.slice(0, -1);
      return;
    }

    if (key.length === 1 && key >= ' ') {
      this.input += key;
    }
  }

  private processInput(text: string): void {
    if (text.startsWith('/')) {
      const parts = text.slice(1).split(/\s+/);
      const cmdName = parts[0]?.toLowerCase() ?? '';
      const args = parts.slice(1).join(' ');
      const cmd = this.slashCommands.find(c => c.name === cmdName);
      if (cmd) {
        cmd.handler(args);
        this.input = '';
        return;
      }
      this.messages.push({
        role: 'system',
        content: `Unknown command: /${cmdName}. Type /help for available commands.`,
        timestamp: Date.now(),
      });
      this.input = '';
      this.scrollToBottom();
      return;
    }

    this.sendMessage(text);
  }

  private sendMessage(prompt: string): void {
    this.messages.push({ role: 'user', content: prompt, timestamp: Date.now() });
    this.input = '';

    if (this.connectionStatus === 'disconnected') {
      this.messages.push({
        role: 'system',
        content: 'AI가 연결되지 않았습니다. /retry 로 재연결하거나 /sql 로 직접 SQL을 실행하세요.',
        timestamp: Date.now(),
      });
      this.scrollToBottom();
      return;
    }

    this.loading = true;
    this.streamingContent = '';
    this.streamingIntent = null;
    this.scrollToBottom();

    if (this.callbacks) {
      const history = this.messages
        .filter(m => m.role !== 'system')
        .slice(-20)
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : m.role, content: m.content }));

      this.callbacks.onSendStream(history, {
        model: this.currentModel || undefined,
        mode: 'stream',
      }).catch(err => {
        this.setStreamError(err instanceof Error ? err.message : String(err));
      });
    }
  }

  private handleModelPickerKey(key: string): void {
    if (key === '\u001b') {
      this.showModelPicker = false;
      return;
    }
    if (key === 'up' || key === '\u001b[A') {
      this.modelPickerIndex = Math.max(0, this.modelPickerIndex - 1);
      return;
    }
    if (key === 'down' || key === '\u001b[B') {
      this.modelPickerIndex = Math.min(this.availableModels.length - 1, this.modelPickerIndex + 1);
      return;
    }
    if (key === '\r' || key === '\n') {
      const selected = this.availableModels[this.modelPickerIndex];
      if (selected) {
        this.currentModel = selected.name;
        this.messages.push({
          role: 'system',
          content: `Model switched to ${selected.name} (${selected.provider})`,
          timestamp: Date.now(),
        });
        this.scrollToBottom();
      }
      this.showModelPicker = false;
    }
  }

  // ─── Slash Commands ───────────────────────────────────────

  private cmdHelp(): void {
    const lines = ['Available commands:'];
    for (const cmd of this.slashCommands) {
      lines.push(`  /${cmd.name.padEnd(10)} ${cmd.desc}`);
    }
    lines.push('');
    lines.push('Or just type a question in natural language.');
    this.messages.push({ role: 'system', content: lines.join('\n'), timestamp: Date.now() });
    this.scrollToBottom();
  }

  private cmdModel(args: string): void {
    if (!args.trim()) {
      if (this.availableModels.length > 0) {
        this.showModelPicker = true;
        this.modelPickerIndex = this.availableModels.findIndex(m => m.name === this.currentModel);
        if (this.modelPickerIndex < 0) this.modelPickerIndex = 0;
      } else {
        this.callbacks?.onFetchModels().then(data => {
          this.setModelInfo(data.default, data.providers, data.models);
          this.showModelPicker = true;
          this.modelPickerIndex = 0;
          this.markDirtyFn?.();
        }).catch(() => {
          this.messages.push({
            role: 'system',
            content: 'Failed to fetch models. Is the AI sidecar running?',
            timestamp: Date.now(),
          });
          this.scrollToBottom();
          this.markDirtyFn?.();
        });
      }
      return;
    }

    this.currentModel = args.trim();
    this.messages.push({
      role: 'system',
      content: `Model set to: ${this.currentModel}`,
      timestamp: Date.now(),
    });
    this.scrollToBottom();
  }

  private cmdClear(): void {
    this.messages = [{
      role: 'system',
      content: 'Chat cleared. beanllm AI Database Assistant ready.',
      timestamp: Date.now(),
    }];
    this.scrollOffset = 0;
    this.selectedSqlIndex = -1;
  }

  private cmdListModels(): void {
    if (!this.callbacks) return;
    this.callbacks.onFetchModels().then(data => {
      this.setModelInfo(data.default, data.providers, data.models);
      const lines = [`Available models (${data.models.length}):`];
      for (const m of data.models) {
        const active = m.active ? '*' : 'o';
        const current = m.name === this.currentModel ? ' ← current' : '';
        lines.push(`  ${active} ${m.name} (${m.provider})${current}`);
      }
      lines.push(`\nActive providers: ${data.providers.join(', ') || 'none'}`);
      this.messages.push({ role: 'system', content: lines.join('\n'), timestamp: Date.now() });
      this.scrollToBottom();
      this.markDirtyFn?.();
    }).catch(() => {
      this.messages.push({
        role: 'system',
        content: 'Failed to fetch models.',
        timestamp: Date.now(),
      });
      this.scrollToBottom();
      this.markDirtyFn?.();
    });
  }

  private cmdSql(args: string): void {
    if (!args.trim()) {
      this.messages.push({
        role: 'system',
        content: 'Usage: /sql <SQL statement>\nExample: /sql SELECT * FROM state_users LIMIT 5',
        timestamp: Date.now(),
      });
      this.scrollToBottom();
      return;
    }

    const sql = args.trim();
    const sysMsg: ChatMessage = {
      role: 'system',
      content: `Executing: ${sql.slice(0, 60)}...`,
      timestamp: Date.now(),
    };
    this.messages.push(sysMsg);
    this.scrollToBottom();
    this.markDirtyFn?.();

    this.callbacks?.onExecuteSql(sql).then(result => {
      sysMsg.queryResult = result;
      if (result.error) {
        sysMsg.content = `! Error: ${result.error}`;
      } else if (result.type === 'query') {
        sysMsg.content = `+ ${result.rowCount ?? 0} row(s) returned`;
      } else {
        sysMsg.content = `+ ${result.message ?? `${result.rowCount ?? 0} row(s) affected`}`;
      }
      this.scrollToBottom();
      this.markDirtyFn?.();
    }).catch(err => {
      sysMsg.content = `! ${err instanceof Error ? err.message : String(err)}`;
      this.scrollToBottom();
      this.markDirtyFn?.();
    });
  }

  private cmdContext(): void {
    const ctx = this.sceneContext || 'No context available. Navigate to a data scene first.';
    this.messages.push({
      role: 'system',
      content: `Current context:\n${ctx}`,
      timestamp: Date.now(),
    });
    this.scrollToBottom();
  }

  private cmdRetry(): void {
    this.connectionStatus = 'checking';
    this.lastRetryAt = Date.now();
    this.messages.push({
      role: 'system',
      content: 'Retrying connection to beanllm sidecar...',
      timestamp: Date.now(),
    });
    this.scrollToBottom();

    this.callbacks?.onFetchModels().then(data => {
      this.setModelInfo(data.default, data.providers, data.models);
      this.setConnectionStatus('connected');
      this.markDirtyFn?.();
    }).catch(() => {
      this.setConnectionStatus('disconnected');
      this.markDirtyFn?.();
    });
  }

  private cmdTables(): void {
    this.cmdSql(
      `SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size ` +
      `FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
  }

  private cmdDescribe(args: string): void {
    const table = args.trim();
    if (!table) {
      this.messages.push({
        role: 'system',
        content: 'Usage: /describe <table_name>\nExample: /describe state_users',
        timestamp: Date.now(),
      });
      this.scrollToBottom();
      return;
    }
    this.cmdSql(
      `SELECT column_name, data_type, is_nullable, column_default ` +
      `FROM information_schema.columns WHERE table_name = '${table.replace(/'/g, "''")}' ORDER BY ordinal_position`,
    );
  }

  private cmdIndex(args: string): void {
    const parts = args.trim().split(/\s+/);
    const action = parts[0]?.toLowerCase();

    if (!action || action === 'list') {
      this.cmdSql(
        `SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`,
      );
      return;
    }

    if (action === 'create') {
      const table = parts[1];
      const columns = parts.slice(2);
      if (!table || columns.length === 0) {
        this.messages.push({
          role: 'system',
          content: 'Usage: /index create <table> <col1> [col2...]\nExample: /index create state_orders status user_id_hash',
          timestamp: Date.now(),
        });
        this.scrollToBottom();
        return;
      }
      const idxName = `idx_${table}_${columns.join('_')}`;
      this.cmdSql(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${idxName} ON ${table} (${columns.join(', ')})`);
      return;
    }

    if (action === 'drop') {
      const name = parts[1];
      if (!name) {
        this.messages.push({
          role: 'system',
          content: 'Usage: /index drop <index_name>',
          timestamp: Date.now(),
        });
        this.scrollToBottom();
        return;
      }
      this.cmdSql(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
      return;
    }

    this.messages.push({
      role: 'system',
      content: 'Usage:\n  /index list        — Show all indexes\n  /index create <table> <col1> [col2...]  — Create index\n  /index drop <name>  — Drop index',
      timestamp: Date.now(),
    });
    this.scrollToBottom();
  }

  // ─── Helpers ──────────────────────────────────────────────

  private selectLastSql(): void {
    let count = 0;
    for (const msg of this.messages) {
      if (msg.sql) count++;
    }
    this.selectedSqlIndex = count > 0 ? count - 1 : -1;
  }

  private cycleSqlSelection(): void {
    let count = 0;
    for (const msg of this.messages) {
      if (msg.sql) count++;
    }
    if (count === 0) return;
    this.selectedSqlIndex = (this.selectedSqlIndex + 1) % count;
  }

  private executeSqlBlock(): void {
    if (this.selectedSqlIndex < 0 || !this.callbacks) return;
    let idx = 0;
    for (const msg of this.messages) {
      if (msg.sql) {
        if (idx === this.selectedSqlIndex) {
          const sql = msg.sql;
          this.messages.push({
            role: 'system',
            content: `Executing: ${sql.slice(0, 60)}...`,
            timestamp: Date.now(),
          });
          this.scrollToBottom();
          this.markDirtyFn?.();

          this.callbacks.onExecuteSql(sql).then(result => {
            const lastMsg = this.messages[this.messages.length - 1];
            if (lastMsg.role === 'system' && lastMsg.content.startsWith('Executing:')) {
              lastMsg.queryResult = result;
              if (result.error) {
                lastMsg.content = `! Error: ${result.error}`;
              } else if (result.type === 'query') {
                lastMsg.content = `+ ${result.rowCount ?? 0} row(s) returned`;
              } else {
                lastMsg.content = `+ ${result.message ?? `${result.rowCount ?? 0} row(s) affected`}`;
              }
            }
            this.scrollToBottom();
            this.markDirtyFn?.();
          }).catch(err => {
            this.messages.push({
              role: 'system',
              content: `! ${err instanceof Error ? err.message : String(err)}`,
              timestamp: Date.now(),
            });
            this.scrollToBottom();
            this.markDirtyFn?.();
          });
          return;
        }
        idx++;
      }
    }
  }

  private renderQueryResultLines(lines: DisplayLine[], result: SqlExecResult, maxWidth: number): void {
    if (result.error) {
      lines.push({ text: `   ! ${result.error}`, color: '#f87171', bold: true });
      return;
    }

    if (result.type !== 'query' || !result.rows?.length || !result.columns?.length) {
      return;
    }

    const cols = result.columns;
    const rows = result.rows.slice(0, 20);

    const colWidths: number[] = cols.map(c => c.length);
    for (const row of rows) {
      for (let i = 0; i < cols.length; i++) {
        const val = String(row[cols[i]] ?? '');
        colWidths[i] = Math.min(Math.max(colWidths[i], val.length), 24);
      }
    }

    const totalWidth = colWidths.reduce((s, w) => s + w + 3, 1);
    const fits = totalWidth <= maxWidth - 4;

    if (!fits) {
      for (let i = 0; i < cols.length; i++) {
        colWidths[i] = Math.min(colWidths[i], Math.floor((maxWidth - 4) / cols.length) - 3);
        if (colWidths[i] < 3) colWidths[i] = 3;
      }
    }

    const headerLine = '   ┌' + cols.map((_, i) => '─'.repeat(colWidths[i] + 2)).join('┬') + '┐';
    const headerText = '   │' + cols.map((c, i) => ` ${c.slice(0, colWidths[i]).padEnd(colWidths[i])} `).join('│') + '│';
    const separator = '   ├' + cols.map((_, i) => '─'.repeat(colWidths[i] + 2)).join('┼') + '┤';
    const footer = '   └' + cols.map((_, i) => '─'.repeat(colWidths[i] + 2)).join('┴') + '┘';

    lines.push({ text: headerLine, color: '#67e8f9' });
    lines.push({ text: headerText, color: '#67e8f9', bold: true });
    lines.push({ text: separator, color: '#67e8f9' });

    for (const row of rows) {
      const cells = cols.map((c, i) => {
        const val = String(row[c] ?? '');
        const truncated = val.length > colWidths[i] ? val.slice(0, colWidths[i] - 1) + '…' : val;
        return ` ${truncated.padEnd(colWidths[i])} `;
      });
      lines.push({ text: `   │${cells.join('│')}│`, color: '#e5e7eb' });
    }

    lines.push({ text: footer, color: '#67e8f9' });

    if (result.rows.length > 20) {
      lines.push({ text: `   ... ${result.rows.length - 20} more rows`, color: '#e5e7eb' });
    }
  }

  private scrollToBottom(): void {
    this.scrollOffset = 999999;
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const result: string[] = [];
    for (const line of text.split('\n')) {
      if (line.length <= maxWidth) {
        result.push(line);
      } else {
        let remaining = line;
        while (remaining.length > maxWidth) {
          let breakAt = remaining.lastIndexOf(' ', maxWidth);
          if (breakAt <= 0) breakAt = maxWidth;
          result.push(remaining.slice(0, breakAt));
          remaining = remaining.slice(breakAt).trimStart();
        }
        if (remaining) result.push(remaining);
      }
    }
    return result;
  }

  onSlowFrame(_durationMs: number): void {}
}

type DisplayLine = { text: string; color: string; bold?: boolean };
