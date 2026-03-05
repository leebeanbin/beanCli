'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { parseExplain, type ExplainNode } from '../../lib/explainParser';

interface ColumnMeta {
  name?: string;
  column_name?: string;
  type?: string;
  data_type?: string;
  nullable?: boolean | string;
  is_nullable?: string;
  default_value?: string;
  column_default?: string;
}

interface IndexMeta {
  index_name?: string;
  table_name?: string;
  column_names?: string;
  is_unique?: boolean;
  scan_count?: number;
}

interface SchemaTable {
  name?: string;
  table_name?: string;
  row_count?: number;
  total_size?: string;
}

// ── EXPLAIN Tree renderer ─────────────────────────────────────────────────────

function ExplainTree({ node, depth = 0 }: { node: ExplainNode; depth?: number }) {
  const indent = depth * 20;
  const isRoot = node.operation === 'Query Plan';
  return (
    <div>
      {!isRoot && (
        <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: `${indent}px` }}>
          <span className="text-fg-2 shrink-0">{depth > 0 ? '→' : ''}</span>
          <div className="min-w-0">
            <span className="font-mono text-xs text-accent font-bold">{node.operation}</span>
            {node.cost && (
              <span className="font-mono text-xs text-fg-2 ml-2">{node.cost}</span>
            )}
            {node.actualTime && (
              <span className="font-mono text-xs text-ok ml-2">actual={node.actualTime}</span>
            )}
            {node.rows != null && (
              <span className="font-mono text-xs text-fg-2 ml-2">rows={node.rows}</span>
            )}
          </div>
        </div>
      )}
      {node.children.map((child, i) => (
        <ExplainTree key={i} node={child} depth={isRoot ? 0 : depth + 1} />
      ))}
    </div>
  );
}

