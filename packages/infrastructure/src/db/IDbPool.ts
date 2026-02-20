export interface IDbQueryResult {
  rowCount: number | null;
  rows: Record<string, unknown>[];
}

export interface IDbTransaction {
  query(sql: string, params?: unknown[]): Promise<IDbQueryResult>;
}

export interface IDbPool {
  query(sql: string, params?: unknown[]): Promise<IDbQueryResult>;
  transaction<T>(fn: (tx: IDbTransaction) => Promise<T>): Promise<T>;
}

export interface IMetricsProvider {
  getDbP95LatencyMs(): Promise<number>;
  getConnectionPoolUsagePct(): Promise<number>;
}
