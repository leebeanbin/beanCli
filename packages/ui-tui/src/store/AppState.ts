import type { UserRole, StreamMode } from '@tfsdc/kernel';

export interface StreamStats {
  entityType: string;
  eventsPerMinute: number;
  lastEventAt: number;
  dlqCount: number;
}

export class AppState {
  private _currentScene = 'explore';
  private _role: UserRole = 'ANALYST';
  private _streamMode: StreamMode = 'LIVE';
  private _overloadWarning: string | null = null;
  private _streamStats = new Map<string, StreamStats>();

  get currentScene(): string { return this._currentScene; }
  get role(): UserRole { return this._role; }
  get streamMode(): StreamMode { return this._streamMode; }
  get overloadWarning(): string | null { return this._overloadWarning; }

  setScene(scene: string): void { this._currentScene = scene; }
  setRole(role: UserRole): void { this._role = role; }

  toggleStreamMode(): void {
    this._streamMode = this._streamMode === 'LIVE' ? 'PAUSED' : 'LIVE';
  }

  setOverloadWarning(reason: string | null): void {
    this._overloadWarning = reason;
  }

  updateStreamStats(entityType: string, count: number): void {
    const existing = this._streamStats.get(entityType);
    this._streamStats.set(entityType, {
      entityType,
      eventsPerMinute: (existing?.eventsPerMinute ?? 0) + count,
      lastEventAt: Date.now(),
      dlqCount: existing?.dlqCount ?? 0,
    });
  }

  getStreamStats(): StreamStats[] {
    return Array.from(this._streamStats.values());
  }
}
