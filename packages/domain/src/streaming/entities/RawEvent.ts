export interface RawEvent {
  readonly sourceTopic: string;
  readonly partition: number;
  readonly offset: number;
  readonly eventTimeMs: number;
  readonly entityType: string;
  readonly canonicalId: string;
  readonly payload: Record<string, unknown>;
}
