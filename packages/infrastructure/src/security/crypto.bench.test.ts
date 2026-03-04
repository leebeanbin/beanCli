/**
 * crypto.bench.test.ts
 *
 * Pure-JS performance benchmarks for AesEncryptor and HmacHasher.
 * No external services required.
 *
 * Metrics collected per operation:
 *   - ops/s (operations per second)
 *   - avg latency (µs)
 *   - p99 latency (µs)
 */
import { AesEncryptor } from './AesEncryptor.js';
import { HmacHasher } from './HmacHasher.js';
import type { IKeyStore, HmacKey } from '@tfsdc/domain';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeKeyStore(keyValue: string): IKeyStore {
  const key: HmacKey = {
    keyId: 'bench-key-001',
    value: Buffer.from(keyValue.padEnd(32, '0').slice(0, 32)),
  };
  return {
    getActiveKey: jest.fn().mockResolvedValue(key),
    getKeyById: jest.fn().mockResolvedValue(key),
    getActiveKeyId: jest.fn().mockResolvedValue(key.keyId),
  };
}

async function runBench(
  label: string,
  iterations: number,
  fn: () => Promise<void>,
): Promise<{ opsPerSec: number; avgUs: number; p99Us: number }> {
  const latencies: number[] = [];

  // Warm-up (10% of iterations, min 10)
  const warmup = Math.max(10, Math.floor(iterations * 0.1));
  for (let i = 0; i < warmup; i++) await fn();

  // Measured runs
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    latencies.push((performance.now() - t0) * 1000); // → µs
  }

  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((a, b) => a + b, 0);
  const avgUs = sum / latencies.length;
  const p99Us = latencies[Math.floor(latencies.length * 0.99)] ?? avgUs;
  const opsPerSec = Math.round(1_000_000 / avgUs);

  console.log(
    `  [BENCH] ${label.padEnd(42)} ` +
      `ops/s=${opsPerSec.toLocaleString().padStart(9)}  ` +
      `avg=${avgUs.toFixed(1).padStart(7)}µs  ` +
      `p99=${p99Us.toFixed(1).padStart(8)}µs`,
  );

  return { opsPerSec, avgUs, p99Us };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AesEncryptor — throughput benchmarks', () => {
  const ks = makeKeyStore('bench-secret-key-for-aes256gcm');
  const encryptor = new AesEncryptor(ks);
  const ITERS = 500;

  const payloads: Record<string, Buffer> = {
    '16B  (UUID-sized)': Buffer.alloc(16, 'x'),
    '128B (short row)': Buffer.alloc(128, 'a'),
    '1KB  (typical row)': Buffer.alloc(1024, 'b'),
    '8KB  (JSON payload)': Buffer.alloc(8192, 'c'),
  };

  for (const [label, plain] of Object.entries(payloads)) {
    it(`encrypt: ${label}`, async () => {
      const { opsPerSec, p99Us } = await runBench(`AES-256-GCM encrypt ${label}`, ITERS, () =>
        encryptor.encrypt(plain, 'bench-key-001').then(() => undefined),
      );
      // Minimum bar: AES-256-GCM should be well above 1k ops/s even on CI
      expect(opsPerSec).toBeGreaterThan(1_000);
      // p99 should not stall beyond 50ms (50_000µs) even for 8KB
      expect(p99Us).toBeLessThan(50_000);
    });
  }

  it('encrypt + decrypt round-trip: 1KB payload', async () => {
    const plain = Buffer.alloc(1024, 'r');
    let encrypted: Awaited<ReturnType<typeof encryptor.encrypt>>;

    // pre-encrypt once so decrypt bench measures ONLY decrypt
    encrypted = await encryptor.encrypt(plain, 'bench-key-001');

    const encStats = await runBench('AES-256-GCM encrypt 1KB', ITERS, () =>
      encryptor.encrypt(plain, 'bench-key-001').then((r) => {
        encrypted = r;
      }),
    );

    const decStats = await runBench('AES-256-GCM decrypt 1KB', ITERS, () =>
      encryptor.decrypt(encrypted.ciphertext, 'bench-key-001').then(() => undefined),
    );

    // Decrypt should not be substantially slower than encrypt
    expect(decStats.avgUs).toBeLessThan(encStats.avgUs * 3);
    expect(encStats.opsPerSec).toBeGreaterThan(1_000);
    expect(decStats.opsPerSec).toBeGreaterThan(1_000);
  });

  it('throughput: concurrent 10 encryptions', async () => {
    const plain = Buffer.alloc(512, 'c');
    const BATCH = 10;
    const ITERS_CONC = 200;

    const { opsPerSec } = await runBench(
      `AES-256-GCM concurrent×${BATCH} encrypt 512B`,
      ITERS_CONC,
      () =>
        Promise.all(
          Array.from({ length: BATCH }, () => encryptor.encrypt(plain, 'bench-key-001')),
        ).then(() => undefined),
    );

    // Each concurrent batch counts as 1 op; total throughput = opsPerSec × BATCH
    const totalOpsPerSec = opsPerSec * BATCH;
    console.log(
      `  [INFO]   total concurrent throughput: ${totalOpsPerSec.toLocaleString()} encrypt-ops/s`,
    );
    expect(totalOpsPerSec).toBeGreaterThan(5_000);
  });
});

