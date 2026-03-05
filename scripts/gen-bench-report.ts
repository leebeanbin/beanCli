#!/usr/bin/env tsx
/**
 * gen-bench-report.ts
 *
 * docs/bench-results/*.json → docs/load-test-report.md + docs/load-test-report.html
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

interface LatencyStats {
  average: number;
  stddev: number;
  min: number;
  max: number;
  p50: number;
  p97_5: number;
  p99: number;
  p99_9: number;
}

interface RequestStats {
  average: number;
  mean: number;
  stddev: number;
  min: number;
  max: number;
  total: number;
}

interface BenchResult {
  title: string;
  connections: number;
  duration: number;
  errors: number;
  timeouts: number;
  non2xx: number;
  '2xx': number;
  latency: LatencyStats;
  requests: RequestStats;
}

interface BenchFile {
  name: string;
  timestamp: string;
  results: BenchResult[];
}

// ── Load data ─────────────────────────────────────────────────────────────────

const BENCH_DIR = path.resolve(__dirname, '../docs/bench-results');
const OUT_DIR   = path.resolve(__dirname, '../docs');

const files = fs.readdirSync(BENCH_DIR)
  .filter(f => f.endsWith('.json'))
  .sort();

const datasets: BenchFile[] = files.map(f =>
  JSON.parse(fs.readFileSync(path.join(BENCH_DIR, f), 'utf8')) as BenchFile,
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function bar(value: number, max: number, width = 30): string {
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function statusIcon(r: BenchResult): string {
  if (r.errors > 0 || r.timeouts > 0 || r.non2xx > 0) return '⚠';
  return '✓';
}

// ── Markdown ──────────────────────────────────────────────────────────────────

function buildMarkdown(): string {
  const lines: string[] = [];
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';

  lines.push('# BeanCLI API Load Test Report');
  lines.push('');
  lines.push(`> Generated: ${now}  `);
  lines.push(`> Tool: [autocannon](https://github.com/mcollina/autocannon)  `);
  lines.push(`> Environment: Node.js ${process.version}, macOS (Darwin)  `);
  lines.push(`> Server: Fastify (mocked DB — pure routing throughput)  `);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Summary table across all suites
  lines.push('## Summary');
  lines.push('');
  lines.push('| Suite | Scenarios | Avg Req/s | Best Req/s | Worst p99 (ms) |');
  lines.push('|-------|:---------:|----------:|----------:|---------------:|');

  for (const ds of datasets) {
    const avgRps  = ds.results.reduce((s, r) => s + r.requests.average, 0) / ds.results.length;
    const bestRps = Math.max(...ds.results.map(r => r.requests.average));
    const worstP99 = Math.max(...ds.results.map(r => r.latency.p99));
    lines.push(`| **${ds.name}** | ${ds.results.length} | ${fmt(avgRps, 0)} | ${fmt(bestRps, 0)} | ${fmt(worstP99)} |`);
  }
  lines.push('');

  // Per-suite detail
  for (const ds of datasets) {
    lines.push(`---`);
    lines.push('');
    lines.push(`## Suite: \`${ds.name}\``);
    lines.push('');
    lines.push(`_Run at: ${ds.timestamp}_`);
    lines.push('');

    const maxRps = Math.max(...ds.results.map(r => r.requests.average));

    lines.push('| # | Endpoint | c | Req/s avg | p50 ms | p99 ms | p99.9 ms | Err |');
    lines.push('|---|----------|:-:|----------:|-------:|-------:|---------:|:---:|');

    ds.results.forEach((r, i) => {
      const icon = statusIcon(r);
      const errs = r.errors + r.timeouts + r.non2xx;
      lines.push(
        `| ${i + 1} | \`${r.title}\` | ${r.connections} | **${fmt(r.requests.average, 0)}** | ${fmt(r.latency.p50)} | ${fmt(r.latency.p99)} | ${fmt(r.latency.p99_9)} | ${icon}${errs > 0 ? ` (${errs})` : ''} |`,
      );
    });
    lines.push('');

    // ASCII bar chart
    lines.push('### Throughput — Req/s (avg)');
    lines.push('');
    lines.push('```');
    ds.results.forEach(r => {
      const label = r.title.length > 42 ? r.title.slice(0, 42) + '…' : r.title.padEnd(43);
      lines.push(`${label} ${bar(r.requests.average, maxRps)} ${fmt(r.requests.average, 0).padStart(6)} rps`);
    });
    lines.push('```');
    lines.push('');

    // Latency breakdown
    lines.push('### Latency breakdown (ms)');
    lines.push('');
    lines.push('| Endpoint | avg | p50 | p97.5 | p99 | p99.9 | stddev |');
    lines.push('|----------|----:|----:|------:|----:|------:|-------:|');
    ds.results.forEach(r => {
      lines.push(
        `| \`${r.title}\` | ${fmt(r.latency.average)} | ${fmt(r.latency.p50)} | ${fmt(r.latency.p97_5)} | ${fmt(r.latency.p99)} | ${fmt(r.latency.p99_9)} | ${fmt(r.latency.stddev)} |`,
      );
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- All DB calls are **mocked** (instant) — numbers reflect pure Fastify routing + middleware overhead.');
  lines.push('- `auth` suite simulates bcrypt via `setTimeout(200ms)` per pgPool.query, showing realistic IO-bound behaviour.');
  lines.push('- Rate limiter is **disabled** in bench mode (`disableRateLimit: true`).');
  lines.push('- Request logging is **disabled** to prevent pino buffer OOM at high concurrency.');
  lines.push('- Concurrency kept at ≤50 to stay within Node.js single-process event loop capacity.');
  lines.push('');

  return lines.join('\n');
}

// ── HTML ──────────────────────────────────────────────────────────────────────

function buildHtml(): string {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';

  // Build chart data per suite
  const suiteSections = datasets.map(ds => {
    const maxRps = Math.max(...ds.results.map(r => r.requests.average));

    const rows = ds.results.map((r, i) => {
      const pct     = Math.round((r.requests.average / maxRps) * 100);
      const hasErr  = r.errors + r.timeouts + r.non2xx > 0;
      const barClass = hasErr ? 'bar-warn' : 'bar-ok';
      const rowClass = hasErr ? 'row-warn' : '';

      return `
        <tr class="${rowClass}">
          <td class="num">${i + 1}</td>
          <td class="endpoint">${r.title}</td>
          <td class="num">${r.connections}</td>
          <td>
            <div class="bar-wrap">
              <div class="bar ${barClass}" style="width:${pct}%"></div>
              <span class="bar-label">${r.requests.average.toFixed(0)}</span>
            </div>
          </td>
          <td class="num">${r.latency.p50.toFixed(1)}</td>
          <td class="num ${r.latency.p99 > 500 ? 'warn' : ''}">${r.latency.p99.toFixed(1)}</td>
          <td class="num ${r.latency.p99_9 > 1000 ? 'warn' : ''}">${r.latency.p99_9.toFixed(1)}</td>
          <td class="num">${r.latency.stddev.toFixed(1)}</td>
          <td class="num ${hasErr ? 'warn' : 'ok'}">${hasErr ? r.errors + r.timeouts + r.non2xx : '—'}</td>
        </tr>`;
    }).join('');

    return `
      <section>
        <h2>Suite: <code>${ds.name}</code></h2>
        <p class="meta">Run at: ${ds.timestamp}</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Endpoint</th>
                <th>c</th>
                <th>Req/s (avg)</th>
                <th>p50 ms</th>
                <th>p99 ms</th>
                <th>p99.9 ms</th>
                <th>stddev</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;
  }).join('');

  // Summary cards
  const cards = datasets.map(ds => {
    const avgRps   = ds.results.reduce((s, r) => s + r.requests.average, 0) / ds.results.length;
    const bestRps  = Math.max(...ds.results.map(r => r.requests.average));
    const worstP99 = Math.max(...ds.results.map(r => r.latency.p99));
    const totalReq = ds.results.reduce((s, r) => s + r['2xx'], 0);

    return `
      <div class="card">
        <div class="card-title">${ds.name}</div>
        <div class="card-stat">${avgRps.toFixed(0)} <span>rps avg</span></div>
        <div class="card-sub">
          Best: ${bestRps.toFixed(0)} rps &nbsp;|&nbsp;
          Worst p99: ${worstP99.toFixed(0)} ms &nbsp;|&nbsp;
          Total 2xx: ${totalReq.toLocaleString()}
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BeanCLI — Load Test Report</title>
  <style>
    :root {
      --bg: #0d1117;
      --bg2: #161b22;
      --border: #30363d;
      --fg: #e6edf3;
      --fg2: #8b949e;
      --accent: #58a6ff;
      --ok: #3fb950;
      --warn: #f85149;
      --bar-ok: #238636;
      --bar-warn: #b08800;
      --radius: 6px;
      font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--fg); padding: 24px; line-height: 1.5; }
    header { border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 24px; }
    header h1 { font-size: 1.6rem; color: var(--accent); letter-spacing: 0.05em; }
    header p  { color: var(--fg2); font-size: 0.8rem; margin-top: 4px; }

    .cards { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 32px; }
    .card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; min-width: 200px; flex: 1; }
    .card-title { font-size: 0.75rem; color: var(--fg2); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
    .card-stat { font-size: 2rem; color: var(--accent); font-weight: 700; }
    .card-stat span { font-size: 0.8rem; color: var(--fg2); font-weight: 400; }
    .card-sub { font-size: 0.75rem; color: var(--fg2); margin-top: 4px; }

    section { margin-bottom: 40px; }
    h2 { font-size: 1.1rem; color: var(--fg); margin-bottom: 4px; border-left: 3px solid var(--accent); padding-left: 10px; }
    h2 code { background: var(--bg2); padding: 1px 6px; border-radius: 3px; color: var(--accent); }
    .meta { font-size: 0.75rem; color: var(--fg2); margin-bottom: 12px; margin-left: 13px; }

    .table-wrap { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th, td { padding: 7px 12px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
    th { background: var(--bg2); color: var(--fg2); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--bg2); }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.endpoint { max-width: 320px; overflow: hidden; text-overflow: ellipsis; color: var(--fg); }
    .row-warn td { background: rgba(248,81,73,0.05); }

    .bar-wrap { display: flex; align-items: center; gap: 8px; min-width: 160px; }
    .bar { height: 14px; border-radius: 2px; min-width: 2px; transition: width 0.3s; }
    .bar-ok   { background: var(--bar-ok); }
    .bar-warn { background: var(--bar-warn); }
    .bar-label { font-size: 0.8rem; color: var(--fg2); min-width: 48px; }

    .ok   { color: var(--ok); }
    .warn { color: var(--warn); }

    footer { border-top: 1px solid var(--border); margin-top: 40px; padding-top: 16px; color: var(--fg2); font-size: 0.75rem; }
    footer a { color: var(--accent); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <header>
    <h1>⚡ BeanCLI — API Load Test Report</h1>
    <p>Generated: ${now} &nbsp;|&nbsp; Tool: autocannon &nbsp;|&nbsp; Server: Fastify (mocked DB) &nbsp;|&nbsp; Node ${process.version}</p>
  </header>

  <div class="cards">${cards}</div>

  ${suiteSections}

  <footer>
    <p>
      All DB calls are <strong>mocked</strong> (instant) — numbers reflect pure Fastify routing + middleware overhead.<br>
      <code>auth</code> suite simulates bcrypt via <code>setTimeout(200ms)</code> per query, showing realistic IO-bound behaviour.<br>
      Rate limiter and request logging are <strong>disabled</strong> in bench mode.
    </p>
    <p style="margin-top:8px">Generated by <a href="scripts/gen-bench-report.ts">gen-bench-report.ts</a></p>
  </footer>
</body>
</html>`;
}

// ── Write ─────────────────────────────────────────────────────────────────────

const md   = buildMarkdown();
const html = buildHtml();

fs.writeFileSync(path.join(OUT_DIR, 'load-test-report.md'),   md,   'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'load-test-report.html'), html, 'utf8');

console.log('✓ docs/load-test-report.md');
console.log('✓ docs/load-test-report.html');
