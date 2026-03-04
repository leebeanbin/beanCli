/**
 * packages/infrastructure/src/bench/index.ts
 *
 * Standalone benchmark suite using tinybench.
 * Run: pnpm --filter @tfsdc/infrastructure bench
 *
 * Output: formatted table with ops/sec, avg, p50, p75, p99, min, max
 * for each benchmark.
 *
 * No external services required — all benchmarks are pure Node.js.
 */

import { Bench } from 'tinybench';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

// ── Colour helpers ────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function header(title: string): void {
  const bar = '═'.repeat(title.length + 4);
  console.log(`\n${C.cyan}${C.bold}╔${bar}╗${C.reset}`);
  console.log(`${C.cyan}${C.bold}║  ${title}  ║${C.reset}`);
  console.log(`${C.cyan}${C.bold}╚${bar}╝${C.reset}`);
}

function formatOps(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mops/s`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)} Kops/s`;
  return `${n.toFixed(2)} ops/s`;
}

function formatNs(ns: number | undefined): string {
  if (ns === undefined) return '  —  ';
  if (ns >= 1_000_000) return `${(ns / 1_000_000).toFixed(2)}ms`;
  if (ns >= 1_000) return `${(ns / 1_000).toFixed(2)}µs`;
  return `${ns.toFixed(2)}ns`;
}

/**
 * tinybench v6 changed the result shape:
 *   result.throughput.mean  → ops/s  (was result.hz)
 *   result.latency.*        → latency stats in ms  (was result.mean/p50/…)
 */
function safeHz(result: unknown): number {
  if (result && typeof result === 'object' && 'throughput' in result) {
    return (result as { throughput?: { mean?: number } }).throughput?.mean ?? 0;
  }
  return 0;
}

interface V6Result {
  throughput: { mean: number };
  latency: { mean: number; p50?: number; p75?: number; p99?: number; min: number; max: number };
}

function printTable(bench: Bench): void {
  const COL = {
    name: 44,
    ops: 14,
    avg: 10,
    p50: 10,
    p75: 10,
    p99: 10,
    min: 10,
    max: 10,
  };
  const row = (
    name: string,
    ops: string,
    avg: string,
    p50: string,
    p75: string,
    p99: string,
    min: string,
    max: string,
    isHeader = false,
  ) => {
    const pad = (s: string, w: number) => s.slice(0, w).padEnd(w);
    const line =
      `${pad(name, COL.name)}│${pad(ops, COL.ops)}│${pad(avg, COL.avg)}│` +
      `${pad(p50, COL.p50)}│${pad(p75, COL.p75)}│${pad(p99, COL.p99)}│` +
      `${pad(min, COL.min)}│${pad(max, COL.max)}`;
    if (isHeader) {
      const sep = Object.values(COL)
        .map((w) => '─'.repeat(w))
        .join('┼');
      console.log(`${C.bold}${line}${C.reset}`);
      console.log(sep);
    } else {
      console.log(line);
    }
  };

  row(' Benchmark', ' ops/s', ' avg', ' p50', ' p75', ' p99', ' min', ' max', true);

  const sorted = [...bench.tasks].sort((a, b) => safeHz(b.result) - safeHz(a.result));

  for (const t of sorted) {
    const r = t.result;
    // tinybench v6: completed tasks have throughput + latency nested objects
    if (!r || !('throughput' in r) || !('latency' in r)) {
      console.log(` ${t.name}  — (no result)`);
      continue;
    }
    const nr = r as unknown as V6Result;
    const opsColor =
      nr.throughput.mean >= 1_000_000 ? C.green : nr.throughput.mean >= 100_000 ? C.yellow : C.red;
    console.log(
      ` ${t.name.slice(0, COL.name - 2).padEnd(COL.name - 1)}│` +
        `${opsColor}${formatOps(nr.throughput.mean).padEnd(COL.ops - 1)}${C.reset}│` +
        `${formatNs(nr.latency.mean * 1e6).padEnd(COL.avg)}│` +
        `${formatNs(nr.latency.p50 !== undefined ? nr.latency.p50 * 1e6 : undefined).padEnd(COL.p50)}│` +
        `${formatNs(nr.latency.p75 !== undefined ? nr.latency.p75 * 1e6 : undefined).padEnd(COL.p75)}│` +
        `${formatNs(nr.latency.p99 !== undefined ? nr.latency.p99 * 1e6 : undefined).padEnd(COL.p99)}│` +
        `${formatNs(nr.latency.min * 1e6).padEnd(COL.min)}│` +
        `${formatNs(nr.latency.max * 1e6).padEnd(COL.max)}`,
    );
  }
}

// ── Shared key material ───────────────────────────────────────────────────────
const AES_KEY = randomBytes(32); // AES-256
const HMAC_KEY = randomBytes(32); // HMAC-SHA256
const IV_FIXED = randomBytes(16); // fixed IV for decrypt bench