export default function SchemaPage() {
  const [tables, setTables] = useState<SchemaTable[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [indexes, setIndexes] = useState<IndexMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiClient.get<SchemaTable[] | { tables: SchemaTable[] }>(
        '/api/v1/schema/tables',
      );
      if (res.ok && res.data) {
        const data = res.data;
        setTables(Array.isArray(data) ? data : data.tables ?? []);
      }
    })();
  }, []);

  async function selectTable(name: string) {
    setSelected(name);
    setAnalyzeResult(null);
    setLoading(true);
    const [colRes, idxRes] = await Promise.all([
      // /api/v1/state/:table/schema returns column info
      apiClient.get<ColumnMeta[]>(`/api/v1/state/${name}/schema`),
      apiClient.get<{ indexes: IndexMeta[]; usage: IndexMeta[] }>('/api/v1/schema/indexes'),
    ]);
    if (colRes.ok && colRes.data) setColumns(Array.isArray(colRes.data) ? colRes.data : []);
    if (idxRes.ok && idxRes.data) {
      const all = idxRes.data.indexes ?? [];
      setIndexes(all.filter((i) => i.table_name === name));
    }
    setLoading(false);
  }

  async function analyze() {
    if (!selected) return;
    // analyze endpoint expects { sql: string }
    const res = await apiClient.post<{ plan?: string | string[]; error?: string }>(
      '/api/v1/schema/analyze',
      { sql: `SELECT * FROM "${selected}" LIMIT 1` },
    );
    if (res.ok && res.data) {
      const plan = res.data.plan;
      const planStr = Array.isArray(plan) ? plan.join('\n') : (plan ?? res.data.error ?? 'No result');
      setAnalyzeResult(planStr);
    } else {
      setAnalyzeResult(res.error ?? 'Analyze failed');
    }
  }

  function getColName(c: ColumnMeta) {
    return c.name ?? c.column_name ?? '—';
  }
  function getColType(c: ColumnMeta) {
    return c.type ?? c.data_type ?? '—';
  }
  function getColNullable(c: ColumnMeta) {
    if (c.nullable != null) return c.nullable ? 'YES' : 'NO';
    return c.is_nullable ?? '—';
  }
  function getColDefault(c: ColumnMeta) {
    return c.default_value ?? c.column_default ?? '—';
  }

  return (
    <div>
      <h1 className="font-pixel text-3xl text-fg mb-6">[ Schema Viewer ]</h1>

      <div className="flex gap-4">
        {/* Table list */}
        <div className="w-56 shrink-0">
          <div className="bg-bg-2 border border-rim shadow-px p-2">
            <div className="font-pixel text-xl text-fg-2 mb-2">Tables</div>
            {tables.map((t) => {
              const name = t.name ?? t.table_name ?? '';
              return (
                <div
                  key={name}
                  onClick={() => void selectTable(name)}
                  className={`font-mono text-xs px-2 py-1 cursor-pointer truncate ${
                    selected === name
                      ? 'bg-accent text-bg'
                      : 'text-fg hover:bg-bg hover:text-accent'
                  }`}
                >
                  {name}
                  {t.row_count != null && (
                    <span className="ml-1 text-fg-2">({t.row_count})</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Schema panel */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="bg-bg-2 border border-rim shadow-px p-6">
              <div className="font-pixel text-xl text-fg-2">Select a table to inspect.</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-bg-2 border border-rim shadow-px p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-pixel text-xl text-fg-2">[ {selected} — Columns ]</div>
                  <button
                    onClick={() => void analyze()}
                    className="font-pixel text-lg border border-accent text-accent hover:bg-accent hover:text-bg px-2 py-0.5 transition-none"
                  >
                    EXPLAIN ANALYZE
                  </button>
                </div>
                {loading ? (
                  <p className="text-fg-2 text-xs font-mono">Loading…</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono border-collapse">
                      <thead>
                        <tr>
                          {['Column', 'Type', 'Nullable', 'Default'].map((h) => (
                            <th
                              key={h}
                              className="text-left px-2 py-1 font-pixel text-lg text-fg-2 border-b border-rim"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {columns.map((c, i) => (
                          <tr key={i} className="border-b border-rim">
                            <td className="px-2 py-1 text-accent font-bold">{getColName(c)}</td>
                            <td className="px-2 py-1 text-fg">{getColType(c)}</td>
                            <td className="px-2 py-1 text-fg-2">{getColNullable(c)}</td>
                            <td className="px-2 py-1 text-fg-2 truncate max-w-xs">
                              {getColDefault(c)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {indexes.length > 0 && (
                <div className="bg-bg-2 border border-rim shadow-px p-4">
                  <div className="font-pixel text-xl text-fg-2 mb-2">[ Indexes ]</div>
                  <table className="w-full text-xs font-mono border-collapse">
                    <thead>
                      <tr>
                        {['Name', 'Columns', 'Unique', 'Scans'].map((h) => (
                          <th
                            key={h}
                            className="text-left px-2 py-1 font-pixel text-lg text-fg-2 border-b border-rim"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {indexes.map((idx, i) => (
                        <tr key={i} className="border-b border-rim">
                          <td className="px-2 py-1 text-fg">{idx.index_name ?? '—'}</td>
                          <td className="px-2 py-1 text-fg">{idx.column_names ?? '—'}</td>
                          <td className="px-2 py-1 text-fg-2">{idx.is_unique ? 'YES' : 'NO'}</td>
                          <td className="px-2 py-1 text-fg-2">{idx.scan_count ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {analyzeResult && (
                <div className="bg-bg-2 border border-rim shadow-px p-4">
                  <div className="font-pixel text-xl text-fg-2 mb-2">[ EXPLAIN ANALYZE ]</div>
                  {(() => {
                    const lines = analyzeResult.split('\n');
                    const tree = parseExplain(lines);
                    const hasTree = tree.children.length > 0;
                    return hasTree ? (
                      <div className="overflow-x-auto">
                        <ExplainTree node={tree} />
                      </div>
                    ) : (
                      <pre className="font-mono text-xs text-fg whitespace-pre-wrap">{analyzeResult}</pre>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
