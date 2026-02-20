# Phase 2: Change 엔진 도메인 모델

## 개요

Change 엔진은 이 시스템의 핵심 도메인이다. 모든 데이터 변경은 반드시 이 엔진을 통과하며, 검증 → 위험 평가 → 정책 적용 → 실행 → 감사의 불변 파이프라인을 따른다.

---

## 1. 도메인 경계 (Bounded Context)

```
packages/domain/change/
  ├── entities/
  │   ├── ChangeRequest.ts        # Aggregate Root
  │   └── BackupSnapshot.ts
  ├── value-objects/
  │   ├── SqlStatement.ts         # SQL + AST 보유
  │   ├── RiskScore.ts            # 0-100, L0/L1/L2
  │   ├── ExecutionPolicy.ts      # env + role + risk → mode
  │   └── ChangeId.ts
  ├── domain-events/
  │   ├── ChangeSubmitted.ts
  │   ├── ChangeApproved.ts
  │   ├── ChangeExecuted.ts
  │   └── ChangeReverted.ts
  ├── services/
  │   ├── SqlAstValidator.ts      # WHERE 강제, 구문 검증
  │   ├── RiskScorer.ts           # 영향 범위 추정
  │   └── PolicyEvaluator.ts      # ExecutionMode 결정
  └── repositories/
      └── IChangeRequestRepository.ts
```

---

## 2. Aggregate: ChangeRequest

ChangeRequest는 단일 Aggregate Root다. 외부에서 상태를 직접 수정할 수 없으며, 메서드를 통해서만 상태 전이가 발생한다.

```typescript
// packages/domain/change/entities/ChangeRequest.ts

export type ChangeRequestStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'WAITING_EXECUTION'
  | 'EXECUTING'
  | 'DONE'
  | 'FAILED'
  | 'REVERTED';

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
  ) {}

  // ── Factory ──────────────────────────────────────────────
  static create(params: {
    actor: string;
    role: UserRole;
    sqlStatement: SqlStatement;
    riskScore: RiskScore;
    executionPolicy: ExecutionPolicy;
    environment: Environment;
  }): ChangeRequest {
    const id = ChangeId.generate();
    const cr = new ChangeRequest(
      id,
      params.actor,
      params.role,
      params.sqlStatement,
      params.riskScore,
      params.executionPolicy,
      params.environment,
      'DRAFT',
      crypto.randomUUID(),
      new Date(),
    );
    cr._events.push(new ChangeSubmitted(id, params.actor, params.riskScore));
    return cr;
  }

  // ── 상태 전이 ─────────────────────────────────────────────
  submit(): void {
    this.assertStatus('DRAFT');
    const needsApproval = this.executionPolicy.requiresApproval(this.riskScore);
    this._status = needsApproval ? 'PENDING_APPROVAL' : 'APPROVED';
  }

  approve(approver: string): void {
    this.assertStatus('PENDING_APPROVAL');
    this._status = 'APPROVED';
    this._events.push(new ChangeApproved(this.id, approver));
  }

  reject(): void {
    this.assertStatus('PENDING_APPROVAL');
    this._status = 'DRAFT'; // 재작성 가능하도록 DRAFT로 복귀
  }

  startExecution(): void {
    this.assertOneOf(['APPROVED', 'WAITING_EXECUTION']);
    this._status = 'EXECUTING';
  }

  complete(affectedRows: number): void {
    this.assertStatus('EXECUTING');
    this._status = 'DONE';
    this._events.push(new ChangeExecuted(this.id, affectedRows));
  }

  fail(reason: string): void {
    this.assertStatus('EXECUTING');
    this._status = 'FAILED';
  }

  revert(): void {
    this.assertStatus('FAILED');
    this._status = 'REVERTED';
    this._events.push(new ChangeReverted(this.id));
  }

  // ── 조회 ──────────────────────────────────────────────────
  get status(): ChangeRequestStatus { return this._status; }
  get isBulkChange(): boolean { return this.riskScore.affectedRowsEstimate >= 1000; }
  get requiresBackup(): boolean { return this.riskScore.level === 'L2'; }

  pullEvents(): DomainEvent[] {
    const events = [...this._events];
    this._events = [];
    return events;
  }

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
```

---

## 3. Value Object: SqlStatement

