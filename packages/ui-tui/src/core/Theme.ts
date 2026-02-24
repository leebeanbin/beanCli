import type { TextStyle } from './TerminalCanvas.js';

export interface ThemePalette {
  brand:       string;
  brandAlt:    string;
  accent:      string;
  userColor:   string;
  assistColor: string;
  sysColor:    string;
  error:       string;
  warning:     string;
  success:     string;
  info:        string;
  border:      string;
  borderDim:   string;
  muted:       string;
  dim:         string;
  text:        string;
  bgPanel:     string;
  bgToolbar:   string;
  separator:   string;
  codeBg:      string;
  codeBorder:  string;
  gradient:    string[];
  rowAlt:      string;   // subtle alternate-row background (odd rows)
  rowSel:      string;   // full-row selection background
}

const DARK_PALETTE: ThemePalette = {
  brand:       '#a78bfa',
  brandAlt:    '#818cf8',
  accent:      '#67e8f9',
  userColor:   '#60a5fa',
  assistColor: '#a78bfa',
  sysColor:    '#fbbf24',
  error:       '#f87171',
  warning:     '#fb923c',
  success:     '#4ade80',
  info:        '#67e8f9',
  border:      '#4b5563',
  borderDim:   '#374151',
  muted:       '#6b7280',
  dim:         '#9ca3af',
  text:        '#e5e7eb',
  bgPanel:     '#1f2937',
  bgToolbar:   '#111827',
  separator:   '#374151',
  codeBg:      '#1e1e2e',
  codeBorder:  '#45475a',
  gradient:    ['#c084fc', '#a78bfa', '#818cf8', '#60a5fa', '#38bdf8', '#22d3ee'],
  rowAlt:      '#252d3d',   // subtle alternate row (currently unused — too dark on most terminals)
  rowSel:      '#0a3d5c',   // clearly visible deep-blue selection band
};

export interface ThemeStyles {
  header:        TextStyle;
  headerAccent:  TextStyle;
  tabActive:     TextStyle;
  tabInactive:   TextStyle;
  colHeader:     TextStyle;
  colHeaderSel:  TextStyle;
  rowNormal:     TextStyle;
  rowSelected:   TextStyle;
  cellSelected:  TextStyle;
  cellNormal:    TextStyle;
  border:        TextStyle;
  borderDim:     TextStyle;
  hintKey:       TextStyle;
  hintText:      TextStyle;
  filterInput:   TextStyle;
  filterLabel:   TextStyle;
  editLabel:     TextStyle;
  editInput:     TextStyle;
  gotoLabel:     TextStyle;
  statusOk:      TextStyle;
  statusErr:     TextStyle;
  statusWarn:    TextStyle;
  statusInfo:    TextStyle;
  statusPending: TextStyle;
  statusActive:  TextStyle;
  scrollThumb:    TextStyle;
  scrollTrack:    TextStyle;
  detailKey:      TextStyle;
  detailVal:      TextStyle;
  muted:          TextStyle;
  dim:            TextStyle;
  text:           TextStyle;
  brand:          TextStyle;
  accent:         TextStyle;
  error:          TextStyle;
  success:        TextStyle;
  warning:        TextStyle;
  // Pixel / neon cyberpunk styles
  pixelCursor:    TextStyle;
  pixelSelected:  TextStyle;
  pixelUnselected: TextStyle;
  pixelLoading:   TextStyle;
}

function buildStyles(p: ThemePalette): ThemeStyles {
  return {
    header:        { color: p.brand, bold: true },
    headerAccent:  { color: p.accent, bold: true },
    tabActive:     { color: p.brand, bold: true, underline: true },
    tabInactive:   { color: p.dim },
    colHeader:     { color: p.dim, bold: true },
    colHeaderSel:  { color: p.accent, bold: true, underline: true },
    rowNormal:     { color: p.text },
    rowSelected:   { color: p.accent, bold: true },
    cellSelected:  { color: p.text, bgColor: '#0f3d52', bold: true },
    cellNormal:    { color: p.text },
    border:        { color: p.border },
    borderDim:     { color: p.borderDim },
    hintKey:       { color: p.accent },
    hintText:      { color: p.muted },
    filterInput:   { color: p.sysColor, bold: true },
    filterLabel:   { color: p.sysColor, bold: true },
    editLabel:     { color: p.text, bgColor: '#4b3a0f', bold: true },
    editInput:     { color: p.text },
    gotoLabel:     { color: p.text, bgColor: '#3f2f66', bold: true },
    statusOk:      { color: p.success },
    statusErr:     { color: p.error },
    statusWarn:    { color: p.warning },
    statusInfo:    { color: p.info },
    statusPending: { color: p.sysColor },
    statusActive:  { color: p.accent },
    scrollThumb:   { color: p.brand },
    scrollTrack:   { color: p.borderDim },
    detailKey:     { color: p.brand },
    detailVal:     { color: p.text },
    muted:         { color: p.muted },
    dim:           { color: p.dim },
    text:          { color: p.text },
    brand:         { color: p.brand, bold: true },
    accent:        { color: p.accent, bold: true },
    error:          { color: p.error, bold: true },
    success:        { color: p.success, bold: true },
    warning:        { color: p.warning, bold: true },
    pixelCursor:    { color: p.brand, bold: true },
    pixelSelected:  { color: p.text, bgColor: '#3f2f66', bold: true },
    pixelUnselected: { color: p.text },
    pixelLoading:   { color: p.accent },
  };
}

