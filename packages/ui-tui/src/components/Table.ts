import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import type { Region } from '../core/Layout.js';

export interface TableColumn {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'right';
}

export class Table {
  private selectedRow = 0;
  private scrollOffset = 0;

  render(
    canvas: ITerminalCanvas,
    region: Region,
    columns: TableColumn[],
    rows: Record<string, unknown>[],
  ): void {
    let xPos = region.x;
    for (const col of columns) {
      const label = col.label.padEnd(col.width).slice(0, col.width);
      canvas.write(xPos, region.y, label, { bold: true, underline: true });
      xPos += col.width + 1;
    }

    const visibleRows = region.height - 1;
    const displayRows = rows.slice(this.scrollOffset, this.scrollOffset + visibleRows);

    for (let i = 0; i < displayRows.length; i++) {
      const row = displayRows[i];
      const isSelected = this.scrollOffset + i === this.selectedRow;

      xPos = region.x;
      for (const col of columns) {
        const value = String(row[col.key] ?? '');
        const formatted = col.align === 'right'
          ? value.padStart(col.width).slice(-col.width)
          : value.padEnd(col.width).slice(0, col.width);

        canvas.write(xPos, region.y + i + 1, formatted, {
          color: isSelected ? 'cyan' : 'white',
          bold: isSelected,
        });
        xPos += col.width + 1;
      }
    }
  }

  moveUp(): void {
    if (this.selectedRow > 0) {
      this.selectedRow--;
      if (this.selectedRow < this.scrollOffset) {
        this.scrollOffset = this.selectedRow;
      }
    }
  }

  moveDown(totalRows: number): void {
    if (this.selectedRow < totalRows - 1) {
      this.selectedRow++;
    }
  }

  getSelectedRow(): number {
    return this.selectedRow;
  }

  setScrollOffset(offset: number): void {
    this.scrollOffset = offset;
  }
}
