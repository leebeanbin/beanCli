import { randomUUID } from 'crypto';
import type { ChangeRequestStatus, UserRole, Environment, DomainEvent } from '@tfsdc/kernel';
import { InvalidStatusTransitionError, CONSTANTS } from '@tfsdc/kernel';
import { ChangeId } from '../value-objects/ChangeId.js';
import type { SqlStatement } from '../value-objects/SqlStatement.js';
import type { RiskScore } from '../value-objects/RiskScore.js';
import type { ExecutionPolicy } from '../value-objects/ExecutionPolicy.js';
import { ChangeSubmitted } from '../domain-events/ChangeSubmitted.js';
import { ChangeApproved } from '../domain-events/ChangeApproved.js';
import { ChangeExecuted } from '../domain-events/ChangeExecuted.js';
import { ChangeReverted } from '../domain-events/ChangeReverted.js';

export interface CreateChangeRequestParams {
  actor: string;
  role: UserRole;
  sqlStatement: SqlStatement;
  riskScore: RiskScore;
  executionPolicy: ExecutionPolicy;
  environment: Environment;
}

export interface ReconstituteChangeRequestParams {
  id: ChangeId;
  actor: string;
  role: UserRole;
  sqlStatement: SqlStatement;
  riskScore: RiskScore;
  executionPolicy: ExecutionPolicy;
  environment: Environment;
  status: ChangeRequestStatus;
  correlationId: string;
  createdAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  executedAt?: Date;
  revertedAt?: Date;
  failureReason?: string;
  affectedRowsActual?: number;
}

export class ChangeRequest {
  private _events: DomainEvent[] = [];

  private constructor(
    readonly id: ChangeId,
    readonly actor: string,
    readonly role: UserRole,
    readonly sqlStatement: SqlStatement,
    readonly riskScore: RiskScore,
    readonly executionPolicy: ExecutionPolicy,
    readonly environment: Environment,
    private _status: ChangeRequestStatus,
    readonly correlationId: string,
    readonly createdAt: Date,
    private _approvedBy?: string,
    private _approvedAt?: Date,
    private _executedAt?: Date,
    private _revertedAt?: Date,
    private _failureReason?: string,
    private _affectedRowsActual?: number,
  ) {}

  static create(params: CreateChangeRequestParams): ChangeRequest {
    const id = ChangeId.generate();
    const correlationId = randomUUID();
    const cr = new ChangeRequest(
      id,
      params.actor,
      params.role,
      params.sqlStatement,
      params.riskScore,
      params.executionPolicy,
      params.environment,
      'DRAFT',
      correlationId,
      new Date(),
    );
    cr._events.push(new ChangeSubmitted(id, params.actor, params.riskScore, correlationId));
    return cr;
  }

  static reconstitute(params: ReconstituteChangeRequestParams): ChangeRequest {
    return new ChangeRequest(
      params.id,
      params.actor,
      params.role,
      params.sqlStatement,
      params.riskScore,
      params.executionPolicy,
      params.environment,
      params.status,
      params.correlationId,
      params.createdAt,
      params.approvedBy,
      params.approvedAt,
      params.executedAt,
      params.revertedAt,
      params.failureReason,
      params.affectedRowsActual,
    );
  }

  // ── State transitions ───────────────────────────────────

  submit(): void {
    this.assertStatus('DRAFT');
    this._status = this.executionPolicy.requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED';
  }

  approve(approver: string): void {
    this.assertStatus('PENDING_APPROVAL');
    this._status = 'APPROVED';
    this._approvedBy = approver;
    this._approvedAt = new Date();
    this._events.push(new ChangeApproved(this.id, approver, this.correlationId));
  }

  reject(): void {
    this.assertStatus('PENDING_APPROVAL');
    this._status = 'DRAFT';
  }

  markWaitingExecution(): void {
    this.assertStatus('APPROVED');
    this._status = 'WAITING_EXECUTION';
  }

  startExecution(): void {
    this.assertOneOf(['APPROVED', 'WAITING_EXECUTION']);
    this._status = 'EXECUTING';
  }

  complete(affectedRows: number, pkList?: string[]): void {
    this.assertStatus('EXECUTING');
    this._status = 'DONE';
    this._executedAt = new Date();
    this._affectedRowsActual = affectedRows;

    const truncatedList = affectedRows <= CONSTANTS.CHANGE_APPLIED_PK_LIST_MAX ? pkList : undefined;

    this._events.push(new ChangeExecuted(this.id, affectedRows, this.correlationId, truncatedList));
  }

  fail(reason: string): void {
    this.assertStatus('EXECUTING');
    this._status = 'FAILED';
    this._failureReason = reason;
  }

  revert(snapshotId?: string): void {
    this.assertStatus('FAILED');
    this._status = 'REVERTED';
    this._revertedAt = new Date();
    this._events.push(new ChangeReverted(this.id, this.correlationId, snapshotId));
  }

  // ── Queries ─────────────────────────────────────────────

  get status(): ChangeRequestStatus {
    return this._status;
  }

  get isBulkChange(): boolean {
    return this.riskScore.affectedRowsEstimate >= CONSTANTS.BULK_CHANGE_THRESHOLD_ROWS;
  }

  get requiresBackup(): boolean {
    return this.riskScore.level === 'L2';
  }

  get approvedBy(): string | undefined {
    return this._approvedBy;
  }

  get approvedAt(): Date | undefined {
    return this._approvedAt;
  }

  get executedAt(): Date | undefined {
    return this._executedAt;
  }

  get revertedAt(): Date | undefined {
    return this._revertedAt;
  }

  get failureReason(): string | undefined {
    return this._failureReason;
  }

  get affectedRowsActual(): number | undefined {
    return this._affectedRowsActual;
  }

  pullEvents(): DomainEvent[] {
    const events = [...this._events];
    this._events = [];
    return events;
  }

  // ── Internal ────────────────────────────────────────────

  private assertStatus(expected: ChangeRequestStatus): void {
    if (this._status !== expected) {
      throw new InvalidStatusTransitionError(this._status, expected);
    }
  }

  private assertOneOf(expected: ChangeRequestStatus[]): void {
    if (!expected.includes(this._status)) {
      throw new InvalidStatusTransitionError(this._status, expected.join('|'));
    }
  }
}
