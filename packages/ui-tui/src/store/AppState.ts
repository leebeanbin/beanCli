import type { UserRole, StreamMode } from '@tfsdc/kernel';

export interface StreamStats {
  entityType: string;
  eventsPerMinute: number;
  lastEventAt: number;
  dlqCount: number;
}

const ROLLING_WINDOW_MS = 60_000;

export class AppState {
  private _currentScene = 'explore';
  private _role: UserRole = 'ANALYST';
  private _streamMode: StreamMode = 'LIVE';
  private _overloadWarning: string | null = null;
  private _streamStats = new Map<string, StreamStats>();
  private _eventTimestamps = new Map<string, number[]>();
  private _wsConnected = false;

  get currentScene(): string { return this._currentScene; }
  get role(): UserRole { return this._role; }
  get streamMode(): StreamMode { return this._streamMode; }
  get overloadWarning(): string | null { return this._overloadWarning; }
  get wsConnected(): boolean { return this._wsConnected; }

  setWsConnected(v: boolean): void { this._wsConnected = v; }

  setScene(scene: string): void { this._currentScene = scene; }
  setRole(role: UserRole): void { this._role = role; }

  toggleStreamMode(): void {
    this._streamMode = this._streamMode === 'LIVE' ? 'PAUSED' : 'LIVE';
  }

  setOverloadWarning(reason: string | null): void {
    this._overloadWarning = reason;
  }

  updateStreamStats(entityType: string, count: number): void {
    const now = Date.now();
    const cutoff = now - ROLLING_WINDOW_MS;

    // Record new event timestamps and prune those older than 60 s
    const timestamps = this._eventTimestamps.get(entityType) ?? [];
    for (let i = 0; i < count; i++) timestamps.push(now);
    const fresh = timestamps.filter(t => t >= cutoff);
    this._eventTimestamps.set(entityType, fresh);

    const existing = this._streamStats.get(entityType);
    this._streamStats.set(entityType, {
      entityType,
      eventsPerMinute: fresh.length, // events seen in the last 60 s
      lastEventAt: now,
      dlqCount: existing?.dlqCount ?? 0,
    });
  }

  getStreamStats(): StreamStats[] {
    return Array.from(this._streamStats.values());
  }
}