const STATUS_STYLE_MAP: Record<string, keyof ThemeStyles> = {
  // green — ok / complete
  DONE: 'statusOk', SUCCESS: 'statusOk', APPROVED: 'statusOk', ACTIVE: 'statusOk',
  AUTHORIZED: 'statusOk', CAPTURED: 'statusOk', PAID: 'statusOk', DELIVERED: 'statusOk',
  ok: 'statusOk',
  // red — error / cancelled
  FAILED: 'statusErr', FAIL: 'statusErr', REVERTED: 'statusErr', ERROR: 'statusErr',
  REFUNDED: 'statusErr', CANCELLED: 'statusErr', PARTIALLY_REFUNDED: 'statusErr',
  // amber — waiting / stalled
  PENDING_APPROVAL: 'statusWarn', PENDING: 'statusWarn', DRAFT: 'statusWarn',
  INACTIVE: 'statusWarn', SUBMITTED: 'statusWarn', PAYMENT_PENDING: 'statusWarn',
  PREPARING: 'statusWarn',
  // cyan — active / executing
  EXECUTING: 'statusActive', WAITING_EXECUTION: 'statusActive', LIVE: 'statusActive',
  FULFILLING: 'statusActive', CREATED: 'statusActive', PROCESSING: 'statusActive',
  // blue — transit / moving
  SHIPPED: 'statusInfo', IN_TRANSIT: 'statusInfo', DELIVERING: 'statusInfo',
  DISPATCHED: 'statusInfo', OUT_FOR_DELIVERY: 'statusInfo',
  // tier levels
  VIP: 'statusOk', PREMIUM: 'statusActive', STANDARD: 'dim',
};

export const Icons = {
  user:       '●',
  assistant:  '◆',
  system:     '▲',
  thinking:   '◐',
  error:      '✖',
  warning:    '▲',
  success:    '✔',
  info:       'ℹ',
  separator:  '─',
  prompt:     '❯',
  model:      '⬡',
  token:      '⊛',
  arrow:      '▸',
  expand:     '│',
} as const;

class Theme {
  readonly palette: ThemePalette;
  readonly s: ThemeStyles;

  constructor(palette: ThemePalette) {
    this.palette = palette;
    this.s = buildStyles(palette);
  }

  statusStyle(value: string): TextStyle {
    const key = STATUS_STYLE_MAP[value];
    return key ? this.s[key] as TextStyle : this.s.cellNormal;
  }

  gradient(index: number): string {
    const g = this.palette.gradient;
    return g[index % g.length];
  }

  gradientStyle(index: number): TextStyle {
    return { color: this.gradient(index), bold: true };
  }
}

let currentTheme: Theme = new Theme(DARK_PALETTE);

export function getTheme(): Theme { return currentTheme; }
export function setTheme(palette: ThemePalette): void { currentTheme = new Theme(palette); }
export { Theme };

/**
 * Unified timestamp formatter used across all scenes.
 * Accepts Unix milliseconds, ISO strings, or Date objects.
 *
 * format:
 *   'datetime' → "MM-DD HH:MM:SS"   (default — table cells with date context)
 *   'time'     → "HH:MM:SS"         (log/audit views)
 *   'short'    → "HH:MM"            (chat timestamps)
 */
export function fmtTimestamp(val: unknown, format: 'datetime' | 'time' | 'short' = 'datetime'): string {
  let d: Date;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'number') {
    if (!val || isNaN(val)) return '—';
    d = new Date(val);
  } else if (typeof val === 'string' && val) {
    d = new Date(val);
  } else {
    return '—';
  }
  if (isNaN(d.getTime())) return '—';

  const hh  = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss  = String(d.getSeconds()).padStart(2, '0');
  if (format === 'short')    return `${hh}:${min}`;
  if (format === 'time')     return `${hh}:${min}:${ss}`;
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${mon}-${day} ${hh}:${min}:${ss}`;
}