const PAYLOADS: Record<string, Buffer> = {
  '16B': Buffer.alloc(16, 0xab),
  '128B': Buffer.alloc(128, 0xcd),
  '1KB': Buffer.alloc(1024, 0xef),
  '8KB': Buffer.alloc(8192, 0x12),
};

// Pre-compute a ciphertext for the decrypt bench
function encryptSync(plain: Buffer): Buffer {
  const iv = randomBytes(16);
  const c = createCipheriv('aes-256-gcm', AES_KEY, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

// ── Benchmark suites ─────────────────────────────────────────────────────────

async function runAesBench(): Promise<void> {
  header('AES-256-GCM — encrypt / decrypt');

  const bench = new Bench({ time: 2000, warmupTime: 500, warmupIterations: 100 });

  for (const [label, plain] of Object.entries(PAYLOADS)) {
    const ct = encryptSync(plain);

    bench.add(`encrypt ${label}`, () => {
      const iv = IV_FIXED;
      const c = createCipheriv('aes-256-gcm', AES_KEY, iv);
      Buffer.concat([c.update(plain), c.final()]);
      c.getAuthTag();
    });

    bench.add(`decrypt ${label}`, () => {
      const iv = ct.subarray(0, 16);
      const tag = ct.subarray(16, 32);
      const enc = ct.subarray(32);
      const d = createDecipheriv('aes-256-gcm', AES_KEY, iv);
      d.setAuthTag(tag);
      Buffer.concat([d.update(enc), d.final()]);
    });
  }

  await bench.run();
  printTable(bench);

  // Summary
  const enc1k = safeHz(bench.tasks.find((t) => t.name === 'encrypt 1KB')?.result);
  const dec1k = safeHz(bench.tasks.find((t) => t.name === 'decrypt 1KB')?.result);
  console.log(
    `\n  ${C.dim}encrypt 1KB: ${formatOps(enc1k)} | decrypt 1KB: ${formatOps(dec1k)}${C.reset}`,
  );
}

async function runHmacBench(): Promise<void> {
  header('HMAC-SHA256 — hash throughput');

  const bench = new Bench({ time: 2000, warmupTime: 500, warmupIterations: 100 });

  const cases: [string, string, string][] = [
    ['user', 'usr-000001', 'short ID'],
    ['order', 'ord-12345678-abcd-1234-ef00-123456789012', 'UUID'],
    ['product', 'sku-' + 'X'.repeat(60), '64B key'],
  ];

  for (const [entity, id, label] of cases) {
    bench.add(`hash ${label}`, () => {
      createHmac('sha256', HMAC_KEY).update(`${entity}:${id}`).digest('hex');
    });
  }

  bench.add('hash + hex decode (full pipeline)', () => {
    const hex = createHmac('sha256', HMAC_KEY).update('user:usr-001').digest('hex');
    Buffer.from(hex, 'hex');
  });

  await bench.run();
  printTable(bench);
}

async function runRegexBench(): Promise<void> {
  header('Regex validation — SEC-001/LIMIT/FROM parsing');

  const bench = new Bench({ time: 1500, warmupTime: 300, warmupIterations: 500 });

  const DB_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_$-]{0,63}$/;
  const LIMIT_RE = /LIMIT\s+(\d+)/i;
  const FROM_RE = /FROM\s+(\w+)/i;

  const validNames = ['tfsdc', 'my_db', 'prod-db', 'analytics$v2'];
  const invalidNames = ["'; DROP TABLE--", 'a'.repeat(65), '123bad'];
  const limitSqls = [
    'SELECT * FROM users LIMIT 100',
    'SELECT * FROM orders',
    'SELECT * FROM events LIMIT 50 OFFSET 0',
  ];

  bench.add('DB name validate — valid', () => {
    for (const n of validNames) DB_NAME_RE.test(n);
  });

  bench.add('DB name validate — invalid (injection attempt)', () => {
    for (const n of invalidNames) DB_NAME_RE.test(n);
  });

  bench.add('LIMIT clause parse', () => {
    for (const sql of limitSqls) LIMIT_RE.exec(sql);
  });

  bench.add('FROM clause extract', () => {
    for (const sql of limitSqls) FROM_RE.exec(sql);
  });

  bench.add('full query triage (LIMIT + FROM)', () => {
    const sql = 'SELECT * FROM state_users WHERE active = 1 LIMIT 200';
    const f = FROM_RE.exec(sql);
    const l = LIMIT_RE.exec(sql);
    const limit = l ? parseInt(l[1]!, 10) : 500;
    return { table: f?.[1], limit };
  });

  await bench.run();
  printTable(bench);
}

// ── Redis pipeline simulation ─────────────────────────────────────────────────

/** Simulates a single Redis RTT using setImmediate (zero-sleep yield) */
function fakeRtt(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function naiveNPlusOne(keys: string[]): Promise<void> {
  for (const _k of keys) {
    await fakeRtt(); // TYPE round-trip
    await fakeRtt(); // GET  round-trip
  }
}

async function twoPipelineBatch(keys: string[]): Promise<void> {
  await fakeRtt(); // Pipeline 1: all TYPE commands
  await fakeRtt(); // Pipeline 2: all GET/HGETALL commands
  void keys;
}

async function runRedisBench(): Promise<void> {
  header('Redis query strategy — two-pipeline batch vs naïve N+1');

  const KEY_COUNTS = [5, 10, 20, 50, 100];

  const bench = new Bench({ time: 1500, warmupTime: 300, warmupIterations: 20 });

  for (const n of KEY_COUNTS) {
    const keys = Array.from({ length: n }, (_, i) => `key:${i}`);
    bench.add(`naïve N+1    (${String(n).padStart(3)} keys)`, () => naiveNPlusOne(keys));
    bench.add(`two-pipeline (${String(n).padStart(3)} keys)`, () => twoPipelineBatch(keys));
  }

  await bench.run();

  // Custom table showing speedup
  console.log(`\n  ${C.bold}Keys   Naïve ops/s    Pipeline ops/s  Speedup${C.reset}`);
  console.log('  ' + '─'.repeat(54));
  for (const n of KEY_COUNTS) {
    const naiveTask = bench.tasks.find((t) =>
      t.name.includes(`naïve N+1    (${String(n).padStart(3)}`),
    );
    const pipeTask = bench.tasks.find((t) =>
      t.name.includes(`two-pipeline (${String(n).padStart(3)}`),
    );
    const naiveHz = safeHz(naiveTask?.result);
    const pipeHz = safeHz(pipeTask?.result);
    const speedup = pipeHz / naiveHz;
    const speedColor = speedup >= 20 ? C.green : speedup >= 5 ? C.yellow : C.red;
    console.log(
      `  ${String(n).padStart(3)}    ` +
        `${formatOps(naiveHz).padEnd(15)} ` +
        `${formatOps(pipeHz).padEnd(16)} ` +
        `${speedColor}${speedup.toFixed(1)}×${C.reset}`,
    );
  }
}

// ── Compare AES vs HMAC ───────────────────────────────────────────────────────

async function runCryptoCompare(): Promise<void> {
  header('AES-256-GCM vs HMAC-SHA256 — relative cost');

  const bench = new Bench({ time: 2000, warmupTime: 500 });
  const plain = Buffer.alloc(256, 0xff);
  const ct = encryptSync(plain);

  bench.add('AES-256-GCM encrypt 256B', () => {
    const c = createCipheriv('aes-256-gcm', AES_KEY, IV_FIXED);
    Buffer.concat([c.update(plain), c.final()]);
    c.getAuthTag();
  });

  bench.add('AES-256-GCM decrypt 256B', () => {
    const iv = ct.subarray(0, 16);
    const tag = ct.subarray(16, 32);
    const enc = ct.subarray(32);
    const d = createDecipheriv('aes-256-gcm', AES_KEY, iv);
    d.setAuthTag(tag);
    Buffer.concat([d.update(enc), d.final()]);
  });

  bench.add('HMAC-SHA256 short ID', () => {
    createHmac('sha256', HMAC_KEY).update('user:usr-001').digest('hex');
  });

  bench.add('HMAC-SHA256 UUID', () => {
    createHmac('sha256', HMAC_KEY)
      .update('order:ord-12345678-abcd-1234-ef00-123456789012')
      .digest('hex');
  });

  await bench.run();
  printTable(bench);

  const aesHz = safeHz(bench.tasks.find((t) => t.name.includes('encrypt 256B'))?.result) || 1;
  const hmacHz = safeHz(bench.tasks.find((t) => t.name.includes('short ID'))?.result) || 1;
  console.log(
    `\n  ${C.dim}HMAC is ${(hmacHz / aesHz).toFixed(1)}× faster than AES-256-GCM (256B)${C.reset}`,
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${C.bold}${C.magenta}╔══════════════════════════════════════════════════════╗`);
  console.log(`║    @tfsdc/infrastructure — Performance Benchmark       ║`);
  console.log(`║    Engine: tinybench  |  Node ${process.version.padEnd(8)}           ║`);
  console.log(`╚══════════════════════════════════════════════════════╝${C.reset}`);
  console.log(
    `  ${C.dim}Platform: ${process.platform}  Arch: ${process.arch}  CPU cores: ${(await import('node:os')).cpus().length}${C.reset}`,
  );

  await runAesBench();
  await runHmacBench();
  await runRegexBench();
  await runRedisBench();
  await runCryptoCompare();

  console.log(`\n${C.green}${C.bold}✓ All benchmarks complete.${C.reset}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