describe('HmacHasher — throughput benchmarks', () => {
  const ks = makeKeyStore('bench-hmac-sha256-secret-key00');
  const hasher = new HmacHasher(ks);
  const ITERS = 1_000;

  const cases: [string, string, string][] = [
    ['user', 'usr-000001', 'short ID'],
    ['order', 'ord-12345678-abcd-1234-ef00-123456789012', 'UUID'],
    ['product', 'sku-' + 'X'.repeat(60), 'long ID (64B)'],
  ];

  for (const [entityType, rawId, label] of cases) {
    it(`hash: ${label}`, async () => {
      const { opsPerSec, p99Us } = await runBench(`HMAC-SHA256 hash ${label}`, ITERS, () =>
        hasher.hash(entityType, rawId).then(() => undefined),
      );
      // HMAC-SHA256 should be very fast — well above 10k ops/s
      expect(opsPerSec).toBeGreaterThan(10_000);
      expect(p99Us).toBeLessThan(5_000);
    });
  }

  it('throughput: concurrent 50 hashes', async () => {
    const BATCH = 50;
    const ITERS_CONC = 200;

    const { opsPerSec } = await runBench(`HMAC-SHA256 concurrent×${BATCH}`, ITERS_CONC, () =>
      Promise.all(Array.from({ length: BATCH }, (_, i) => hasher.hash('user', `usr-${i}`))).then(
        () => undefined,
      ),
    );

    const totalOpsPerSec = opsPerSec * BATCH;
    console.log(
      `  [INFO]   total concurrent throughput: ${totalOpsPerSec.toLocaleString()} hash-ops/s`,
    );
    expect(totalOpsPerSec).toBeGreaterThan(100_000);
  });

  it('AES vs HMAC relative performance', async () => {
    const ksA = makeKeyStore('aes-vs-hmac-benchmark-key-0000');
    const encryptor2 = new AesEncryptor(ksA);
    const plain = Buffer.alloc(256, 'p');
    const ITERS_CMP = 500;

    const aesStats = await runBench('AES-256-GCM 256B (comparison)', ITERS_CMP, () =>
      encryptor2.encrypt(plain, 'bench-key-001').then(() => undefined),
    );
    const hmacStats = await runBench('HMAC-SHA256 (comparison)', ITERS_CMP, () =>
      hasher.hash('entity', 'some-id').then(() => undefined),
    );

    const speedup = hmacStats.opsPerSec / aesStats.opsPerSec;
    console.log(
      `  [INFO]   HMAC is ${speedup.toFixed(1)}× faster than AES-256-GCM (256B plaintext)`,
    );
    // HMAC should be faster than AES — if not, something's wrong
    expect(hmacStats.opsPerSec).toBeGreaterThan(aesStats.opsPerSec);
  });
});
