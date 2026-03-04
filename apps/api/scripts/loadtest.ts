/**
 * apps/api/scripts/loadtest.ts
 *
 * autocannon HTTP load test for the beanCli Fastify API.
 * Run: pnpm --filter @tfsdc/api loadtest
 * Or:  API_URL=http://localhost:3100 node --import tsx apps/api/scripts/loadtest.ts
 *
 * Requires the API to be running:
 *   pnpm dev:api   (with Docker DB + Kafka)
 *   OR
 *   APP_ENV=dev pnpm dev:api (for lightweight tests)
 *
 * Output:
 *   - Console: coloured stats table per endpoint
 *   - File: loadtest-report-<timestamp>.json  (full autocannon JSON)
 *
 * Endpoints tested:
 *   GET  /api/v1/health              — no auth required
 *   GET  /api/v1/schema/tables       — requires JWT (skipped if no token)
 *   POST /api/v1/sql/execute         — requires JWT + DBA role
 *   POST /api/v1/connections/test    — no auth, tests connectivity
 */
import autocannon from 'autocannon';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const API_URL = process.env['API_URL'] ?? 'http://localhost:3100';
const DURATION = parseInt(process.env['LOADTEST_DURATION'] ?? '10', 10);
const CONNECTIONS = parseInt(process.env['LOADTEST_CONNECTIONS'] ?? '10', 10);
const JWT_TOKEN = process.env['LOADTEST_JWT'] ?? ''; // optional

// ── Colour helpers ────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function rpsColor(rps: number): string {
  if (rps >= 1000) return C.green;
  if (rps >= 200) return C.yellow;
  return C.red;
}
function latColor(ms: number): string {
  if (ms <= 10) return C.green;
  if (ms <= 50) return C.yellow;
  return C.red;
}
function errColor(pct: number): string {
  if (pct === 0) return C.green;
  if (pct < 1) return C.yellow;
  return C.red;
}

// ── Endpoint definitions ──────────────────────────────────────────────────────

interface EndpointDef {
  label: string;
  method: 'GET' | 'POST';
  path: string;
  body?: object;
  auth?: boolean;
  skip?: boolean;
}

