/**
 * redis-pipeline.bench.test.ts
 *
 * Simulates the performance difference between:
 *   A) Naïve N+1 approach — N sequential round-trips for N keys
 *   B) Two-pipeline batch — 2 round-trips regardless of N
 *
 * No real Redis required: we mock the client to add realistic latencies.
 *
 * Benchmarks also cover the SQL LIMIT-parse logic in MongoAdapter pattern.
 */

// ── RTT simulation helpers ─────────────────────────────────────────────────────

/** Simulates a single Redis round-trip with configurable network latency */
const RTT_MS = 0.5; // 0.5ms — localhost Redis typical RTT
function fakeRtt(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve)); // zero-sleep, just yield
}

// For latency-aware simulation we add a tiny delay per RTT
function fakeRttWithLatency(ms: number): Promise<void> {
  if (ms <= 0) return fakeRtt();
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Approach A: Naïve N+1 (sequential per-key round-trips) ───────────────────

async function naiveNPlusOne(keys: string[], latencyMs: number): Promise<Record<string, string>[]> {
  const results: Record<string, string>[] = [];
  for (const key of keys) {
    await fakeRttWithLatency(latencyMs); // TYPE round-trip
    const type = 'string';               // assume string for simulation
    await fakeRttWithLatency(latencyMs); // GET round-trip
    results.push({ key, type, value: `v_${key}` });
  }
  return results;
}

// ── Approach B: Two-pipeline batch (2 RTTs total) ────────────────────────────

async function twoPipelineBatch(keys: string[], latencyMs: number): Promise<Record<string, string>[]> {
  // Pipeline 1: all TYPE commands in one RTT
  await fakeRttWithLatency(latencyMs);
  const types = keys.map(() => 'string');

  // Pipeline 2: all GET/HGETALL/etc. commands in one RTT
  await fakeRttWithLatency(latencyMs);
  const values = keys.map(k => `v_${k}`);

  return keys.map((key, i) => ({ key, type: types[i]!, value: values[i]! }));
}

// ── Benchmark runner ──────────────────────────────────────────────────────────

async function measureMs(fn: () => Promise<unknown>): Promise<number> {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

async function compareApproaches(
  keyCount:  number,
  latencyMs: number,
  iters:     number,
): Promise<{ naiveMs: number; pipelineMs: number; speedup: number }> {
  // warm-up
  for (let i = 0; i < 3; i++) {
    await naiveNPlusOne(['k1', 'k2'], 0);
    await twoPipelineBatch(['k1', 'k2'], 0);
  }

  const keys = Array.from({ length: keyCount }, (_, i) => `key:${i}`);

  // Naive average
  let naiveTotal = 0;
  for (let i = 0; i < iters; i++) {
    naiveTotal += await measureMs(() => naiveNPlusOne(keys, latencyMs));
  }

  // Pipeline average
  let pipeTotal = 0;
  for (let i = 0; i < iters; i++) {
    pipeTotal += await measureMs(() => twoPipelineBatch(keys, latencyMs));
  }

  const naiveMs    = naiveTotal / iters;
  const pipelineMs = pipeTotal  / iters;
  const speedup    = naiveMs / pipelineMs;

  console.log(
    `  [BENCH] ${keyCount.toString().padStart(3)} keys @ ${latencyMs.toFixed(1)}ms RTT | ` +
    `naive=${naiveMs.toFixed(2).padStart(7)}ms  pipeline=${pipelineMs.toFixed(2).padStart(6)}ms  ` +
    `speedup=${speedup.toFixed(1).padStart(5)}×`,
  );

  return { naiveMs, pipelineMs, speedup };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Redis: two-pipeline batch vs naïve N+1', () => {
  // Realistic scenario: 0.5ms RTT (localhost), 30 keys
  it('30 keys @ 0.5ms RTT — pipeline wins decisively', async () => {
    const { speedup, pipelineMs } = await compareApproaches(30, RTT_MS, 20);
    // Pipeline uses 2 RTTs; naïve uses 60 RTTs → expect ≥10× speedup
    expect(speedup).toBeGreaterThan(5);
    // Pipeline completes in ~1ms (2 × 0.5ms RTT)
    expect(pipelineMs).toBeLessThan(50); // generous bound for CI jitter
  }, 10_000);

  it('10 keys @ 0ms RTT (no network) — setImmediate yield overhead', async () => {
    const { speedup } = await compareApproaches(10, 0, 50);
    // Even at zero latency, pipeline is faster (2 yields vs 20 yields)
    expect(speedup).toBeGreaterThan(1);
  }, 10_000);

  it('100 keys @ 1ms RTT — larger dataset', async () => {
    const { speedup, naiveMs, pipelineMs } = await compareApproaches(100, 1, 10);
    // Naïve: 200 RTTs × 1ms = ~200ms
    // Pipeline: 2 RTTs × 1ms = ~2ms → ≥30× speedup
    expect(speedup).toBeGreaterThan(20);
    console.log(`  [INFO]   saved ~${(naiveMs - pipelineMs).toFixed(0)}ms per query with pipeline`);
  }, 30_000);

  it('RTT sensitivity table (5/10/20/50 keys)', async () => {
    const keyCounts = [5, 10, 20, 50];
    console.log('\n  [TABLE] key count → speedup (0.5ms RTT):');
    for (const n of keyCounts) {
      const { speedup } = await compareApproaches(n, RTT_MS, 10);
      // Speedup should scale roughly linearly with key count
      expect(speedup).toBeGreaterThan(1);
    }
  }, 30_000);

  it('worst-case: 100 keys, 2ms RTT (WAN-like)', async () => {
    const { naiveMs, pipelineMs, speedup } = await compareApproaches(100, 2, 5);
    console.log(`  [WARN]  WAN scenario: naive=${naiveMs.toFixed(0)}ms → pipeline=${pipelineMs.toFixed(0)}ms`);
    expect(speedup).toBeGreaterThan(30);
  }, 60_000);
});

// ── LIMIT parsing benchmark (MongoAdapter pattern) ───────────────────────────

describe('SQL LIMIT parsing — MongoAdapter regex performance', () => {
  const ITERS = 100_000;

  const queries = [
    { sql: 'SELECT * FROM users LIMIT 100',    expected: 100  },
    { sql: 'SELECT * FROM orders',              expected: 500  },  // default
    { sql: 'select * from products limit 1000', expected: 1000 },
    { sql: 'SELECT * FROM events LIMIT 50 OFFSET 0', expected: 50 },
  ];

  function parseLimit(sql: string): number {
    const m = /LIMIT\s+(\d+)/i.exec(sql);
    return m ? parseInt(m[1]!, 10) : 500;
  }

  it('parses LIMIT correctly', () => {
    for (const { sql, expected } of queries) {
      expect(parseLimit(sql)).toBe(expected);
    }
  });

  it(`regex throughput: ${ITERS.toLocaleString()} parses`, () => {
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      for (const { sql } of queries) parseLimit(sql);
    }
    const totalMs = performance.now() - t0;
    const totalOps = ITERS * queries.length;
    const opsPerSec = Math.round(totalOps / (totalMs / 1000));
    console.log(
      `  [BENCH] LIMIT regex parse: ${opsPerSec.toLocaleString().padStart(12)} ops/s  ` +
      `(${totalMs.toFixed(1)}ms for ${totalOps.toLocaleString()} parses)`,
    );
    // Must be well above 1M ops/s (regex is trivial)
    expect(opsPerSec).toBeGreaterThan(1_000_000);
  });

  it('FROM clause extraction throughput', () => {
    const sql = 'SELECT * FROM state_users WHERE id > 100 LIMIT 200';
    const ITERS2 = 200_000;

    const t0 = performance.now();
    for (let i = 0; i < ITERS2; i++) {
      /FROM\s+(\w+)/i.exec(sql);
    }
    const ms      = performance.now() - t0;
    const opsPerSec = Math.round(ITERS2 / (ms / 1000));
    console.log(`  [BENCH] FROM regex extract: ${opsPerSec.toLocaleString().padStart(12)} ops/s`);
    expect(opsPerSec).toBeGreaterThan(5_000_000);
  });
});

