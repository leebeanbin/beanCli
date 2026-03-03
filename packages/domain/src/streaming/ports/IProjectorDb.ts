import type { DbTransaction } from '../handlers/IEventHandler.js';

export interface IProjectorDb {
  transaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T>;
}

export interface IMetricsProvider {
  getDbP95LatencyMs(): Promise<number>;
  getConnectionPoolUsagePct(): Promise<number>;
}