const ENDPOINTS: EndpointDef[] = [
  {
    label: 'GET /health',
    method: 'GET',
    path: '/api/v1/health',
    auth: false,
  },
  {
    label: 'POST /connections/test (localhost PG)',
    method: 'POST',
    path: '/api/v1/connections/test',
    auth: false,
    body: {
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      username: 'postgres',
      password: 'postgres',
    },
  },
  {
    label: 'GET /schema/tables',
    method: 'GET',
    path: '/api/v1/schema/tables',
    auth: true,
    skip: !JWT_TOKEN,
  },
  {
    label: 'POST /sql/execute (SELECT 1)',
    method: 'POST',
    path: '/api/v1/sql/execute',
    auth: true,
    skip: !JWT_TOKEN,
    body: { sql: 'SELECT 1 AS alive' },
  },
  {
    label: 'GET /audit',
    method: 'GET',
    path: '/api/v1/audit?limit=10',
    auth: true,
    skip: !JWT_TOKEN,
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

interface BenchResult {
  label: string;
  rps_avg: number;
  rps_max: number;
  latency_p50: number;
  latency_p75: number;
  latency_p99: number;
  latency_max: number;
  errors: number;
  timeouts: number;
  requests: number;
  error_pct: number;
  skipped: boolean;
}

async function runEndpoint(ep: EndpointDef): Promise<BenchResult> {
  if (ep.skip) {
    console.log(`  ${C.dim}⊘  ${ep.label} — skipped (no JWT token)${C.reset}`);
    return {
      label: ep.label,
      rps_avg: 0,
      rps_max: 0,
      latency_p50: 0,
      latency_p75: 0,
      latency_p99: 0,
      latency_max: 0,
      errors: 0,
      timeouts: 0,
      requests: 0,
      error_pct: 0,
      skipped: true,
    };
  }

  console.log(`  ${C.cyan}▶ ${ep.label}${C.reset}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (ep.auth && JWT_TOKEN) {
    headers['Authorization'] = `Bearer ${JWT_TOKEN}`;
  }

  const opts: autocannon.Options = {
    url: `${API_URL}${ep.path}`,
    method: ep.method,
    headers,
    body: ep.body ? JSON.stringify(ep.body) : undefined,
    connections: CONNECTIONS,
    duration: DURATION,
    pipelining: 1,
    timeout: 10,
  };

  const result = await new Promise<autocannon.Result>((resolve, reject) => {
    const instance = autocannon(opts, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
    autocannon.track(instance, { renderProgressBar: false, renderResultsTable: false });
  });

  const totalReqs = result.requests.total;
  const errors = result.errors + result.timeouts;
  const errPct = totalReqs > 0 ? (errors / totalReqs) * 100 : 0;

  const r: BenchResult = {
    label: ep.label,
    rps_avg: result.requests.average,
    rps_max: result.requests.max,
    latency_p50: result.latency.p50,
    latency_p75: result.latency.p75,
    latency_p99: result.latency.p99,
    latency_max: result.latency.max,
    errors: result.errors,
    timeouts: result.timeouts,
    requests: totalReqs,
    error_pct: errPct,
    skipped: false,
  };

  // Print quick stats
  console.log(
    `     rps: ${rpsColor(r.rps_avg)}avg=${r.rps_avg.toFixed(0).padStart(6)}${C.reset}  ` +
      `p50=${latColor(r.latency_p50)}${r.latency_p50.toFixed(1).padStart(6)}ms${C.reset}  ` +
      `p99=${latColor(r.latency_p99)}${r.latency_p99.toFixed(1).padStart(6)}ms${C.reset}  ` +
      `errors=${errColor(errPct)}${errPct.toFixed(1)}%${C.reset}  ` +
      `total=${totalReqs.toLocaleString()} reqs`,
  );

  return r;
}

// ── Summary table ─────────────────────────────────────────────────────────────

function printSummary(results: BenchResult[]): number {
  console.log(
    `\n${C.bold}${C.magenta}╔══════════════════════════════════════════════════════════════════════════╗`,
  );
  console.log(`║                   LOAD TEST SUMMARY REPORT                            ║`);
  console.log(
    `╚══════════════════════════════════════════════════════════════════════════╝${C.reset}`,
  );
  console.log(
    `  ${C.dim}Target: ${API_URL}  |  Connections: ${CONNECTIONS}  |  Duration: ${DURATION}s per endpoint${C.reset}`,
  );
  console.log('');

  const COL = { label: 36, rps: 10, p50: 8, p75: 8, p99: 8, err: 8, reqs: 10 };
  const pad = (s: string, w: number) => s.slice(0, w).padEnd(w);
  const hr = Object.values(COL)
    .map((w) => '─'.repeat(w))
    .join('┼');

  console.log(
    C.bold +
      pad(' Endpoint', COL.label) +
      '│' +
      pad(' avg rps', COL.rps) +
      '│' +
      pad(' p50ms', COL.p50) +
      '│' +
      pad(' p75ms', COL.p75) +
      '│' +
      pad(' p99ms', COL.p99) +
      '│' +
      pad(' err%', COL.err) +
      '│' +
      pad(' requests', COL.reqs) +
      C.reset,
  );
  console.log(hr);

  for (const r of results) {
    if (r.skipped) {
      console.log(C.dim + pad(` ${r.label}`, COL.label) + '│  (skipped)' + C.reset);
      continue;
    }
    console.log(
      ` ${pad(r.label, COL.label - 1)}│` +
        `${rpsColor(r.rps_avg)}${r.rps_avg.toFixed(0).padStart(COL.rps - 1)} ${C.reset}│` +
        `${latColor(r.latency_p50)}${r.latency_p50.toFixed(1).padStart(COL.p50 - 1)} ${C.reset}│` +
        `${latColor(r.latency_p75)}${r.latency_p75.toFixed(1).padStart(COL.p75 - 1)} ${C.reset}│` +
        `${latColor(r.latency_p99)}${r.latency_p99.toFixed(1).padStart(COL.p99 - 1)} ${C.reset}│` +
        `${errColor(r.error_pct)}${r.error_pct.toFixed(1).padStart(COL.err - 1)} ${C.reset}│` +
        ` ${r.requests.toLocaleString()}`,
    );
  }

  // Thresholds check
  const failed = results.filter((r) => !r.skipped && (r.latency_p99 > 200 || r.error_pct > 1));
  if (failed.length === 0) {
    console.log(
      `\n  ${C.green}${C.bold}✓ All endpoints meet SLO (p99 ≤ 200ms, error% ≤ 1%)${C.reset}`,
    );
  } else {
    console.log(`\n  ${C.red}${C.bold}✗ SLO violations:${C.reset}`);
    for (const r of failed) {
      const reasons: string[] = [];
      if (r.latency_p99 > 200) reasons.push(`p99=${r.latency_p99.toFixed(0)}ms > 200ms`);
      if (r.error_pct > 1) reasons.push(`error%=${r.error_pct.toFixed(1)}% > 1%`);
      console.log(`    ${C.red}• ${r.label}: ${reasons.join(', ')}${C.reset}`);
    }
  }
  return failed.length;
}

// ── Save JSON report ──────────────────────────────────────────────────────────

function saveReport(results: BenchResult[]): void {
  const dir = join(process.cwd(), 'loadtest-reports');
  mkdirSync(dir, { recursive: true });
  const filename = `loadtest-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const path = join(dir, filename);
  const report = {
    generatedAt: new Date().toISOString(),
    config: { apiUrl: API_URL, connections: CONNECTIONS, durationPerEndpoint: DURATION },
    slo: { p99MaxMs: 200, maxErrorPct: 1 },
    results,
  };
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(`\n  ${C.dim}JSON report saved: ${path}${C.reset}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗`);
  console.log(`║    @tfsdc/api — autocannon Load Test                  ║`);
  console.log(`╚══════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`  Target:      ${API_URL}`);
  console.log(`  Connections: ${CONNECTIONS} concurrent`);
  console.log(`  Duration:    ${DURATION}s per endpoint`);
  if (!JWT_TOKEN) {
    console.log(`  ${C.yellow}⚠  No LOADTEST_JWT set — auth endpoints will be skipped${C.reset}`);
    console.log(
      `     To test all: export LOADTEST_JWT=$(curl -s -X POST ${API_URL}/api/v1/auth/login \\`,
    );
    console.log(`                   -H 'Content-Type: application/json' \\`);
    console.log(`                   -d '{"username":"admin","password":"admin"}' | jq -r .token)`);
  }
  console.log('');

  // Check API is reachable
  try {
    const ping = await fetch(`${API_URL}/api/v1/health`, { signal: AbortSignal.timeout(3000) });
    if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
    console.log(`  ${C.green}✓ API reachable${C.reset}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ${C.red}✗ API not reachable at ${API_URL}: ${msg}${C.reset}`);
    console.error(`    Start it with: pnpm dev:api`);
    process.exit(1);
  }

  const results: BenchResult[] = [];
  for (const ep of ENDPOINTS) {
    results.push(await runEndpoint(ep));
    console.log('');
  }

  const violations = printSummary(results);
  saveReport(results);
  if (violations > 0) {
    console.error(`\n[loadtest] ✗ ${violations} SLO violation(s) — exit 1`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
