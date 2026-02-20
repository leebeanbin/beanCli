import { InvalidStatusTransitionError } from '@tfsdc/kernel';
import { ChangeRequest } from './ChangeRequest';
import { SqlStatement } from '../value-objects/SqlStatement';
import { RiskScore } from '../value-objects/RiskScore';
import { ExecutionPolicy } from '../value-objects/ExecutionPolicy';
import type { SqlAst, ISqlAstValidator } from '../value-objects/SqlStatement';
import { ok } from '@tfsdc/kernel';
import type { Result } from '@tfsdc/kernel';
import { ChangeSubmitted } from '../domain-events/ChangeSubmitted';
import { ChangeApproved } from '../domain-events/ChangeApproved';
import { ChangeExecuted } from '../domain-events/ChangeExecuted';
import { ChangeReverted } from '../domain-events/ChangeReverted';

const mockValidator: ISqlAstValidator = {
  parse(_sql: string): Result<SqlAst, string> {
    return ok({
      operation: 'UPDATE',
      targetTable: 'state_orders',
      hasWhereClause: true,
      astHash: 'test-hash',
    });
  },
};

function createTestCR(overrides?: {
  requiresApproval?: boolean;
  mode?: 'AUTO' | 'CONFIRM' | 'MANUAL';
  riskLevel?: 'L0' | 'L1' | 'L2';
  affectedRows?: number;
}) {
  const mode = overrides?.mode ?? 'AUTO';
  const requiresApproval = overrides?.requiresApproval ?? false;
  const level = overrides?.riskLevel ?? 'L1';
  const affected = overrides?.affectedRows ?? 1;

  return ChangeRequest.create({
    actor: 'alice',
    role: 'MANAGER',
    sqlStatement: SqlStatement.parse("UPDATE state_orders SET status='DONE' WHERE id=1", mockValidator),
    riskScore: RiskScore.of(50, level, affected),
    executionPolicy: new ExecutionPolicy(mode, requiresApproval),
    environment: 'DEV',
  });
}

describe('ChangeRequest', () => {
  it('creates in DRAFT status with ChangeSubmitted event', () => {
    const cr = createTestCR();
    expect(cr.status).toBe('DRAFT');
    const events = cr.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(ChangeSubmitted);
  });

  describe('submit()', () => {
    it('transitions to APPROVED when no approval needed', () => {
      const cr = createTestCR({ requiresApproval: false });
      cr.submit();
      expect(cr.status).toBe('APPROVED');
    });

    it('transitions to PENDING_APPROVAL when approval needed', () => {
      const cr = createTestCR({ requiresApproval: true });
      cr.submit();
      expect(cr.status).toBe('PENDING_APPROVAL');
    });

    it('throws if not DRAFT', () => {
      const cr = createTestCR();
      cr.submit();
      expect(() => cr.submit()).toThrow(InvalidStatusTransitionError);
    });
  });

  describe('approve()', () => {
    it('transitions from PENDING_APPROVAL to APPROVED', () => {
      const cr = createTestCR({ requiresApproval: true });
      cr.submit();
      cr.approve('bob');
      expect(cr.status).toBe('APPROVED');
      expect(cr.approvedBy).toBe('bob');
      expect(cr.approvedAt).toBeInstanceOf(Date);

      const events = cr.pullEvents();
      expect(events.some((e) => e instanceof ChangeApproved)).toBe(true);
    });

    it('throws if not PENDING_APPROVAL', () => {
      const cr = createTestCR();
      expect(() => cr.approve('bob')).toThrow(InvalidStatusTransitionError);
    });
  });

  describe('reject()', () => {
    it('transitions from PENDING_APPROVAL back to DRAFT', () => {
      const cr = createTestCR({ requiresApproval: true });
      cr.submit();
      cr.reject();
      expect(cr.status).toBe('DRAFT');
    });
  });

  describe('startExecution()', () => {
    it('can start from APPROVED', () => {
      const cr = createTestCR();
      cr.submit();
      cr.startExecution();
      expect(cr.status).toBe('EXECUTING');
    });

    it('can start from WAITING_EXECUTION', () => {
      const cr = createTestCR();
      cr.submit();
      cr.markWaitingExecution();
      cr.startExecution();
      expect(cr.status).toBe('EXECUTING');
    });
  });

  describe('complete()', () => {
    it('transitions to DONE with ChangeExecuted event', () => {
      const cr = createTestCR();
      cr.submit();
      cr.startExecution();
      cr.complete(5, ['pk1', 'pk2']);
      expect(cr.status).toBe('DONE');
      expect(cr.affectedRowsActual).toBe(5);

      const events = cr.pullEvents();
      const executed = events.find((e) => e instanceof ChangeExecuted) as ChangeExecuted;
      expect(executed).toBeDefined();
      expect(executed.affectedRows).toBe(5);
      expect(executed.pkListTruncated).toBe(false);
    });

    it('truncates pkList when > 500 rows', () => {
      const cr = createTestCR();
      cr.submit();
      cr.startExecution();
      cr.complete(600);
      const events = cr.pullEvents();
      const executed = events.find((e) => e instanceof ChangeExecuted) as ChangeExecuted;
      expect(executed.pkListTruncated).toBe(true);
      expect(executed.pkList).toBeUndefined();
    });
  });

  describe('fail() and revert()', () => {
    it('transitions EXECUTING -> FAILED -> REVERTED', () => {
      const cr = createTestCR();
      cr.submit();
      cr.startExecution();
      cr.fail('timeout');
      expect(cr.status).toBe('FAILED');
      expect(cr.failureReason).toBe('timeout');

      cr.revert('snap-123');
      expect(cr.status).toBe('REVERTED');
      expect(cr.revertedAt).toBeInstanceOf(Date);

      const events = cr.pullEvents();
      expect(events.some((e) => e instanceof ChangeReverted)).toBe(true);
    });
  });

  describe('isBulkChange', () => {
    it('true when >= 1000 rows', () => {
      const cr = createTestCR({ affectedRows: 1500 });
      expect(cr.isBulkChange).toBe(true);
    });

    it('false when < 1000 rows', () => {
      const cr = createTestCR({ affectedRows: 999 });
      expect(cr.isBulkChange).toBe(false);
    });
  });

  describe('requiresBackup', () => {
    it('true for L2 risk level', () => {
      const cr = createTestCR({ riskLevel: 'L2' });
      expect(cr.requiresBackup).toBe(true);
    });

    it('false for L0/L1', () => {
      expect(createTestCR({ riskLevel: 'L0' }).requiresBackup).toBe(false);
      expect(createTestCR({ riskLevel: 'L1' }).requiresBackup).toBe(false);
    });
  });
});