SQL을 단순 문자열이 아닌 검증된 AST 보유 객체로 다룬다.

```typescript
// packages/domain/change/value-objects/SqlStatement.ts

export type SqlOperation = 'SELECT' | 'UPDATE' | 'DELETE' | 'INSERT';

export interface SqlAst {
  operation: SqlOperation;
  targetTable: string;
  hasWhereClause: boolean;
  estimatedAffectedRows?: number;
  astHash: string; // SHA-256(normalized AST)
}

export class SqlStatement {
  private constructor(
    readonly raw: string,
    readonly ast: SqlAst,
  ) {}

  static parse(raw: string, validator: ISqlAstValidator): SqlStatement {
    const result = validator.parse(raw);

    if (result.isErr()) {
      throw new SqlParseError(result.error);
    }

    return new SqlStatement(raw, result.value);
  }

  get operation(): SqlOperation { return this.ast.operation; }
  get targetTable(): string { return this.ast.targetTable; }
  get isWriteOperation(): boolean {
    return ['UPDATE', 'DELETE', 'INSERT'].includes(this.ast.operation);
  }
}
```

---

## 4. Domain Service: SqlAstValidator

WHERE 없는 UPDATE/DELETE를 AST 레벨에서 차단한다.

```typescript
// packages/domain/change/services/SqlAstValidator.ts

export interface ISqlAstValidator {
  parse(sql: string): Result<SqlAst, string>;
}

// 불변 규칙 목록 (확장 가능)
const INVARIANT_RULES: AstRule[] = [
  {
    name: 'NO_UPDATE_WITHOUT_WHERE',
    check: (ast) => !(ast.operation === 'UPDATE' && !ast.hasWhereClause),
    message: 'UPDATE without WHERE clause is forbidden',
  },
  {
    name: 'NO_DELETE_WITHOUT_WHERE',
    check: (ast) => !(ast.operation === 'DELETE' && !ast.hasWhereClause),
    message: 'DELETE without WHERE clause is forbidden',
  },
  {
    name: 'NO_DDL_IN_CHANGE_REQUEST',
    check: (ast) => !['DROP', 'TRUNCATE', 'ALTER'].includes(ast.operation),
    message: 'DDL operations are not allowed via ChangeRequest',
  },
];

export class SqlAstValidatorImpl implements ISqlAstValidator {
  parse(sql: string): Result<SqlAst, string> {
    // node-sql-parser 또는 pg-query-native 사용
    const parseResult = this.parseRaw(sql);
    if (!parseResult.ok) return err(parseResult.error);

    for (const rule of INVARIANT_RULES) {
      if (!rule.check(parseResult.ast)) {
        return err(`[${rule.name}] ${rule.message}`);
      }
    }

    return ok({
      ...parseResult.ast,
      astHash: sha256(JSON.stringify(parseResult.ast)),
    });
  }

  private parseRaw(sql: string): RawParseResult { /* ... */ }
}
```

---

## 5. Domain Service: RiskScorer

실행 계획 기반 위험도 평가. 점수는 0–100, 레벨은 L0/L1/L2.

```
RiskScore 계산 로직:

Base score:
  UPDATE = 40, DELETE = 60, INSERT = 20, SELECT = 0

조정 요인:
  + 영향 행 추정치 >= 1,000  → +30 (BULK_CHANGE)
  + 영향 행 추정치 >= 10,000 → +20 추가
  + 대상이 PROD 환경          → +10
  + backup_snapshot 없음     → +10
  - L2 테이블이 아닌 경우      → -10

Level 매핑:
  0-30  → L0
  31-60 → L1
  61+   → L2
```

```typescript
export class RiskScorer {
  score(params: {
    ast: SqlAst;
    environment: Environment;
    affectedRowsEstimate: number;
  }): RiskScore {
    let points = BASE_SCORES[params.ast.operation] ?? 0;

    if (params.affectedRowsEstimate >= 1000)  points += 30;
    if (params.affectedRowsEstimate >= 10000) points += 20;
    if (params.environment === 'PROD')        points += 10;

    points = Math.min(100, Math.max(0, points));

    const level: RiskLevel =
      points <= 30 ? 'L0' :
      points <= 60 ? 'L1' : 'L2';

    return new RiskScore(points, level, params.affectedRowsEstimate);
  }
}
```

---

## 6. Domain Service: PolicyEvaluator

