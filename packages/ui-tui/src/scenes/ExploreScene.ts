import type { IScene, SceneContext } from '../core/IScene.js';
import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import type { ViewportState } from '../store/ViewportState.js';
import { Table } from '../components/Table.js';
import type { TableColumn } from '../components/Table.js';
import { FilterBar } from '../components/FilterBar.js';
import { HintBar } from '../components/HintBar.js';
import { TabBar } from '../components/TabBar.js';
import { SectionHeader } from '../components/SectionHeader.js';
import { getTheme, fmtTimestamp } from '../core/Theme.js';

function fmtTime(v: unknown): string {
  return fmtTimestamp(v, 'datetime');
}

function fmtCents(v: unknown, row?: Record<string, unknown>): string {
  const cents = Number(v);
  if (isNaN(cents)) return String(v ?? '');
  const currencyRaw = String(row?.['currency_code'] ?? 'USD').toUpperCase();
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyRaw,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyRaw}`;
  }
}

function fmtId(v: unknown): string {
  const s = String(v ?? '');
  return s.length > 12 ? s.slice(0, 12) + '…' : s;
}

const TABLE_COLUMNS: Record<string, TableColumn[]> = {
  state_users: [
    { key: 'username',        label: 'Username', width: 16, flex: 1, maxWidth: 20 },
    { key: 'status',          label: 'Status',   width: 12 },
    { key: 'tier',            label: 'Tier',     width: 12 },
    { key: 'country_code',    label: 'CC',       width: 4  },
    { key: 'updated_event_time_ms', label: 'Updated', width: 12, align: 'right', format: fmtTime },
  ],
  state_orders: [
    { key: 'entity_id_hash',      label: 'Order ID',  width: 16, format: fmtId },
    { key: 'status',              label: 'Status',    width: 20 },
    { key: 'total_amount_cents',  label: 'Amount',    width: 14, align: 'right', format: fmtCents },
    { key: 'item_count',          label: 'Qty',       width: 4,  align: 'right' },
    { key: 'updated_event_time_ms', label: 'Updated', width: 12, align: 'right', format: fmtTime },
  ],
  state_products: [
    { key: 'name',            label: 'Name',     width: 24, flex: 1, maxWidth: 30 },
    { key: 'category',        label: 'Category', width: 12 },
    { key: 'price_cents',     label: 'Price',    width: 10, align: 'right', format: fmtCents },
    { key: 'stock_quantity',  label: 'Stock',    width: 6,  align: 'right' },
    { key: 'status',          label: 'Status',   width: 14 },
  ],
  state_payments: [
    { key: 'entity_id_hash',  label: 'Pay ID',  width: 16, format: fmtId },
    { key: 'status',          label: 'Status',  width: 22 },
    { key: 'amount_cents',    label: 'Amount',  width: 14, align: 'right', format: fmtCents },
    { key: 'payment_method',  label: 'Method',  width: 14 },
    { key: 'updated_event_time_ms', label: 'Updated', width: 12, align: 'right', format: fmtTime },
  ],
  state_shipments: [
    { key: 'entity_id_hash',      label: 'Ship ID',   width: 16, format: fmtId },
    { key: 'status',              label: 'Status',    width: 22 },
    { key: 'carrier',             label: 'Carrier',   width: 10 },
    { key: 'destination_country', label: 'Dest',      width: 5  },
    { key: 'updated_event_time_ms', label: 'Updated', width: 12, align: 'right', format: fmtTime },
  ],
};

const DEFAULT_COLUMNS: TableColumn[] = [
  { key: 'entity_id_hash', label: 'Entity ID', width: 12, flex: 1, format: fmtId },
  { key: 'status',          label: 'Status',    width: 18 },
  { key: 'updated_event_time_ms', label: 'Updated', width: 14, align: 'right', format: fmtTime },
];

const DETAIL_PANEL_WIDTH = 32;

// ── Field-level validation schemas ────────────────────────────
// Defines allowed values / numeric bounds per field per table.
// Used to validate user input before API calls and show inline hints.
interface FieldMeta {
  enum?: string[];    // valid discrete values
  min?: number;       // numeric minimum (inclusive)
  max?: number;       // numeric maximum (inclusive)
  maxLen?: number;    // text length limit
  pattern?: string;   // regex pattern string
  uppercase?: boolean;
  hint?: string;      // human-readable hint shown during input
}

const FIELD_SCHEMAS: Record<string, Record<string, FieldMeta>> = {
  state_users: {
    status:       { enum: ['ACTIVE', 'INACTIVE'],
                    hint: 'ACTIVE · INACTIVE' },
    tier:         { enum: ['STANDARD', 'PREMIUM', 'VIP'],
                    hint: 'STANDARD · PREMIUM · VIP' },
    country_code: { maxLen: 2, hint: '2-char ISO (KR · US · JP · CN · GB · DE)' },
    username:     { maxLen: 64 },
    email_hash:   { maxLen: 128 },
  },
  state_orders: {
    status: {
      enum: ['CREATED','PAYMENT_PENDING','PAID','FULFILLING',
             'SHIPPED','DELIVERED','CANCELLED','REFUNDED'],
      hint: 'CREATED · PAYMENT_PENDING · PAID · FULFILLING · SHIPPED · DELIVERED · CANCELLED · REFUNDED',
    },
    currency_code:      { enum: ['USD','EUR','KRW','JPY','GBP','CNY','AUD','SGD','BRL','MXN'],
                          hint: 'USD · EUR · KRW · JPY · GBP · CNY · AUD · SGD · BRL · MXN' },
    total_amount_cents: { min: 0, hint: 'cents (9900 = 99.00 in selected currency)' },
    item_count:         { min: 1, hint: 'number of items (min 1)' },
  },
  state_products: {
    status:         { enum: ['ACTIVE', 'INACTIVE', 'DISCONTINUED'],
                      hint: 'ACTIVE · INACTIVE · DISCONTINUED' },
    category:       { enum: ['Electronics', 'Fashion', 'Food', 'Furniture', 'Lifestyle', 'Sports'],
                      hint: 'Electronics · Fashion · Food · Furniture · Lifestyle · Sports' },
    price_cents:    { min: 0, hint: 'cents (29900 = $299.00)' },
    stock_quantity: { min: 0, hint: 'stock count (0 = out of stock)' },
    name:           { maxLen: 128 },
    sku:            { maxLen: 64 },
  },
  state_payments: {
    status: {
      enum: ['PENDING','AUTHORIZED','CAPTURED','FAILED','REFUNDED','PARTIALLY_REFUNDED'],
      hint: 'PENDING · AUTHORIZED · CAPTURED · FAILED · REFUNDED · PARTIALLY_REFUNDED',
    },
    payment_method: { enum: ['CARD', 'BANK_TRANSFER', 'WALLET'],
                      hint: 'CARD · BANK_TRANSFER · WALLET' },
    currency_code:  { enum: ['USD','EUR','KRW','JPY','GBP','CNY','AUD','SGD','BRL','MXN'],
                      hint: 'USD · EUR · KRW · JPY · GBP · CNY · AUD · SGD · BRL · MXN' },
    amount_cents:   { min: 0, hint: 'cents (9900 = 99.00 in selected currency)' },
  },
  state_shipments: {
    status: {
      enum: ['PREPARING','DISPATCHED','IN_TRANSIT','OUT_FOR_DELIVERY',
             'DELIVERED','FAILED','RETURNED'],
      hint: 'PREPARING · DISPATCHED · IN_TRANSIT · OUT_FOR_DELIVERY · DELIVERED · FAILED · RETURNED',
    },
    carrier:             { enum: ['FedEx','DHL','UPS','USPS','EMS','SFExpress','CJ'],
                           hint: 'FedEx · DHL · UPS · USPS · EMS · SFExpress · CJ' },
    destination_country: { maxLen: 2, hint: '2-char ISO (KR · US · JP · CN · GB)' },
  },
};

export interface EditCallbacks {
  onUpdateCell: (table: string, id: string, field: string, value: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteRow: (table: string, id: string) => Promise<{ success: boolean; error?: string }>;
  onInsertRow: (table: string, data: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
}

export class ExploreScene implements IScene {
  readonly name = 'explore';

  private readonly header = new SectionHeader('[EXPLORE]');
  private tabBar: TabBar;
  private dynamicTables: string[] = [];
  private readonly table = new Table();
  private readonly filterBar = new FilterBar();
  private readonly hintBar = new HintBar('↑/↓/←/→ Cell  ←/→ Edge→Table  Enter/e Edit  i Ins  d Del  / Filter  g/G Top/Bot  ^G GoTo');

  private onTableChange?: (table: string) => void;
  private editCallbacks?: EditCallbacks;
  private editMode = false;
  private editField = '';
  private editValue = '';
  private editRowId = '';
  private editFeedback = '';
  private editFeedbackTimer?: ReturnType<typeof setTimeout>;
  private markDirtyFn?: () => void;
  private readonly serverFieldSchemas: Record<string, Record<string, FieldMeta>> = {};

  private deleteConfirm = false;
  private insertMode = false;
  private insertFields: string[] = [];
  private insertValues: string[] = [];
  private insertFieldIndex = 0;
  private gotoMode = false;
  private gotoInput = '';

  constructor(private readonly viewportState: ViewportState) {
    this.tabBar = new TabBar(this.dynamicTables);
  }

  setDynamicTables(tables: string[]): void {
    this.dynamicTables = [...tables];
    this.tabBar = new TabBar(this.dynamicTables);
    this.table.reset();
    this.filterBar.clear();
    if (this.dynamicTables.length > 0) {
      this.onTableChange?.(this.tabBar.current());
    }
  }

  setEditCallbacks(cb: EditCallbacks): void {
    this.editCallbacks = cb;
  }

  setMarkDirty(fn: () => void): void {
    this.markDirtyFn = fn;
  }

  setOnTableChange(callback: (table: string) => void): void {
    this.onTableChange = callback;
  }

  setServerFieldSchema(table: string, fieldMeta: Record<string, FieldMeta>): void {
    this.serverFieldSchemas[table] = fieldMeta;
  }

  render(canvas: ITerminalCanvas): void {
    const { cols, rows } = canvas.getSize();

    if (this.dynamicTables.length === 0) {
      const t = getTheme();
      this.header.render(canvas, 1);
      const cy = Math.floor(rows / 2);
      const msg1 = '-  No tables selected';
      const msg2 = '   Select tables in the boot screen to begin exploring.';
      const msg3 = '   Press [r] to restart if you skipped table selection.';
      canvas.write(Math.max(0, Math.floor((cols - msg1.length) / 2)), cy, msg1, t.s.muted);
      canvas.write(Math.max(0, Math.floor((cols - msg2.length) / 2)), cy + 1, msg2, t.s.dim);
      canvas.write(Math.max(0, Math.floor((cols - msg3.length) / 2)), cy + 2, msg3, t.s.dim);
      return;
    }

    const currentTable = this.tabBar.current();
    const viewport = this.viewportState.get(currentTable);
    const data = viewport?.rows ?? [];
    const total = viewport?.totalRows ?? 0;

    const hasDetail = cols >= 120;
    const mainWidth = hasDetail ? cols - DETAIL_PANEL_WIDTH - 1 : cols;

    this.header.render(canvas, 1);
    this.tabBar.render(canvas, 12, 1, (t) => t.replace('state_', ''));

    const t = getTheme();
    const info = `${data.length}/${total} rows`;
    canvas.write(mainWidth - info.length - 2, 1, info, t.s.accent);

    const columns = TABLE_COLUMNS[currentTable] ?? DEFAULT_COLUMNS;

    // Derive hint for empty-state message from viewport loading/error state
    const tableHint = viewport?.isLoading
      ? '⟳  Fetching data...'
      : viewport?.error
        ? `!  ${viewport.error}`
        : undefined;

    this.table.render(
      canvas,
      { x: 0, y: 2, width: mainWidth, height: rows - 4 },
      columns,
      data,
      tableHint,
    );

    const detailRows = this.getFilteredRows(data);
    if (hasDetail && detailRows.length > 0) {
      this.renderDetailPanel(canvas, detailRows, mainWidth, rows);
    }

    if (this.gotoMode) {
      const gotoLabel = ' GO TO ';
      canvas.write(1, rows - 2, gotoLabel, t.s.gotoLabel);
      const promptText = ` ${this.gotoInput}▍`;
      canvas.write(1 + gotoLabel.length, rows - 2, promptText, t.s.text);
      const hint = `Row# | ColName | Row:Col   Tab autocomplete  Enter go  Esc !`;
      const hintX = cols - hint.length - 1;
      if (hintX > 1 + gotoLabel.length + promptText.length + 2) {
        canvas.write(hintX, rows - 2, hint, t.s.muted);
      }
    } else if (this.deleteConfirm) {
      canvas.write(1, rows - 2, ' DELETE this row? (y/n) ', t.s.error);
    } else if (this.insertMode) {
      const field = this.insertFields[this.insertFieldIndex] ?? '';
      const insLabel = ' INSERT ';
      canvas.write(1, rows - 2, insLabel, t.s.success);
      canvas.write(1 + insLabel.length, rows - 2, ` ${field}: `, t.s.success);
      const inputDisplay = (this.insertValues[this.insertFieldIndex] ?? '') + '▍';
      const startX = 1 + insLabel.length + field.length + 4;
      const fieldHint = this.getFieldHint(currentTable, field);
      // Reserve right side for nav hint + field hint
      const navHint = `Tab (${this.insertFieldIndex + 1}/${this.insertFields.length})  Enter  Esc`;
      const rightReserve = navHint.length + (fieldHint ? fieldHint.length + 3 : 0) + 4;
      const maxLen = Math.max(4, cols - startX - rightReserve);
      const shown = inputDisplay.length > maxLen
        ? inputDisplay.slice(inputDisplay.length - maxLen)
        : inputDisplay;
      canvas.write(startX, rows - 2, shown, t.s.text);
      // Field hint (enum values / format note)
      if (fieldHint) {
        const hintX = startX + shown.length + 2;
        const hintStr = `[ ${fieldHint} ]`;
        if (hintX + hintStr.length < cols - navHint.length - 2) {
          canvas.write(hintX, rows - 2, hintStr, t.s.muted);
        }
      }
      canvas.write(cols - navHint.length - 1, rows - 2, navHint, t.s.dim);
    } else if (this.editMode) {
      const editLabel = ' EDIT ';
      canvas.write(1, rows - 2, editLabel, t.s.editLabel);
      const fieldLabel = ` ${this.editField}: `;
      canvas.write(1 + editLabel.length, rows - 2, fieldLabel, { color: t.palette.sysColor, bold: true });
      const inputDisplay = this.editValue + '▍';
      const startX = 1 + editLabel.length + fieldLabel.length;
      const editFieldHint = this.getFieldHint(currentTable, this.editField);
      const editNavHint = 'Enter  Esc';
      const editRightReserve = editNavHint.length + (editFieldHint ? editFieldHint.length + 3 : 0) + 4;
      const maxLen = Math.max(4, cols - startX - editRightReserve);
      const shown = inputDisplay.length > maxLen
        ? inputDisplay.slice(inputDisplay.length - maxLen)
        : inputDisplay;
      canvas.write(startX, rows - 2, shown, t.s.text);
      // Field hint
      if (editFieldHint) {
        const hintX = startX + shown.length + 2;
        const hintStr = `[ ${editFieldHint} ]`;
        if (hintX + hintStr.length < cols - editNavHint.length - 2) {
          canvas.write(hintX, rows - 2, hintStr, t.s.muted);
        }
      }
      canvas.write(cols - editNavHint.length - 1, rows - 2, editNavHint, t.s.dim);
    } else if (this.editFeedback) {
      const isErr = this.editFeedback.startsWith('!');
      canvas.write(1, rows - 2, ` ${this.editFeedback}`, isErr ? t.s.error : t.s.success);
    } else if (this.filterBar.isActive() || this.filterBar.hasFilter()) {
      this.filterBar.render(canvas, rows - 2);
    } else {
      this.hintBar.render(canvas, rows - 2);
    }
  }

  private renderDetailPanel(
    canvas: ITerminalCanvas,
    data: Record<string, unknown>[],
    panelX: number,
    termRows: number,
  ): void {
    const t = getTheme();
    const selectedIdx = this.table.getSelectedIndex();
    const row = data[selectedIdx];
    if (!row) return;

    const w = DETAIL_PANEL_WIDTH;
    const panelStart = 2;
    const panelHeight = termRows - 4;

    for (let y = panelStart - 1; y < panelStart + panelHeight; y++) {
      canvas.write(panelX, y, '│', t.s.border);
    }

    canvas.write(panelX + 2, panelStart, '── Detail ', t.s.accent);

    const entries = Object.entries(row).filter(
      ([k]) => !k.startsWith('_') && k !== 'created_at',
    );

    let y = panelStart + 1;
    for (const [key, value] of entries) {
      if (y >= panelStart + panelHeight) break;
      const label = key.length > 12 ? key.slice(0, 11) + '…' : key;
      const val = String(value ?? '');
      const maxValLen = w - 16;
      const display = val.length > maxValLen ? val.slice(0, maxValLen - 1) + '…' : val;

      canvas.write(panelX + 2, y, label.padEnd(13), t.s.detailKey);
      canvas.write(panelX + 15, y, display, t.s.detailVal);
      y++;
    }
  }

  onKeyPress(key: string): void {
    if (this.gotoMode) {
      this.handleGotoKey(key);
      return;
    }
    if (this.deleteConfirm) {
      this.handleDeleteKey(key);
      return;
    }
    if (this.insertMode) {
      this.handleInsertKey(key);
      return;
    }
    if (this.editMode) {
      this.handleEditKey(key);
      return;
    }

    if (this.filterBar.handleKey(key)) {
      this.table.setFilter(this.filterBar.getText());
      return;
    }

    const currentTable = this.tabBar.current();
    const vp = this.viewportState.get(currentTable);
    const rowCount = vp?.rows.length ?? 0;

    switch (key) {
      case 'up':       this.table.moveUp(); break;
      case 'down':     this.table.moveDown(rowCount); break;
      case 'left':
      case 'h':
        if (this.table.getSelectedCol() === 0) {
          this.switchTable(-1);
        } else {
          this.table.moveLeft();
        }
        break;
      case 'right':
      case 'l':
        if (this.table.getSelectedCol() >= this.table.getColumnNames().length - 1) {
          this.switchTable(1);
        } else {
          this.table.moveRight();
        }
        break;
      case 'pageup':   this.table.movePageUp(); break;
      case 'pagedown': this.table.movePageDown(rowCount); break;
      case 'g':        this.table.moveToTop(); break;
      case 'G':        this.table.moveToBottom(rowCount); break;
      case '0':        this.table.moveToFirstCol(); break;
      case '$':        this.table.moveToLastCol(); break;
      case 'j':        this.table.moveDown(rowCount); break;
      case 'k':        this.table.moveUp(); break;
      case '\r':
      case '\n':       this.startEditSelectedCell(); break;
      case '/':        this.filterBar.activate(); break;
      case '\u001b':
        this.filterBar.clear();
        this.table.clearFilter();
        this.editFeedback = '';
        break;
      case 'e':
      case 'E':        this.startEditSelectedCell(); break;
      case 'd':
      case 'D':        this.startDelete(); break;
      case 'i':
      case 'I':        this.startInsert(); break;
      case '\x07':     this.startGoto(); break;
      case '[':
      case '<':        this.switchTable(-1); break;
      case ']':
      case '>':        this.switchTable(1); break;
    }
  }

  private switchTable(direction: -1 | 1): void {
    if (direction === -1) this.tabBar.prev();
    else this.tabBar.next();
    this.table.reset();
    this.filterBar.clear();
    this.onTableChange?.(this.tabBar.current());
  }

  private startEditSelectedCell(): void {
    const currentTable = this.tabBar.current();
    const vp = this.viewportState.get(currentTable);
    const data = vp?.rows ?? [];
    const selectedIdx = this.table.getSelectedIndex();
    const row = data[selectedIdx];
    if (!row) return;

    const id = String(row['entity_id_hash'] ?? '');
    if (!id) return;

    const colKey = this.table.getSelectedColumnKey();
    if (!colKey || colKey === 'entity_id_hash' || colKey === 'updated_event_time_ms') {
      this.showEditFeedback('! This column is not editable');
      return;
    }

    this.editMode = true;
    this.editField = colKey;
    this.editValue = String(row[colKey] ?? '');
    this.editRowId = id;
  }

  private handleEditKey(key: string): void {
    if (key === '\u001b') {
      this.editMode = false;
      return;
    }

    if (key === '\t') {
      // Tab: move to next editable column on same row
      const currentTable = this.tabBar.current();
      const columns = TABLE_COLUMNS[currentTable] ?? DEFAULT_COLUMNS;
      const editableCols = columns.filter(c => c.key !== 'entity_id_hash' && c.key !== 'updated_event_time_ms');
      const idx = editableCols.findIndex(c => c.key === this.editField);
      const nextIdx = (idx + 1) % editableCols.length;
      this.submitEditThenMoveTo(editableCols[nextIdx].key);
      return;
    }

    if (key === '\r' || key === '\n') {
      this.submitEdit();
      return;
    }

    if (key === '\u007f' || key === '\b') {
      this.editValue = this.editValue.slice(0, -1);
      return;
    }

    if (key.length === 1 && key >= ' ') {
      this.editValue += key;
    }
  }

  private submitEditThenMoveTo(nextField: string): void {
    if (!this.editCallbacks) {
      this.editMode = false;
      return;
    }
    const currentTable = this.tabBar.current();

    const normalizedValue = this.normalizeFieldInput(currentTable, this.editField, this.editValue);
    const validationErr = this.validateField(currentTable, this.editField, normalizedValue);
    if (validationErr) {
      this.showEditFeedback(validationErr);
      return;
    }

    this.editCallbacks.onUpdateCell(currentTable, this.editRowId, this.editField, normalizedValue)
      .then(result => {
        if (result.success) {
          this.showEditFeedback(`+ ${this.editField} updated`);
          this.onTableChange?.(currentTable);
        } else {
          this.showEditFeedback(`! ${result.error ?? 'Update failed'}`);
        }
        const vp = this.viewportState.get(currentTable);
        const data = vp?.rows ?? [];
        const row = data[this.table.getSelectedIndex()];
        this.editField = nextField;
        this.editValue = String(row?.[nextField] ?? '');
        this.markDirtyFn?.();
      })
      .catch(err => {
        this.editMode = false;
        this.showEditFeedback(`! ${err instanceof Error ? err.message : String(err)}`);
        this.markDirtyFn?.();
      });
  }

  private submitEdit(): void {
    if (!this.editCallbacks) {
      this.editMode = false;
      return;
    }

    const currentTable = this.tabBar.current();

    // Client-side validation before hitting API
    const normalizedValue = this.normalizeFieldInput(currentTable, this.editField, this.editValue);
    const validationErr = this.validateField(currentTable, this.editField, normalizedValue);
    if (validationErr) {
      this.showEditFeedback(validationErr);
      return; // keep editMode open so user can correct value
    }

    this.editCallbacks.onUpdateCell(currentTable, this.editRowId, this.editField, normalizedValue)
      .then(result => {
        this.editMode = false;
        if (result.success) {
          this.showEditFeedback(`+ ${this.editField} updated`);
          this.onTableChange?.(currentTable);
        } else {
          this.showEditFeedback(`! ${result.error ?? 'Update failed'}`);
        }
        this.markDirtyFn?.();
      })
      .catch(err => {
        this.editMode = false;
        this.showEditFeedback(`! ${err instanceof Error ? err.message : String(err)}`);
        this.markDirtyFn?.();
      });
  }

  private startDelete(): void {
    const currentTable = this.tabBar.current();
    const vp = this.viewportState.get(currentTable);
    const data = vp?.rows ?? [];
    const selectedIdx = this.table.getSelectedIndex();
    const row = data[selectedIdx];
    if (!row) return;

    const id = String(row['entity_id_hash'] ?? '');
    if (!id) return;

    this.editRowId = id;
    this.deleteConfirm = true;
  }

  private handleDeleteKey(key: string): void {
    if (key === 'y' || key === 'Y') {
      this.deleteConfirm = false;
      const currentTable = this.tabBar.current();
      this.editCallbacks?.onDeleteRow(currentTable, this.editRowId)
        .then(result => {
          if (result.success) {
            this.showEditFeedback('+ Row deleted');
            this.onTableChange?.(currentTable);
          } else {
            this.showEditFeedback(`! ${result.error ?? 'Delete failed'}`);
          }
          this.markDirtyFn?.();
        })
        .catch(err => {
          this.showEditFeedback(`! ${err instanceof Error ? err.message : String(err)}`);
          this.markDirtyFn?.();
        });
    } else {
      this.deleteConfirm = false;
    }
  }

  private startInsert(): void {
    const currentTable = this.tabBar.current();
    const columns = TABLE_COLUMNS[currentTable] ?? DEFAULT_COLUMNS;
    // Exclude auto-managed columns; they will be injected with defaults on submit
    const editable = columns
      .filter(c => c.key !== 'updated_event_time_ms' && c.key !== 'last_offset')
      .map(c => c.key);
    this.insertFields = editable.includes('entity_id_hash')
      ? editable
      : ['entity_id_hash', ...editable];
    this.insertValues = this.insertFields.map(() => '');
    this.insertFieldIndex = 0;
    this.insertMode = true;
  }

  private handleInsertKey(key: string): void {
    if (key === '\u001b') {
      this.insertMode = false;
      return;
    }

    if (key === '\t') {
      this.insertFieldIndex = (this.insertFieldIndex + 1) % this.insertFields.length;
      return;
    }

    if (key === '\r' || key === '\n') {
      this.submitInsert();
      return;
    }

    if (key === '\u007f' || key === '\b') {
      const current = this.insertValues[this.insertFieldIndex] ?? '';
      this.insertValues[this.insertFieldIndex] = current.slice(0, -1);
      return;
    }

    if (key.length === 1 && key >= ' ') {
      this.insertValues[this.insertFieldIndex] =
        (this.insertValues[this.insertFieldIndex] ?? '') + key;
    }
  }

  private submitInsert(): void {
    if (!this.editCallbacks) {
      this.insertMode = false;
      return;
    }

    const currentTable = this.tabBar.current();
    const data: Record<string, string> = {};
    for (let i = 0; i < this.insertFields.length; i++) {
      const raw = this.insertValues[i] ?? '';
      const val = this.normalizeFieldInput(currentTable, this.insertFields[i], raw);
      if (val) data[this.insertFields[i]] = val;
    }

    if (Object.keys(data).length === 0) {
      this.insertMode = false;
      this.showEditFeedback('! No data entered');
      return;
    }

    // Client-side validation for all provided fields
    for (const [field, value] of Object.entries(data)) {
      const err = this.validateField(currentTable, field, value);
      if (err) {
        // Focus the failing field so user can correct it
        const fieldIdx = this.insertFields.indexOf(field);
        if (fieldIdx !== -1) this.insertFieldIndex = fieldIdx;
        this.showEditFeedback(err);
        return; // keep insertMode open
      }
    }

    // Auto-inject required timestamp and offset columns for state tables
    if (!data['updated_event_time_ms']) data['updated_event_time_ms'] = String(Date.now());
    if (!data['last_offset']) data['last_offset'] = '0';

    this.editCallbacks.onInsertRow(currentTable, data)
      .then(result => {
        this.insertMode = false;
        if (result.success) {
          this.showEditFeedback('+ Row inserted');
          this.onTableChange?.(currentTable);
        } else {
          this.showEditFeedback(`! ${result.error ?? 'Insert failed'}`);
        }
        this.markDirtyFn?.();
      })
      .catch(err => {
        this.insertMode = false;
        this.showEditFeedback(`! ${err instanceof Error ? err.message : String(err)}`);
        this.markDirtyFn?.();
      });
  }

  private startGoto(): void {
    this.gotoMode = true;
    this.gotoInput = '';
  }

  private handleGotoKey(key: string): void {
    if (key === '\u001b') {
      this.gotoMode = false;
      return;
    }

    if (key === '\r' || key === '\n') {
      this.executeGoto();
      return;
    }

    if (key === '\u007f' || key === '\b') {
      this.gotoInput = this.gotoInput.slice(0, -1);
      return;
    }

    if (key === '\t') {
      this.autocompleteGoto();
      return;
    }

    if (key.length === 1 && key >= ' ') {
      this.gotoInput += key;
    }
  }

  private executeGoto(): void {
    this.gotoMode = false;
    const input = this.gotoInput.trim();
    if (!input) return;

    const currentTable = this.tabBar.current();
    const vp = this.viewportState.get(currentTable);
    const rowCount = vp?.rows.length ?? 0;

    if (input.includes(':')) {
      const [rowPart, colPart] = input.split(':').map(s => s.trim());
      let moved = false;
      if (rowPart) {
        const rowNum = parseInt(rowPart, 10);
        if (!isNaN(rowNum) && rowNum >= 1) {
          moved = this.table.goToRow(rowNum - 1, rowCount);
        }
      }
      if (colPart) {
        const colNum = parseInt(colPart, 10);
        if (!isNaN(colNum) && colNum >= 1) {
          const colIdx = colNum - 1;
          if (colIdx >= 0 && colIdx < this.table.getColumnNames().length) {
            this.table.goToColByName(this.table.getColumnNames()[colIdx]);
            moved = true;
          }
        } else {
          const foundCol = this.table.goToColByName(colPart);
          if (foundCol) moved = true;
        }
      }
      if (!moved) this.showEditFeedback(`! Invalid target: ${input}`);
      else this.showEditFeedback(`→ Moved to ${input}`);
    } else {
      const rowNum = parseInt(input, 10);
      if (!isNaN(rowNum) && rowNum >= 1) {
        const ok = this.table.goToRow(rowNum - 1, rowCount);
        if (ok) this.showEditFeedback(`→ Row ${rowNum}`);
        else this.showEditFeedback(`! Row ${rowNum} out of range (1-${rowCount})`);
      } else {
        const ok = this.table.goToColByName(input);
        if (ok) this.showEditFeedback(`→ Column "${input}"`);
        else this.showEditFeedback(`! Column "${input}" not found`);
      }
    }
  }

  private autocompleteGoto(): void {
    const input = this.gotoInput.trim().toLowerCase();
    if (!input) return;

    const colPart = input.includes(':') ? input.split(':')[1]?.trim() ?? '' : input;
    if (!colPart || /^\d+$/.test(colPart)) return;

    const colNames = this.table.getColumnNames();
    const currentTable = this.tabBar.current();
    const columns = TABLE_COLUMNS[currentTable] ?? DEFAULT_COLUMNS;
    const colKeys = columns.map(c => c.key);

    const allNames = [...new Set([...colNames, ...colKeys])];
    const match = allNames.find(n => n.toLowerCase().startsWith(colPart));
    if (match) {
      const prefix = input.includes(':') ? input.split(':')[0] + ':' : '';
      this.gotoInput = prefix + match;
    }
  }

  // ── Field validation ──────────────────────────────────────

  private getFieldSchema(table: string, field: string): FieldMeta | undefined {
    return this.serverFieldSchemas[table]?.[field] ?? FIELD_SCHEMAS[table]?.[field];
  }

  private validateField(table: string, field: string, value: string): string | null {
    const schema = this.getFieldSchema(table, field);
    if (!schema) return null;

    if (schema.enum && !schema.enum.includes(value)) {
      return `! ${field}: must be one of  ${schema.enum.join(' · ')}`;
    }

    if (schema.min !== undefined || schema.max !== undefined) {
      const n = Number(value);
      if (isNaN(n)) return `! ${field}: must be a number`;
      if (schema.min !== undefined && n < schema.min) return `! ${field}: min ${schema.min}`;
      if (schema.max !== undefined && n > schema.max) return `! ${field}: max ${schema.max}`;
    }

    if (schema.maxLen !== undefined && value.length > schema.maxLen) {
      return `! ${field}: max ${schema.maxLen} characters (got ${value.length})`;
    }

    if (schema.pattern) {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) return `! ${field}: invalid format`;
    }

    return null;
  }

  private normalizeFieldInput(table: string, field: string, value: string): string {
    const trimmed = value.trim();
    const schema = this.getFieldSchema(table, field);
    if (!schema) return trimmed;

    if (schema.enum) {
      const matched = schema.enum.find((v) => v.toLowerCase() === trimmed.toLowerCase());
      if (matched) return matched;
    }

    if (schema.uppercase || field === 'currency_code' || field === 'country_code') {
      return trimmed.toUpperCase();
    }

    return trimmed;
  }

  private getFieldHint(table: string, field: string): string {
    return this.getFieldSchema(table, field)?.hint ?? '';
  }

  private getFilteredRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    const filter = this.table.getFilter().trim().toLowerCase();
    if (!filter) return rows;
    return rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(filter)),
    );
  }

  private showEditFeedback(msg: string): void {
    this.editFeedback = msg;
    if (this.editFeedbackTimer) clearTimeout(this.editFeedbackTimer);
    this.editFeedbackTimer = setTimeout(() => {
      this.editFeedback = '';
      this.markDirtyFn?.();
    }, 4000);
  }

  getContext(): SceneContext {
    const currentTable = this.tabBar.current();
    const viewport = this.viewportState.get(currentTable);
    const data = viewport?.rows ?? [];
    const selectedIdx = this.table.getSelectedIndex();
    const selectedRow = data[selectedIdx];

    const columnNames = (TABLE_COLUMNS[currentTable] ?? DEFAULT_COLUMNS).map(c => c.key);

    return {
      scene: 'explore',
      summary: `Viewing table "${currentTable}" (${data.length} rows). Columns: ${columnNames.join(', ')}`,
      details: {
        table: currentTable,
        rowCount: data.length,
        totalRows: viewport?.totalRows ?? 0,
        columns: columnNames,
        selectedRow: selectedRow
          ? Object.fromEntries(Object.entries(selectedRow).slice(0, 10))
          : null,
        sampleData: data.slice(0, 3).map(r =>
          Object.fromEntries(Object.entries(r).slice(0, 6)),
        ),
      },
    };
  }

  onSlowFrame(_durationMs: number): void {}

  setTable(table: string): void {
    this.tabBar.setByValue(table);
  }
}
