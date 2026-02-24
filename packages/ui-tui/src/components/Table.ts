import type { ITerminalCanvas, TextStyle } from '../core/TerminalCanvas.js';
import type { Region } from '../core/Layout.js';
import { SpinnerBadge } from './SpinnerBadge.js';
import { getTheme } from '../core/Theme.js';

export interface TableColumn {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'right';
  flex?: number;
  maxWidth?: number;   // cap on flex column expansion
  format?: (value: unknown, row?: Record<string, unknown>) => string;
}

// ── Layout constants ──────────────────────────────────────────
//
//  Pixel grid layout (per row):
//
//  x=0      : '▶' or ' '          (SEL_W = 1)
//  x=1..3   : row number ≤3 digits  (NUM_W = 3)
//  x=4      : '┃'  thick chrome bar (CHROME_X = 4)
//  x=5+     : data columns separated by '╎' (dashed vertical)
//
//  Visual:
//  ▌ Nr ┃ COL0       ╎ COL1      ╎ [●STATUS ]
//  ─────╋────────────────────────────────────────
//  ▶  1 ┃ val0       ╎ val1      ╎ [●ACTIVE ]
//     2 ┃ val0       ╎ val1      ╎ [○INACTV ]
//
const SEL_W    = 1;
const NUM_W    = 3;
const CHROME_X = SEL_W + NUM_W;    // = 4  — position of '┃'
const DATA_OFFSET = CHROME_X + 1;  // = 5  — first data char

// Minimum column width to render a badge (needs room for [ ] + icon + 1 char)
const MIN_BADGE_WIDTH = 5;

// Scrollbar
const SCROLL_THUMB = '█';
const SCROLL_TRACK = '▒';

// Status icons — single ASCII char, always 1-column width (no CJK ambiguous-width chars)
const STATUS_ICONS: Record<string, string> = {
  // green — ok / complete  (+)
  DONE:             '+', DELIVERED:        '+', SUCCESS:    '+',
  APPROVED:         '+', CAPTURED:         '+', PAID:       '+',
  AUTHORIZED:       '+', ACTIVE:           '*',
  // red — failure / stopped  (!)
  FAILED:           '!', FAIL:             '!', REVERTED:   '!',
  ERROR:            '!', REFUNDED:         '!', CANCELLED:  '!',
  // grey — dormant  (-)
  INACTIVE:         '-', DISCONTINUED:     '-', RETURNED:   '-',
  // amber — waiting  (~)
  PENDING:          '~', DRAFT:            '~', PAYMENT_PENDING: '~',
  PENDING_APPROVAL: '~', SUBMITTED:        '~',
  // cyan — in motion  (>)
  EXECUTING:        '>', PROCESSING:       '>', FULFILLING: '>',
  CREATED:          '>', LIVE:             '>',
  // blue — transit  (^)
  SHIPPED:          '^', IN_TRANSIT:       '^', DELIVERING:       '^',
  OUT_FOR_DELIVERY: '^', DISPATCHED:       '^',
  // tier / level badges
  VIP:              '#', PREMIUM:          '@', STANDARD:   'o',
};

export class Table {
  private selectedRow   = 0;
  private selectedCol   = 0;
  private scrollOffset  = 0;
  private filter        = '';
  private lastFilteredCount = 0;
  private lastVisibleHeight = 10;
  private lastColumnCount   = 0;
  private expandedRow       = -1;
  private lastResolvedColumns: TableColumn[] = [];
  // Cache column separator x-positions for separator-row tick marks
  private sepPositions: number[] = [];

  // ── Public API ────────────────────────────────────────────

  setFilter(text: string): void { this.filter = text; this.selectedRow = 0; this.scrollOffset = 0; }
  clearFilter(): void { this.filter = ''; this.selectedRow = 0; this.scrollOffset = 0; }
  getFilter(): string { return this.filter; }