환경 + 역할 + 위험도 → ExecutionMode 결정.

```typescript
// 정책 테이블 (확정값)
const POLICY_TABLE: Record<Environment, Record<RiskLevel, ExecutionMode>> = {
  LOCAL: { L0: 'AUTO',    L1: 'AUTO',    L2: 'AUTO'    },
  DEV:   { L0: 'AUTO',    L1: 'AUTO',    L2: 'CONFIRM' },
  PROD:  { L0: 'CONFIRM', L1: 'CONFIRM', L2: 'MANUAL'  },
};

export class PolicyEvaluator {
  evaluate(params: {
    environment: Environment;
    role: UserRole;
    riskScore: RiskScore;
    isBulkChange: boolean;
  }): ExecutionPolicy {
    let mode = POLICY_TABLE[params.environment][params.riskScore.level];

    // BULK_CHANGE는 항상 최소 CONFIRM 이상
    if (params.isBulkChange && mode === 'AUTO') {
      mode = 'CONFIRM';
    }

    // ANALYST는 절대 실행 불가 (별도 에러)
    if (params.role === 'ANALYST') {
      throw new InsufficientPermissionError('ANALYST cannot create change requests');
    }

    const requiresApproval = mode === 'MANUAL' ||
      (mode === 'CONFIRM' && params.environment === 'PROD');

    return new ExecutionPolicy(mode, requiresApproval);
  }
}
```

---

## 7. Use Case 흐름

```
SubmitChangeUseCase
  1. SqlAstValidator.parse(sql)           → SqlStatement
  2. DB EXPLAIN → affectedRowsEstimate
  3. RiskScorer.score(...)                → RiskScore
  4. PolicyEvaluator.evaluate(...)        → ExecutionPolicy
  5. ChangeRequest.create(...)            → Aggregate
  6. if L2: BackupSnapshot.capture(...)
  7. ChangeRequestRepository.save(cr)
  8. if PENDING: NotifyApprovers(cr)
  9. AuditWriter.write(ChangeSubmitted)
 10. if AUTO: ExecuteChangeUseCase(cr.id)
```

---

## 8. 도메인 이벤트

| 이벤트 | 발생 시점 | Payload |
|---|---|---|
| `ChangeSubmitted` | DRAFT 생성 | changeId, actor, riskLevel |
| `ChangeApproved` | 승인 완료 | changeId, approver |
| `ChangeExecuted` | 실행 완료 | changeId, affectedRows, pkList(≤500) |
| `ChangeReverted` | 되돌리기 완료 | changeId, snapshotId |

`ChangeExecuted` 이벤트의 pkList 정책:
- 영향 row ≤ 500 → pkList 포함
- 영향 row > 500 → `pkListTruncated: true`, count만 전송 → 클라이언트 full refetch

---

## 9. 에러 계층

```
DomainError
  ├── SqlParseError              SQL 파싱 실패
  ├── SqlValidationError         WHERE 없는 UPDATE/DELETE 등
  ├── InvalidStatusTransitionError  허용되지 않은 상태 전이
  ├── InsufficientPermissionError   권한 부족
  └── BulkChangePolicyError      대량 변경 정책 위반
```

---

## 10. 테스트 전략

모든 도메인 로직은 DB 없이 순수 단위 테스트로 검증한다.

```typescript
describe('ChangeRequest', () => {
  it('ANALYST는 ChangeRequest를 생성할 수 없다', () => {
    expect(() => PolicyEvaluator.evaluate({ role: 'ANALYST', ... }))
      .toThrow(InsufficientPermissionError);
  });

  it('WHERE 없는 UPDATE는 DRAFT 단계에서 차단된다', () => {
    expect(() => SqlStatement.parse('UPDATE users SET status = 1', validator))
      .toThrow(SqlValidationError);
  });

  it('PROD + L2 변경은 MANUAL 모드가 결정된다', () => {
    const policy = PolicyEvaluator.evaluate({ environment: 'PROD', riskScore: L2, ... });
    expect(policy.mode).toBe('MANUAL');
  });

  it('1000행 이상 변경은 isBulkChange가 true이다', () => {
    const cr = ChangeRequest.create({ riskScore: RiskScore.of(50, 'L1', 1500), ... });
    expect(cr.isBulkChange).toBe(true);
  });
});
```
