export interface ViewportRange {
  table: string;
  offset: number;
  limit: number;
  totalRows: number;
  rows: Record<string, unknown>[];
  isLoading?: boolean;
  error?: string;
}

export class ViewportState {
  private viewports = new Map<string, ViewportRange>();

  get(table: string): ViewportRange | undefined {
    return this.viewports.get(table);
  }

  set(table: string, data: ViewportRange): void {
    this.viewports.set(table, data);
  }

  setLoading(table: string, loading: boolean): void {
    const existing = this.viewports.get(table);
    if (existing) {
      existing.isLoading = loading;
      if (loading) existing.error = undefined;
    } else {
      this.viewports.set(table, { table, offset: 0, limit: 100, totalRows: 0, rows: [], isLoading: loading });
    }
  }

  setError(table: string, error: string): void {
    const existing = this.viewports.get(table);
    if (existing) {
      existing.error = error;
      existing.isLoading = false;
    } else {
      this.viewports.set(table, { table, offset: 0, limit: 100, totalRows: 0, rows: [], error, isLoading: false });
    }
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