  reset(): void {
    this.selectedRow = 0; this.selectedCol = 0;
    this.scrollOffset = 0; this.filter = ''; this.expandedRow = -1;
  }

  getSelectedIndex(): number { return this.selectedRow; }
  getSelectedCol(): number   { return this.selectedCol; }

  getSelectedColumnKey(): string | null {
    return this.lastResolvedColumns[this.selectedCol]?.key ?? null;
  }

  toggleExpand(): boolean {
    if (this.expandedRow === this.selectedRow) { this.expandedRow = -1; return false; }
    this.expandedRow = this.selectedRow;
    return true;
  }
  isExpanded(): boolean { return this.expandedRow === this.selectedRow; }

  // ── Render ────────────────────────────────────────────────

  render(
    canvas: ITerminalCanvas,
    region: Region,
    columns: TableColumn[],
    rows: Record<string, unknown>[],
    hint?: string,   // override empty-state message (e.g. "loading..." or error)
  ): void {
    const t = getTheme();
    const filtered = this.applyFilter(rows);
    this.lastFilteredCount = filtered.length;
    // row 0 = header, row 1 = separator, rows 2+ = data
    this.lastVisibleHeight = Math.max(1, region.height - 2);
    this.lastColumnCount   = columns.length;

    // Available data width: subtract left chrome + right scrollbar margin
    const contentWidth = region.width - DATA_OFFSET - 2;
    const resolved = this.resolveColumnWidths(columns, contentWidth);
    this.lastResolvedColumns = resolved;

    if (this.selectedCol >= resolved.length) this.selectedCol = resolved.length - 1;
    if (this.selectedCol < 0)               this.selectedCol = 0;

    const scrollbarX  = region.x + region.width - 1;
    const needsScroll = filtered.length > this.lastVisibleHeight;
    const chromeX     = region.x + CHROME_X;

    // Pre-compute '╎' separator x-positions (for separator row tick marks)
    this.sepPositions = [];
    {
      let bx = region.x + DATA_OFFSET;
      for (let ci = 0; ci < resolved.length - 1; ci++) {
        bx += resolved[ci]!.width;
        this.sepPositions.push(bx);
        bx += 1;
      }
    }

    // ── Header row ─────────────────────────────────────────
    // ▌ Nr ┃ LABEL0  ╎ LABEL1  ╎ [LABEL2 ]
    canvas.write(region.x,         region.y, '▌', { color: t.palette.brandAlt, bold: true });
    canvas.write(region.x + SEL_W, region.y, 'Nr'.padStart(NUM_W), { color: t.palette.muted });
    canvas.write(chromeX,          region.y, '┃', { color: t.palette.brand });

    let xPos = region.x + DATA_OFFSET;
    for (let ci = 0; ci < resolved.length; ci++) {
      const col      = resolved[ci]!;
      const isSelCol = ci === this.selectedCol;
      const label    = col.label.padEnd(col.width).slice(0, col.width);
      canvas.write(xPos, region.y, label,
        isSelCol
          ? { color: t.palette.text, bgColor: t.palette.borderDim, bold: true }
          : { color: t.palette.brand, bold: true },
      );
      xPos += col.width;
      if (ci < resolved.length - 1) {
        canvas.write(xPos, region.y, '╎', t.s.borderDim);
      }
      xPos += 1;
    }

    // ── Separator row ───────────────────────────────────────
    // ═════╬═══════════╪═══════════╪════════════════════════
    // Bold brand-colored double line for pixel-game HUD feel
    const sepLen = Math.max(0, region.width - 2);
    canvas.write(region.x, region.y + 1, '═'.repeat(sepLen), { color: t.palette.brand });
    canvas.write(chromeX,  region.y + 1, '╬', { color: t.palette.brand, bold: true });
    for (const sp of this.sepPositions) {
      canvas.write(sp, region.y + 1, '╪', { color: t.palette.brand });
    }

    // ── Data rows ──────────────────────────────────────────
    const displayRows = filtered.slice(this.scrollOffset, this.scrollOffset + this.lastVisibleHeight);
    let renderY = 0;

    for (let i = 0; i < displayRows.length && renderY < this.lastVisibleHeight; i++) {
      const row      = displayRows[i]!;
      const absIndex = this.scrollOffset + i;
      const isRowSel = absIndex === this.selectedRow;
      const isExpand = absIndex === this.expandedRow;
      const rowY     = region.y + renderY + 2;

      // ── Row background band ─────────────────────────────
      // Every row gets an explicit bgColor so the terminal's default (often black)
      // never bleeds through. Selected row gets rowSel; normal rows get bgPanel.
      const rowBgColor = isRowSel ? t.palette.rowSel : t.palette.bgPanel;
      canvas.write(region.x, rowY, ' '.repeat(region.width - 1), { bgColor: rowBgColor });
      // Helper: merge rowBgColor into any style without overriding cell-selection bg
      const bg = (style: TextStyle): TextStyle =>
        ({ ...style, bgColor: rowBgColor });

      // Selector — '>' is ASCII, always 1-column (▶ is EAW=Ambiguous → 2-wide in CJK terminals)
      canvas.write(region.x, rowY,
        isRowSel ? '>' : ' ',
        bg(isRowSel ? { color: t.palette.accent, bold: true } : t.s.dim));

      // Row number
      canvas.write(region.x + SEL_W, rowY,
        String(absIndex + 1).padStart(NUM_W),
        bg(isRowSel ? { color: t.palette.accent } : t.s.dim));

      // Chrome bar
      canvas.write(chromeX, rowY, '┃',
        bg(isRowSel ? { color: t.palette.accent, bold: true } : { color: t.palette.borderDim }));

      // Column cells
      xPos = region.x + DATA_OFFSET;
      for (let ci = 0; ci < resolved.length; ci++) {
        const col      = resolved[ci]!;
        const rawValue = row[col.key];
        const strValue = col.format ? col.format(rawValue, row) : String(rawValue ?? '');
        const animated = SpinnerBadge.isAnimated(strValue);
        const val      = animated ? SpinnerBadge.format(strValue, col.width) : strValue;

        const icon      = (!col.format && !animated && col.align !== 'right')
          ? STATUS_ICONS[strValue]
          : undefined;
        const isCellSel = isRowSel && ci === this.selectedCol;

        if (icon && col.width >= MIN_BADGE_WIDTH) {
          // ── Badge rendering ─────────────────────────────
          // [ icon + value + padding ]
          // Brackets in borderDim, content in statusColor
          const innerWidth = col.width - 2; // subtract '[' and ']'
          const inner = `${icon}${val}`.padEnd(innerWidth).slice(0, innerWidth);

          if (isCellSel) {
            // Selected cell keeps dedicated contrast style
            canvas.write(xPos, rowY, `[${inner}]`, t.s.cellSelected);
          } else if (isRowSel) {
            canvas.write(xPos, rowY, `[${inner}]`, bg(t.s.rowSelected));
          } else {
            canvas.write(xPos,                  rowY, '[',   bg({ color: t.palette.borderDim }));
            canvas.write(xPos + 1,              rowY, inner, bg(t.statusStyle(strValue)));
            canvas.write(xPos + 1 + innerWidth, rowY, ']',   bg({ color: t.palette.borderDim }));
          }
        } else {
          // ── Normal rendering ────────────────────────────
          const display   = icon ? `${icon} ${val}` : val;
          const formatted = col.align === 'right'
            ? display.padStart(col.width).slice(-col.width)
            : display.padEnd(col.width).slice(0, col.width);

          canvas.write(xPos, rowY, formatted,
            isCellSel  ? t.s.cellSelected           // keeps its own bgColor
            : isRowSel ? bg(t.s.rowSelected)
            :            bg(t.statusStyle(strValue)));
        }

        xPos += col.width;

        // '╎' dashed column separator (not after last column)
        if (ci < resolved.length - 1) {
          canvas.write(xPos, rowY, '╎',
            bg(isRowSel ? { color: t.palette.accent } : t.s.borderDim));
        }
        xPos += 1;
      }

      // Scrollbar
      if (needsScroll) {
        const { ch, style } = this.scrollbarChar(
          renderY, this.lastVisibleHeight, filtered.length, this.scrollOffset, t);
        canvas.write(scrollbarX, rowY, ch, style);
      }

      renderY++;

      if (isExpand) {
        const lines = this.renderExpandedRow(canvas, region, row, renderY, t);
        renderY += lines;
      }
    }

    // Clear ghost rows — explicit bgPanel so terminal default (black) doesn't show
    const clearWidth = Math.max(0, region.width - 1);
    for (let cy = renderY; cy < this.lastVisibleHeight; cy++) {
      canvas.write(region.x, region.y + cy + 2, ' '.repeat(clearWidth),
        { color: t.palette.text, bgColor: t.palette.bgPanel });
    }

    // Empty state
    if (filtered.length === 0) {
      const msgY = region.y + 3;
      if (this.filter) {
        canvas.write(region.x + 2, msgY, `@  No matches for "${this.filter}"`, t.s.warning);
      } else if (hint) {
        // Caller-supplied hint (loading spinner, error, etc.)
        const isErr = hint.startsWith('!');
        canvas.write(region.x + 2, msgY, hint, isErr ? t.s.error : t.s.muted);
      } else {
        canvas.write(region.x + 2, msgY, '-  No data available', t.s.muted);
        canvas.write(region.x + 2, msgY + 1,
          '   Data will appear here once the API is connected.', t.s.dim);
      }
    }
  }

