import type { IDbPool } from './IDbPool.js';

export interface ColumnMeta {
  table: string;
  column: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  defaultValue: string | null;
}

export interface TableMeta {
  name: string;
  rowEstimate: number;
  sizeBytes: number;
  sizeHuman: string;
  comment: string | null;
  columns: ColumnMeta[];
}

export interface IndexMeta {
  name: string;
  table: string;
  columns: string;
  isUnique: boolean;
  isPrimary: boolean;
  definition: string;
  sizeBytes: number;
  sizeHuman: string;
}

export interface IndexUsage {
  name: string;
  table: string;
  scans: number;
  tuplesRead: number;
  tuplesFetched: number;
  sizeHuman: string;
}

export interface TableStat {
  table: string;
  seqScans: number;
  seqTupRead: number;
  idxScans: number;
  idxTupFetch: number;
  liveRows: number;
  deadRows: number;
}

export class SchemaIntrospector {
  constructor(private readonly pool: IDbPool) {}

  async getTables(): Promise<TableMeta[]> {
    const tablesResult = await this.pool.query(`
      SELECT
        c.relname AS name,
        c.reltuples::bigint AS row_estimate,
        pg_total_relation_size(c.oid) AS size_bytes,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS size_human,
        obj_description(c.oid) AS comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
      ORDER BY c.relname
    `);

    const columnsResult = await this.pool.query(`
      SELECT
        c.table_name AS table,
        c.column_name AS column,
        c.data_type,
        c.is_nullable = 'YES' AS nullable,
        c.column_default AS default_value,
        COALESCE(pk.is_pk, false) AS is_primary_key
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.table_name, kcu.column_name, true AS is_pk
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
      ) pk ON pk.table_name = c.table_name AND pk.column_name = c.column_name
      WHERE c.table_schema = 'public'
      ORDER BY c.table_name, c.ordinal_position
    `);

    const columnsByTable = new Map<string, ColumnMeta[]>();
    for (const row of columnsResult.rows) {
      const table = String(row.table);
      if (!columnsByTable.has(table)) columnsByTable.set(table, []);
      columnsByTable.get(table)!.push({
        table,
        column: String(row.column),
        dataType: String(row.data_type),
        nullable: Boolean(row.nullable),
        isPrimaryKey: Boolean(row.is_primary_key),
        defaultValue: row.default_value ? String(row.default_value) : null,
      });
    }

    return tablesResult.rows.map(row => ({
      name: String(row.name),
      rowEstimate: Number(row.row_estimate),
      sizeBytes: Number(row.size_bytes),
      sizeHuman: String(row.size_human),
      comment: row.comment ? String(row.comment) : null,
      columns: columnsByTable.get(String(row.name)) ?? [],
    }));
  }

  async getIndexes(): Promise<IndexMeta[]> {
    const result = await this.pool.query(`
      SELECT
        i.indexname AS name,
        i.tablename AS table,
        array_to_string(ARRAY(
          SELECT a.attname
          FROM pg_index ix
          JOIN pg_class ic ON ic.oid = ix.indexrelid
          JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = ANY(ix.indkey)
          WHERE ic.relname = i.indexname
          ORDER BY array_position(ix.indkey, a.attnum)
        ), ', ') AS columns,
        ix2.indisunique AS is_unique,
        ix2.indisprimary AS is_primary,
        i.indexdef AS definition,
        pg_relation_size(ic2.oid) AS size_bytes,
        pg_size_pretty(pg_relation_size(ic2.oid)) AS size_human
      FROM pg_indexes i
      JOIN pg_class ic2 ON ic2.relname = i.indexname
      JOIN pg_index ix2 ON ix2.indexrelid = ic2.oid
      WHERE i.schemaname = 'public'
      ORDER BY i.tablename, i.indexname
    `);

    return result.rows.map(row => ({
      name: String(row.name),
      table: String(row.table),
      columns: String(row.columns),
      isUnique: Boolean(row.is_unique),
      isPrimary: Boolean(row.is_primary),
      definition: String(row.definition),
      sizeBytes: Number(row.size_bytes),
      sizeHuman: String(row.size_human),
    }));
  }

  async getIndexUsageStats(): Promise<IndexUsage[]> {
    const result = await this.pool.query(`
      SELECT
        s.indexrelname AS name,
        s.relname AS table,
        s.idx_scan AS scans,
        s.idx_tup_read AS tuples_read,
        s.idx_tup_fetch AS tuples_fetched,
        pg_size_pretty(pg_relation_size(s.indexrelid)) AS size_human
      FROM pg_stat_user_indexes s
      ORDER BY s.idx_scan DESC
    `);

    return result.rows.map(row => ({
      name: String(row.name),
      table: String(row.table),
      scans: Number(row.scans),
      tuplesRead: Number(row.tuples_read),
      tuplesFetched: Number(row.tuples_fetched),
      sizeHuman: String(row.size_human),
    }));
  }

  async getTableStats(): Promise<TableStat[]> {
    const result = await this.pool.query(`
      SELECT
        relname AS table,
        seq_scan AS seq_scans,
        seq_tup_read AS seq_tup_read,
        COALESCE(idx_scan, 0) AS idx_scans,
        COALESCE(idx_tup_fetch, 0) AS idx_tup_fetch,
        n_live_tup AS live_rows,
        n_dead_tup AS dead_rows
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY relname
    `);

    return result.rows.map(row => ({
      table: String(row.table),
      seqScans: Number(row.seq_scans),
      seqTupRead: Number(row.seq_tup_read),
      idxScans: Number(row.idx_scans),
      idxTupFetch: Number(row.idx_tup_fetch),
      liveRows: Number(row.live_rows),
      deadRows: Number(row.dead_rows),
    }));
  }

  async getSchemaContext(): Promise<string> {
    const tables = await this.getTables();
    const lines: string[] = ['DATABASE SCHEMA:'];
    for (const t of tables) {
      lines.push(`\nTABLE ${t.name} (~${t.rowEstimate} rows, ${t.sizeHuman}):`);
      if (t.comment) lines.push(`  -- ${t.comment}`);
      for (const c of t.columns) {
        const pk = c.isPrimaryKey ? ' [PK]' : '';
        const nullable = c.nullable ? ' NULL' : ' NOT NULL';
        lines.push(`  ${c.column} ${c.dataType}${nullable}${pk}`);
      }
    }
    return lines.join('\n');
  }
}
