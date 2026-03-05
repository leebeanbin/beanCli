/**
 * EXPLAIN ANALYZE plan text parser.
 * Converts PostgreSQL EXPLAIN output lines into a tree of ExplainNode objects.
 */

export interface ExplainNode {
  operation: string;   // e.g. "Seq Scan on users"
  cost: string;        // e.g. "cost=0.00..1.05"
  actualTime?: string; // e.g. "actual time=0.012..0.034"
  rows?: number;
  children: ExplainNode[];
  indent: number;      // raw indent level (spaces / 2)
}

const COST_RE = /\(cost=([\d.]+\.\.[\d.]+)/;
const ACTUAL_RE = /actual time=([\d.]+\.\.[\d.]+)/;
const ROWS_RE = /rows=(\d+)/;

function parseLine(line: string): { indent: number; text: string } | null {
  const match = line.match(/^(\s*)->/);
  if (!match) {
    // root node (no "->")
    const rootMatch = line.match(/^(\s*)([\w].+)/);
    if (rootMatch) return { indent: 0, text: rootMatch[2]!.trim() };
    return null;
  }
  const spaces = match[1]!.length;
  const text = line.slice(match[0].length).trim();
  return { indent: Math.floor(spaces / 2) + 1, text };
}

function extractNode(text: string, indent: number): ExplainNode {
  // Strip parenthetical annotations for operation name
  const opMatch = text.match(/^([^(]+)/);
  const operation = (opMatch?.[1] ?? text).trim();
  const cost = COST_RE.exec(text)?.[1] ?? '';
  const actualTime = ACTUAL_RE.exec(text)?.[1];
  const rowsMatch = ROWS_RE.exec(text);
  const rows = rowsMatch ? Number(rowsMatch[1]) : undefined;
  return { operation, cost: cost ? `cost=${cost}` : '', actualTime, rows, children: [], indent };
}

export function parseExplain(lines: string[]): ExplainNode {
  const root: ExplainNode = { operation: 'Query Plan', cost: '', children: [], indent: -1 };
  const stack: ExplainNode[] = [root];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    const node = extractNode(parsed.text, parsed.indent);

    // Pop stack until parent indent < node indent
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= node.indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]!;
    parent.children.push(node);
    stack.push(node);
  }
  return root;
}