  // ── Expanded row detail ───────────────────────────────────

  private renderExpandedRow(
    canvas: ITerminalCanvas,
    region: Region,
    row: Record<string, unknown>,
    startY: number,
    t: ReturnType<typeof getTheme>,
  ): number {
    const entries  = Object.entries(row).filter(([k]) => !k.startsWith('_'));
    const maxLines = Math.min(entries.length, this.lastVisibleHeight - startY - 1);
    if (maxLines <= 0) return 0;

    const detailWidth = Math.min(region.width - 6, 70);

    for (let j = 0; j < maxLines; j++) {
      const [key, value] = entries[j]!;
      const y       = region.y + startY + j + 2;
      const val     = String(value ?? '');
      const display = val.length > detailWidth - 24 ? val.slice(0, detailWidth - 27) + '…' : val;
      canvas.write(region.x + 2, y, '╎', { color: t.palette.accent });
      canvas.write(region.x + 4, y, key.padEnd(22).slice(0, 22), t.s.detailKey);
      canvas.write(region.x + 27, y, display, t.s.detailVal);
    }
    return maxLines;
  }

  // ── Navigation ────────────────────────────────────────────

  moveUp(): void {
    if (this.selectedRow > 0) {
      this.selectedRow--;
      if (this.selectedRow < this.scrollOffset) this.scrollOffset = this.selectedRow;
    }
  }

