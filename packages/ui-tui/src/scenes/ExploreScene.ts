import type { IScene } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import { Table } from '../components/Table.js';
import type { TableColumn } from '../components/Table.js';
import type { ViewportState } from '../store/ViewportState.js';

export class ExploreScene implements IScene {
  readonly name = 'explore';
  private table = new Table();
  private currentTable = 'state_orders';

  constructor(private readonly viewportState: ViewportState) {}

  private readonly defaultColumns: TableColumn[] = [
    { key: 'entity_id_hash', label: 'Entity ID', width: 16 },
    { key: 'status', label: 'Status', width: 18 },
    { key: 'updated_event_time_ms', label: 'Updated', width: 14, align: 'right' },
  ];

  render(canvas: ITerminalCanvas): void {
    const { cols, rows } = canvas.getSize();
    canvas.write(0, 0, `[EXPLORE] ${this.currentTable}`, { color: 'cyan', bold: true });

    const viewport = this.viewportState.get(this.currentTable);
    const data = viewport?.rows ?? [];

    this.table.render(
      canvas,
      { x: 0, y: 2, width: cols, height: rows - 4 },
      this.defaultColumns,
      data,
    );

    canvas.write(0, rows - 2, '[e] Edit  [f] Filter  [/] Search  [r] Refresh  [Space] LIVE/PAUSED', { color: 'gray' });
  }

  onKeyPress(key: string): void {
    switch (key) {
      case 'up':
        this.table.moveUp();
        break;
      case 'down': {
        const vp = this.viewportState.get(this.currentTable);
        this.table.moveDown(vp?.rows.length ?? 0);
        break;
      }
    }
  }

  onSlowFrame(_durationMs: number): void {}

  setTable(table: string): void {
    this.currentTable = table;
  }
}
