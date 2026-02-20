import { ConcurrencyController } from './ConcurrencyController.js';
import type { IMetricsProvider } from './ports/IProjectorDb.js';

describe('ConcurrencyController', () => {
  const createMockMetrics = (p95: number, poolPct: number): IMetricsProvider => ({
    getDbP95LatencyMs: jest.fn().mockResolvedValue(p95),
    getConnectionPoolUsagePct: jest.fn().mockResolvedValue(poolPct),
  });

  it('should decrease batch size when p95 latency exceeds limit', async () => {
    const metrics = createMockMetrics(250, 50);
    const controller = new ConcurrencyController(metrics, { initialBatchSize: 100 });

    const size = await controller.getBatchSize();
    expect(size).toBe(50); // halved from 100
  });

  it('should decrease batch size when pool usage exceeds threshold', async () => {
    const metrics = createMockMetrics(100, 85);
    const controller = new ConcurrencyController(metrics, { initialBatchSize: 200 });

    const size = await controller.getBatchSize();
    expect(size).toBe(100); // halved from 200
  });

  it('should increase batch size when metrics are healthy', async () => {
    const metrics = createMockMetrics(50, 40);
    const controller = new ConcurrencyController(metrics, { initialBatchSize: 100 });

    const size = await controller.getBatchSize();
    expect(size).toBe(110); // floor(100 * 1.1)
  });

  it('should respect minBatchSize', async () => {
    const metrics = createMockMetrics(300, 90);
    const controller = new ConcurrencyController(metrics, {
      initialBatchSize: 15,
      minBatchSize: 10,
    });

    const size = await controller.getBatchSize();
    expect(size).toBe(10);
  });

  it('should respect maxBatchSize', async () => {
    const metrics = createMockMetrics(10, 10);
    const controller = new ConcurrencyController(metrics, {
      initialBatchSize: 480,
      maxBatchSize: 500,
    });

    const size = await controller.getBatchSize();
    expect(size).toBe(500); // min(500, floor(480*1.1)=528) => 500
  });

  it('getCurrentBatchSize returns current value', () => {
    const metrics = createMockMetrics(10, 10);
    const controller = new ConcurrencyController(metrics, { initialBatchSize: 123 });

    expect(controller.getCurrentBatchSize()).toBe(123);
  });
});