  moveDown(totalRows: number): void {
    const count = this.filter ? this.lastFilteredCount : totalRows;
    if (this.selectedRow < count - 1) {
      this.selectedRow++;
      if (this.selectedRow >= this.scrollOffset + this.lastVisibleHeight)
        this.scrollOffset = this.selectedRow - this.lastVisibleHeight + 1;
    }
  }

  moveLeft(): void  { if (this.selectedCol > 0) this.selectedCol--; }
  moveRight(): void { if (this.selectedCol < this.lastColumnCount - 1) this.selectedCol++; }

  movePageUp(): void {
    const page = Math.max(1, this.lastVisibleHeight);
    this.selectedRow  = Math.max(0, this.selectedRow - page);
    this.scrollOffset = Math.max(0, this.scrollOffset - page);
    if (this.selectedRow < this.scrollOffset) this.scrollOffset = this.selectedRow;
  }

  movePageDown(totalRows: number): void {
    const count  = this.filter ? this.lastFilteredCount : totalRows;
    const page   = Math.max(1, this.lastVisibleHeight);
    const maxRow = Math.max(0, count - 1);
    this.selectedRow = Math.min(maxRow, this.selectedRow + page);
    if (this.selectedRow >= this.scrollOffset + this.lastVisibleHeight)
      this.scrollOffset = Math.min(
        Math.max(0, count - this.lastVisibleHeight),
        this.scrollOffset + page);
  }

