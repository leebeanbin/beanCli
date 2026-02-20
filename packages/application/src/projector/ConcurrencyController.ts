import type { IMetricsProvider } from './ports/IProjectorDb.js';

export class ConcurrencyController {
  private currentBatchSize: number;

  private readonly maxBatchSize: number;
  private readonly minBatchSize: number;
  private readonly p95HardLimitMs: number;
  private readonly poolThrottlePct: number;

  constructor(
    private readonly metrics: IMetricsProvider,
    opts?: {
      initialBatchSize?: number;
      maxBatchSize?: number;
      minBatchSize?: number;
      p95HardLimitMs?: number;
      poolThrottlePct?: number;
    },
  ) {
    this.currentBatchSize = opts?.initialBatchSize ?? 100;
    this.maxBatchSize = opts?.maxBatchSize ?? 500;
    this.minBatchSize = opts?.minBatchSize ?? 10;
    this.p95HardLimitMs = opts?.p95HardLimitMs ?? 200;
    this.poolThrottlePct = opts?.poolThrottlePct ?? 80;
  }

  async getBatchSize(): Promise<number> {
    const [p95, poolUsage] = await Promise.all([
      this.metrics.getDbP95LatencyMs(),
      this.metrics.getConnectionPoolUsagePct(),
    ]);

    if (p95 >= this.p95HardLimitMs || poolUsage >= this.poolThrottlePct) {
      this.currentBatchSize = Math.max(
        this.minBatchSize,
        Math.floor(this.currentBatchSize / 2),
      );
    } else {
      this.currentBatchSize = Math.min(
        this.maxBatchSize,
        Math.floor(this.currentBatchSize * 1.1),
      );
    }

    return this.currentBatchSize;
  }

  getCurrentBatchSize(): number {
    return this.currentBatchSize;
  }
}
