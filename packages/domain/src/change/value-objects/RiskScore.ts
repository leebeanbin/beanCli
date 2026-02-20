import type { RiskLevel } from '@tfsdc/kernel';
import { CONSTANTS } from '@tfsdc/kernel';

export class RiskScore {
  private constructor(
    readonly points: number,
    readonly level: RiskLevel,
    readonly affectedRowsEstimate: number,
  ) {}

  static of(points: number, level: RiskLevel, affectedRowsEstimate: number): RiskScore {
    const clamped = Math.min(100, Math.max(0, points));
    return new RiskScore(clamped, level, affectedRowsEstimate);
  }

  get isBulkChange(): boolean {
    return this.affectedRowsEstimate >= CONSTANTS.BULK_CHANGE_THRESHOLD_ROWS;
  }

  get requiresBackup(): boolean {
    return this.level === 'L2';
  }

  equals(other: RiskScore): boolean {
    return this.points === other.points && this.level === other.level;
  }
}