  moveToTop(): void { this.selectedRow = 0; this.scrollOffset = 0; }
  moveToBottom(totalRows: number): void {
    const count = this.filter ? this.lastFilteredCount : totalRows;
    this.selectedRow  = Math.max(0, count - 1);
    this.scrollOffset = Math.max(0, count - this.lastVisibleHeight);
  }

  moveToFirstCol(): void { this.selectedCol = 0; }
  moveToLastCol(): void  { this.selectedCol = Math.max(0, this.lastColumnCount - 1); }

  goToRow(row: number, totalRows: number): boolean {
    const count = this.filter ? this.lastFilteredCount : totalRows;
    if (row < 0 || row >= count) return false;
    this.selectedRow = row;
    const half = Math.floor(this.lastVisibleHeight / 2);
    this.scrollOffset = Math.max(0, Math.min(row - half, count - this.lastVisibleHeight));
    return true;
  }

  goToColByName(name: string): boolean {
    const lower = name.toLowerCase();
    const idx = this.lastResolvedColumns.findIndex(
      c => c.key.toLowerCase() === lower || c.label.toLowerCase() === lower);
    if (idx === -1) return false;
    this.selectedCol = idx;
    return true;
  }

  getColumnNames(): string[] { return this.lastResolvedColumns.map(c => c.label); }
  getRowCount(): number      { return this.lastFilteredCount; }

  // ── Internal helpers ──────────────────────────────────────

  private applyFilter(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    if (!this.filter) return rows;
    const f = this.filter.toLowerCase();
    return rows.filter(row =>
      Object.values(row).some(v => String(v ?? '').toLowerCase().includes(f)));
  }

  private resolveColumnWidths(columns: TableColumn[], availableWidth: number): TableColumn[] {
    const totalFlex = columns.reduce((s, c) => s + (c.flex ?? 0), 0);
    if (totalFlex === 0) return columns;

    // Each column costs width + 1 (╎ separator or trailing gap)
    const fixedWidth = columns.reduce((s, c) => s + (c.flex ? 0 : c.width) + 1, 0);
    const remaining  = Math.max(0, availableWidth - fixedWidth);

    return columns.map(col => {
      if (!col.flex) return col;
      const raw = Math.floor((col.flex / totalFlex) * remaining);
      const w   = Math.min(col.maxWidth ?? Infinity, Math.max(col.width, raw));
      return { ...col, width: w };
    });
  }

  private scrollbarChar(
    viewRow: number, viewHeight: number,
    totalRows: number, offset: number,
    t: ReturnType<typeof getTheme>,
  ): { ch: string; style: { color: string } } {
    const thumbSize  = Math.max(1, Math.round((viewHeight / totalRows) * viewHeight));
    const thumbStart = Math.round(
      (offset / Math.max(1, totalRows - viewHeight)) * (viewHeight - thumbSize));
    return viewRow >= thumbStart && viewRow < thumbStart + thumbSize
      ? { ch: SCROLL_THUMB, style: { color: t.palette.brand } }
      : { ch: SCROLL_TRACK, style: { color: t.palette.borderDim } };
  }
}
