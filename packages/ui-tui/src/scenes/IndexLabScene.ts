import type { IScene, SceneContext } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import { Table } from '../components/Table.js';
import type { TableColumn } from '../components/Table.js';
import { FilterBar } from '../components/FilterBar.js';
import { HintBar } from '../components/HintBar.js';
import { SectionHeader } from '../components/SectionHeader.js';
import { getTheme } from '../core/Theme.js';

export interface StreamHealthStat {
  entity_type: string;
  total_events: number;
  latest_event_time_ms: number;
  recovered_count: number;
  events_last_5min: number;
}

export interface IndexInfo {
  name: string;
  table: string;
  columns: string;
  scans: number;
  sizeHuman: string;
  isUnique: boolean;
}

export interface TableStatRow {
  table: string;
  seqScans: number;
  idxScans: number;
  idxRatioPct: number;
  liveRows: number;
  deadRows: number;
}

// ── mini bar helpers ───────────────────────────────────

function miniBar(pct: number, width = 10): string {
  const filled = Math.round(Math.max(0, Math.min(100, pct)) / 100 * width);
  return '▐' + '█'.repeat(filled) + '░'.repeat(width - filled) + '▌';
}

function fmtNum(n: unknown): string {
  const v = Number(n);
  if (isNaN(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

// ── Column definitions ─────────────────────────────────

const INDEX_COLUMNS: TableColumn[] = [
  { key: 'name',      label: 'Index Name', width: 24, flex: 2 },
  { key: 'table',     label: 'Table',      width: 18, flex: 1 },
  { key: 'columns',   label: 'Columns',    width: 20, flex: 2 },
  { key: 'scans',     label: 'Scans',      width: 10, align: 'right' },
  { key: 'sizeHuman', label: 'Size',       width: 10, align: 'right' },
  { key: 'unique',    label: 'Uniq',       width:  5 },
];

const HEALTH_COLUMNS: TableColumn[] = [
  { key: 'entity_type',          label: 'Entity',     width: 14, flex: 1 },
  { key: 'total_events',         label: 'Total',      width: 10, align: 'right', format: fmtNum },
  { key: 'events_last_5min',     label: 'Last 5min',  width: 10, align: 'right', format: fmtNum },
  { key: 'recovered_count',      label: 'Recovered',  width: 11, align: 'right', format: fmtNum },
  { key: 'latest_event_time_ms', label: 'Latest(ms)', width: 14, align: 'right' },
];

const STATS_COLUMNS: TableColumn[] = [
  { key: 'table',      label: 'Table',        width: 20, flex: 1 },
  { key: 'totalScans', label: 'Scans',        width:  8, align: 'right' },
  { key: 'seqScans',   label: 'Seq',          width:  8, align: 'right' },
  { key: 'idxScans',   label: 'Idx',          width:  8, align: 'right' },
  { key: 'idxBar',     label: 'Idx Efficiency', width: 18 },
  { key: 'liveRows',   label: 'Live',         width:  8, align: 'right' },
  { key: 'deadRows',   label: 'Dead',         width:  6, align: 'right' },
];

const TABS = ['INDEXES', 'STREAM HEALTH', 'TABLE STATS'] as const;
type Tab = typeof TABS[number];

const SPINNER_FRAMES = ['|', '/', '-', '\\'] as const;

export class IndexLabScene implements IScene {
  readonly name = 'indexlab';

  private readonly header     = new SectionHeader('[INDEX LAB]');
  private readonly indexTable  = new Table();
  private readonly healthTable = new Table();
  private readonly statsTable  = new Table();
  private readonly filterBar   = new FilterBar();
  private readonly hintBar     = new HintBar('↑/↓ Navigate  f Tab  / Filter  ? AI  Esc Clear');

  private tabIdx = 0;
  private indexes: Record<string, unknown>[] = [];
  private stats: Record<string, unknown>[]   = [];
  private tableStats: Record<string, unknown>[] = [];
  private loading        = true;
  private statsLoading   = true;
  private onRequestAiSuggest?: () => void;

  setIndexes(indexes: IndexInfo[]): void {
    this.indexes = indexes.map(idx => ({
      ...idx,
      unique: idx.isUnique ? '[U]' : '',
    })) as unknown as Record<string, unknown>[];
    this.loading = false;
  }

  setStats(stats: StreamHealthStat[]): void {
    this.stats = stats as unknown as Record<string, unknown>[];
    this.loading = false;
  }

  setTableStats(rows: TableStatRow[]): void {
    this.tableStats = rows.map(r => ({
      table:      r.table,
      seqScans:   r.seqScans,
      idxScans:   r.idxScans,
      totalScans: r.seqScans + r.idxScans,
      idxBar:     `${miniBar(r.idxRatioPct)} ${String(Math.round(r.idxRatioPct)).padStart(3)}%`,
      liveRows:   fmtNum(r.liveRows),
      deadRows:   fmtNum(r.deadRows),
      // carry through for color-coding in custom render
      _idxPct:    r.idxRatioPct,
      _dead:      r.deadRows,
    })) as unknown as Record<string, unknown>[];
    this.statsLoading = false;
  }

  setOnRequestAiSuggest(cb: () => void): void {
    this.onRequestAiSuggest = cb;
  }

  render(canvas: ITerminalCanvas): void {
    const { cols, rows } = canvas.getSize();
    const t = getTheme();

    const currentTab = TABS[this.tabIdx] as Tab;

    // ── Right badge ───────────────────────────────────────
    let rightInfo: string;
    if (currentTab === 'INDEXES') {
      rightInfo = this.loading ? 'loading...' : `${this.indexes.length} indexes`;
    } else if (currentTab === 'STREAM HEALTH') {
      rightInfo = this.loading ? 'loading...' : `${this.stats.length} entity types`;
    } else {
      rightInfo = this.statsLoading ? 'loading...' : `${this.tableStats.length} tables`;
    }
    this.header.render(canvas, 1, rightInfo);

    // ── Neon tab bar ──────────────────────────────────────
    let tabX = 12;
    for (let i = 0; i < TABS.length; i++) {
      const tab = TABS[i]!;
      const isActive = i === this.tabIdx;
      if (i > 0) {
        canvas.write(tabX, 1, ' │ ', t.s.borderDim);
        tabX += 3;
      }
      if (isActive) {
        canvas.write(tabX, 1, `> ${tab}`, { color: t.palette.accent, bold: true, underline: true });
        tabX += 2 + tab.length;
      } else {
        canvas.write(tabX, 1, tab, t.s.tabInactive);
        tabX += tab.length;
      }
    }

    // ── Loading spinner ───────────────────────────────────
    const isLoading = currentTab === 'TABLE STATS' ? this.statsLoading : this.loading;
    if (isLoading) {
      const spinner = SPINNER_FRAMES[Math.floor(Date.now() / 150) % SPINNER_FRAMES.length] ?? '|';
      canvas.write(2, 3, `${spinner} Loading data from API...`, { color: t.palette.accent });
      canvas.write(2, 4, '  Make sure the API server is running', t.s.dim);
      return;
    }

    // ── Tab content ───────────────────────────────────────
    const tableRegion = { x: 0, y: 2, width: cols, height: rows - 4 };

    if (currentTab === 'INDEXES') {
      this.indexTable.render(canvas, tableRegion, INDEX_COLUMNS, this.indexes);

      if (this.indexes.length === 0) {
        canvas.write(2, 5, '@  No index data available.', { color: t.palette.warning, bold: true });
        canvas.write(2, 6, '   Ensure the API server is running and DB is connected.', t.s.dim);
      }

    } else if (currentTab === 'STREAM HEALTH') {
      this.healthTable.render(canvas, tableRegion, HEALTH_COLUMNS, this.stats);

      if (this.stats.length === 0) {
        canvas.write(2, 5, '-  No stream health data available.', { color: t.palette.muted });
      }

    } else {
      // TABLE STATS tab
      this.statsTable.render(canvas, tableRegion, STATS_COLUMNS, this.tableStats);

      if (this.tableStats.length === 0) {
        canvas.write(2, 5, '-  No table stats available.', t.s.muted);
        canvas.write(2, 6, '   pg_stat_user_tables returns data after first queries run.', t.s.dim);
      } else {
        this.renderStatsLegend(canvas, cols, rows);
      }
    }

    if (this.filterBar.isActive() || this.filterBar.hasFilter()) {
      this.filterBar.render(canvas, rows - 2);
    } else {
      this.hintBar.render(canvas, rows - 2);
    }
  }

  private renderStatsLegend(canvas: ITerminalCanvas, cols: number, rows: number): void {
    const t = getTheme();
    // Bottom-right legend
    const legendY = rows - 3;
    const legend = '▐████████░░▌ = idx efficiency  ░░ = seq-scan heavy';
    const legendX = Math.max(2, cols - legend.length - 2);
    if (legendX > cols / 2) {
      canvas.write(legendX, legendY, '▐████████░░▌', { color: t.palette.success });
      canvas.write(legendX + 12, legendY, ' = idx efficiency  ', t.s.dim);
      canvas.write(legendX + 31, legendY, '░░', { color: t.palette.warning });
      canvas.write(legendX + 33, legendY, ' = seq-scan heavy', t.s.dim);
    }
  }

  onKeyPress(key: string): void {
    if (this.filterBar.handleKey(key)) {
      const table = this.activeTable();
      table.setFilter(this.filterBar.getText());
      return;
    }

    const currentTab = TABS[this.tabIdx] as Tab;
    const data = this.activeData();

    switch (key) {
      case 'up':
      case 'k':        this.activeTable().moveUp(); break;
      case 'down':
      case 'j':        this.activeTable().moveDown(data.length); break;
      case 'pageup':   this.activeTable().movePageUp(); break;
      case 'pagedown': this.activeTable().movePageDown(data.length); break;
      case '/':        this.filterBar.activate(); break;
      case '\u001b':   this.filterBar.clear(); this.activeTable().clearFilter(); break;
      case 'f':
        this.tabIdx = (this.tabIdx + 1) % TABS.length;
        this.indexTable.reset();
        this.healthTable.reset();
        this.statsTable.reset();
        this.filterBar.clear();
        break;
      case 'a':
        this.onRequestAiSuggest?.();
        break;
    }

    void currentTab; // used for future tab-specific keys
  }

  getContext(): SceneContext {
    const currentTab = TABS[this.tabIdx] as Tab;
    if (currentTab === 'INDEXES') {
      return {
        scene: 'indexlab',
        summary: `Index Lab — ${this.indexes.length} indexes loaded.`,
        details: { tab: 'INDEXES', indexes: this.indexes.slice(0, 10) },
      };
    }
    if (currentTab === 'STREAM HEALTH') {
      return {
        scene: 'indexlab',
        summary: `Index Lab — Stream Health. ${this.stats.length} entity types monitored.`,
        details: { tab: 'STREAM HEALTH', stats: this.stats.slice(0, 10) },
      };
    }
    return {
      scene: 'indexlab',
      summary: `Index Lab — Table Stats. ${this.tableStats.length} tables tracked.`,
      details: { tab: 'TABLE STATS', tableStats: this.tableStats.slice(0, 10) },
    };
  }

  onSlowFrame(_durationMs: number): void {}

  private activeTable(): Table {
    const tab = TABS[this.tabIdx] as Tab;
    if (tab === 'INDEXES') return this.indexTable;
    if (tab === 'STREAM HEALTH') return this.healthTable;
    return this.statsTable;
  }

  private activeData(): Record<string, unknown>[] {
    const tab = TABS[this.tabIdx] as Tab;
    if (tab === 'INDEXES') return this.indexes;
    if (tab === 'STREAM HEALTH') return this.stats;
    return this.tableStats;
  }
}