// ── DB name validation benchmark (SEC-001 regex) ─────────────────────────────

describe('DB name allowlist regex — SEC-001 performance', () => {
  const VALID_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_$-]{0,63}$/;
  const ITERS = 200_000;

  const validNames   = ['tfsdc', 'my_db', 'prod-db', 'db$v2', 'a_very_long_database_name_here'];
  const invalidNames = ["'; DROP TABLE users; --", '../etc/passwd', 'a'.repeat(65), '123invalid'];

  it('correctly validates names', () => {
    for (const n of validNames)   expect(VALID_NAME_RE.test(n)).toBe(true);
    for (const n of invalidNames) expect(VALID_NAME_RE.test(n)).toBe(false);
  });

  it(`validation throughput: ${ITERS.toLocaleString()} checks`, () => {
    const allNames = [...validNames, ...invalidNames];
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      for (const n of allNames) VALID_NAME_RE.test(n);
    }
    const ms      = performance.now() - t0;
    const totalOps = ITERS * allNames.length;
    const opsPerSec = Math.round(totalOps / (ms / 1000));
    console.log(`  [BENCH] DB name validate:   ${opsPerSec.toLocaleString().padStart(12)} ops/s`);
    expect(opsPerSec).toBeGreaterThan(5_000_000);
  });
});
