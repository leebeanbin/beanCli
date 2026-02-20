export interface ViewportRange {
  table: string;
  offset: number;
  limit: number;
  totalRows: number;
  rows: Record<string, unknown>[];
}

export class ViewportState {
  private viewports = new Map<string, ViewportRange>();

  get(table: string): ViewportRange | undefined {
    return this.viewports.get(table);
  }

  set(table: string, data: ViewportRange): void {
    this.viewports.set(table, data);
  }

  updateRows(table: string, rows: Record<string, unknown>[]): void {
    const vp = this.viewports.get(table);
    if (vp) {
      vp.rows = rows;
    }
  }

  scrollDown(table: string, amount = 1): boolean {
    const vp = this.viewports.get(table);
    if (!vp) return false;
    const maxOffset = Math.max(0, vp.totalRows - vp.limit);
    if (vp.offset >= maxOffset) return false;
    vp.offset = Math.min(maxOffset, vp.offset + amount);
    return true;
  }

  scrollUp(table: string, amount = 1): boolean {
    const vp = this.viewports.get(table);
    if (!vp) return false;
    if (vp.offset <= 0) return false;
    vp.offset = Math.max(0, vp.offset - amount);
    return true;
  }
}
