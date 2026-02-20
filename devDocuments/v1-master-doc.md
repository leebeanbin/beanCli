# 📘 Terminal-First Streaming Data Console
## v1 Master Development Document (FINAL)
> PostgreSQL + Kafka | DDD + TDD + SOLID | 모든 미결정 항목 확정 완료

---

## 0. 제품 비전

> 터미널 기반 실시간 데이터 콘솔  
> 스트리밍 기반 상태 탐색 + 편집 + 승인 + 복구 + 모니터링까지 통합

### 핵심 원칙

1. **Terminal-first** (TUI가 메인)
2. Web은 보조 (승인/정책/보안 관리)
3. PostgreSQL only (v1)
4. Kafka 기반 이벤트 처리
5. 보수적 PROD 정책
6. 권한 없으면 수정 UI 진입 자체 불가
7. 변경은 항상 ChangeRequest로 기록
8. Backup: 변경 대상 row snapshot, TTL 7일
9. Optimistic UI + 이벤트 기반 동기화
10. WebSocket 기본, SSE fallback
11. Sidecar 지원 (Managed 기본)

---

## 1. 전체 아키텍처

```
[TUI] <-> [API] <-> [PostgreSQL]
        |
        +-> [Kafka]
              |
          [Projector]
          [Recovery Worker]
          [Sidecar (optional)]
```

---

## 2. 기술 스택

| 영역      | 스택                        |
| ------- | ------------------------- |
| DB      | PostgreSQL 15+            |
| 스트리밍    | Kafka                     |
| API     | TypeScript (Node.js)      |
| TUI     | TypeScript                |
| Web     | TypeScript                |
| 메시징     | WebSocket 기본 / SSE fallback |
| 아키텍처    | DDD + TDD + SOLID         |
| 패키징     | Docker Compose            |

---

## 3. Monorepo 구조 (DDD 기반)

```
/apps
  /api               # Express/Fastify wiring
  /projector         # Kafka consumer → DB upsert
  /recovery-worker   # DLQ 재처리
  /cli               # TUI entry point
  /web               # Web console

/packages
  /domain            # 순수 도메인 로직 (의존성 없음)
  /application       # Use cases
  /infrastructure    # DB / Kafka 구현체
  /policy            # ExecutionMode, RiskScore 정책
  /dsl               # SQL AST 파서 + 검증기
  /sql               # DDL / migration 파일
  /audit             # Audit event 기록
  /ui-tui            # TUI 컴포넌트
  /ui-web            # Web 컴포넌트
  /kernel            # 공통 타입, 에러, 유틸
  /testing           # 테스트 헬퍼, fixture
```

### DDD 레이어 규칙

- `domain` → 순수 로직, 외부 의존성 없음
- `application` → usecase (도메인 + 인프라 조율)
- `infrastructure` → DB/Kafka 구현체
- `apps` → wiring only (DI container)

---

## 4. 권한 및 실행 정책

### 4.1 역할 (Role)

| Role           | 권한                           |
| -------------- | ---------------------------- |
| ANALYST        | 읽기 전용 (read)                 |
| MANAGER        | 팀 범위 변경 위임 가능                |
| DBA            | 최종 정책 설정자 + MANUAL 실행자       |
| SECURITY_ADMIN | DLQ 열람, 키 회전 (key rotation) 수행 |

### 4.2 ExecutionMode

| Mode    | 설명                  |
| ------- | ------------------- |
| AUTO    | 승인 후 즉시 자동 실행       |
| CONFIRM | 승인 후 1회 실행 확인 필요    |
| MANUAL  | 승인 후 DBA가 직접 실행     |

### 4.3 기본 정책 (환경별)

| 환경    | L0      | L1      | L2      |
| ----- | ------- | ------- | ------- |
| LOCAL | AUTO    | AUTO    | AUTO    |
| DEV   | AUTO    | AUTO    | CONFIRM |
| PROD  | CONFIRM | CONFIRM | MANUAL  |

> L0: 단순 조회성 변경, L1: 일반 데이터 변경, L2: 고위험 스키마/대량 변경

---

## 5. 데이터 모델

### 5.1 events_raw

스트리밍 원천 이벤트 저장소

| 컬럼                | 타입            | 설명                  |
| ----------------- | ------------- | ------------------- |
| id                | BIGSERIAL PK  |                     |
| source_topic      | TEXT          | Kafka topic 명       |
| partition         | INT           | Kafka partition     |
| offset            | BIGINT        | Kafka offset        |
| event_time_ms     | BIGINT        | 이벤트 발생 시각 (ms)      |
| entity_type       | TEXT          | 엔티티 종류              |
| entity_id_hash    | TEXT          | HMAC-SHA256 해시 ID   |
| payload           | JSONB         | 이벤트 페이로드            |
| recovered         | BOOLEAN       | DLQ 재처리 여부          |
| dlq_ref           | TEXT NULL     | DLQ 원본 참조 키         |
| created_at        | TIMESTAMPTZ   | DB 삽입 시각            |

UNIQUE: `(source_topic, partition, offset)`

### 5.2 state_{entity_type}

투영된 최신 상태 저장소 (엔티티별 파티션)

| 컬럼                     | 타입          | 설명             |
| ---------------------- | ----------- | -------------- |
| entity_id_hash         | TEXT PK     | HMAC-SHA256 ID |
| updated_event_time_ms  | BIGINT      | 마지막 업데이트 이벤트 시각 |
| last_offset            | BIGINT      | 마지막 처리 offset  |
| ...domain fields...    | 각 도메인별 필드   |                |

### 5.3 backup_snapshots

변경 대상 row의 스냅샷 (변경 전 상태 보관)

| 컬럼          | 타입          | 설명               |
| ----------- | ----------- | ---------------- |
| id          | BIGSERIAL PK |                  |
| change_id   | UUID        | 연관 change_request |
| table_name  | TEXT        | 대상 테이블명          |
| where_clause | TEXT       | 적용된 WHERE 조건     |
| snapshot    | JSONB       | 변경 전 row 데이터     |
| created_at  | TIMESTAMPTZ |                  |
| expires_at  | TIMESTAMPTZ | TTL 7일 후 만료      |

### 5.4 change_requests

모든 변경 요청의 생명주기 추적

| 컬럼              | 타입          | 설명               |
| --------------- | ----------- | ---------------- |
| id              | UUID PK     |                  |
| status          | ENUM        | 상태 (하단 참조)       |
| actor           | TEXT        | 요청자              |
| role            | TEXT        | 요청자 역할           |
| target_table    | TEXT        | 대상 테이블           |
| sql_statement   | TEXT        | 실행할 SQL          |
| ast_hash        | TEXT        | SQL AST 해시 (무결성) |
| risk_score      | INT         | 위험도 점수 (0-100)   |
| risk_level      | TEXT        | L0 / L1 / L2    |
| execution_mode  | TEXT        | AUTO/CONFIRM/MANUAL |
| environment     | TEXT        | LOCAL/DEV/PROD   |
| approved_by     | TEXT NULL   | 승인자              |
| approved_at     | TIMESTAMPTZ NULL |            |
| executed_at     | TIMESTAMPTZ NULL |            |
| reverted_at     | TIMESTAMPTZ NULL |            |
| correlation_id  | UUID        | 추적용 ID           |
| created_at      | TIMESTAMPTZ |                  |
| updated_at      | TIMESTAMPTZ |                  |

**상태 전이:**

```
DRAFT → PENDING_APPROVAL → APPROVED → WAITING_EXECUTION
     → EXECUTING → DONE
                 → FAILED → REVERTED
```

### 5.5 audit_events

모든 행위의 불변 감사 로그

| 컬럼             | 타입          | 설명          |
| -------------- | ----------- | ----------- |
| id             | BIGSERIAL PK |             |
| category       | TEXT        | 분류 (CHANGE/AUTH/POLICY/SECURITY) |
| actor          | TEXT        | 행위자         |
| action         | TEXT        | 행위 (SUBMIT/APPROVE/EXECUTE 등) |
| resource       | TEXT        | 대상 리소스      |
| result         | TEXT        | SUCCESS/FAILURE |
| correlation_id | UUID        | 추적 ID       |
| data           | JSONB       | 상세 데이터      |
| created_at     | TIMESTAMPTZ |             |

### 5.6 dlq_events (Dead Letter Queue)

실패한 이벤트 격리 저장소

| 컬럼              | 타입          | 설명                     |
| --------------- | ----------- | ---------------------- |
| id              | BIGSERIAL PK |                        |
| source_topic    | TEXT        |                        |
| partition       | INT         |                        |
| offset          | BIGINT      |                        |
| payload_encrypted | BYTEA     | AES-256 암호화된 페이로드       |
| key_id          | TEXT        | 복호화에 사용한 key ID        |
| error_message   | TEXT        | 실패 원인                  |
| retry_count     | INT         | 재처리 시도 횟수              |
| last_retry_at   | TIMESTAMPTZ NULL |                   |
| resolved        | BOOLEAN     | 처리 완료 여부               |
| created_at      | TIMESTAMPTZ |                        |

### 5.7 hmac_keys

HMAC key 관리 (rotation 지원)

| 컬럼          | 타입          | 설명                      |
| ----------- | ----------- | ----------------------- |
| key_id      | TEXT PK     | 키 식별자                   |
| key_value   | BYTEA       | 실제 키 (암호화 저장)            |
| status      | TEXT        | ACTIVE / PREVIOUS / RETIRED |
| created_at  | TIMESTAMPTZ |                         |
| rotated_at  | TIMESTAMPTZ NULL |                    |
| retired_at  | TIMESTAMPTZ NULL |                    |

---

## 6. 확정된 미결정 항목 ✅

| # | 항목                        | 확정값                                   |
| - | ------------------------- | ------------------------------------- |
| 1 | Sidecar Remote Mode(C) 접근 | **JWT/API Key 토큰 기반**                 |
| 2 | TUI 렌더링 프레임 제한            | **30fps cap** (CPU 절약)                |
| 3 | entity_id_plain PROD 기본값  | **false 고정, 환경변수 override 허용**        |
| 4 | ChangeApplied pkList 제한  | **500개 제한** (초과 시 count만 전송, refetch) |
| 5 | 대량 변경 임계치 기본값             | **1,000행**                            |

### 미결정 항목 상세 정책

#### ✅ 미결정 1: Sidecar Remote Mode 접근 방식

- JWT Bearer 토큰 또는 API Key 헤더 방식 지원
- 토큰 만료: JWT 1시간, 갱신은 refresh token
- API Key는 SECURITY_ADMIN이 발급/폐기
- Remote Mode는 팀 단위 사용, 연결당 rate limit 적용

#### ✅ 미결정 2: TUI 렌더링 프레임 제한 (30fps)

- 렌더 루프는 최대 33ms(30fps) 간격으로 throttle
- 이벤트 발생 즉시 dirty flag 설정, 다음 프레임에 flush
- 고속 스트리밍 중에도 CPU 스파이크 방지
- `LIVE` 모드: 30fps, `PAUSED` 모드: on-demand only

#### ✅ 미결정 3: entity_id_plain 저장 정책

```
PROD 기본: entity_id_plain 저장 = false
환경변수: ENTITY_ID_PLAIN_ENABLED=true 로 override 가능
DEV/LOCAL: 기본 true (디버깅 편의)
```

- PROD에서 plain 활성화 시 audit_events에 경고 기록
- 활성화/비활성화 변경 이벤트도 audit 기록

#### ✅ 미결정 4: ChangeApplied 이벤트 pkList 정책

```typescript
interface ChangeAppliedEvent {
  changeId: string;
  tableNme: string;
  affectedCount: number;
  pkList?: string[];       // 500개 이하일 때만 포함
  pkListTruncated: boolean; // 500개 초과 시 true
}
```

- 500개 초과 시: `pkListTruncated: true`, 클라이언트는 전체 refetch
- TUI viewport 내 row만 micro-batch refetch로 최적화

#### ✅ 미결정 5: 대량 변경 임계치 (1,000행)

- WHERE 조건 실행 계획 EXPLAIN으로 영향 행 수 추정
- 추정치 ≥ 1,000행 → `BULK_CHANGE` 플래그 활성화
- BULK_CHANGE 시:
  - PROD: 자동으로 L2 risk level 상향
  - 추가 승인 단계 강제
  - backup_snapshot 반드시 필요
  - 진행률 스트리밍 (0% ~ 100%)

---

## 7. Change/Approval 엔진

### 7.1 불변 규칙 (변경 불가)

1. WHERE 없는 UPDATE/DELETE 금지 (AST 레벨 차단)
2. L2 변경은 backup_snapshot 필수
3. 권한 없으면 edit UI 진입 불가 (렌더링 단계 차단)
4. 모든 변경은 audit_events 기록

### 7.2 변경 처리 흐름

```
[사용자 입력] → Draft 생성
    ↓
[SQL AST 파서] → WHERE 체크 / 구문 검증
    ↓
[RiskScorer] → 영향 범위 추정 → L0/L1/L2
    ↓
[PolicyEvaluator] → env + role + riskLevel → ExecutionMode 결정
    ↓
[Approval 필요?]
  YES → PENDING_APPROVAL → Approver 알림
  NO  → APPROVED (자동)
    ↓
[ExecutionMode 적용]
  AUTO    → 즉시 EXECUTING
  CONFIRM → 사용자 confirm 대기
  MANUAL  → DBA 직접 실행 대기
    ↓
[Backup] → backup_snapshots 저장 (L2 필수, L0/L1 선택)
    ↓
[Execute] → SQL 실행 + 영향 행 수 기록
    ↓
[AuditWriter] → audit_events 기록
    ↓
[ChangeApplied Event 발행] → Kafka → TUI/Web 동기화
```

---

## 8. 스트리밍 파이프라인

### 8.1 Projector

```
Kafka Consumer
  → DSL 평가 (이벤트 타입 매핑)
  → HMAC-SHA256(secret, canonical_id) 해시 생성
  → events_raw INSERT (중복 방지: unique constraint)
  → state_{entity_type} UPSERT
  → Kafka offset commit
```

### 8.2 DLQ (Dead Letter Queue)

- 3회 재시도 실패 → DLQ 이관
- payload는 AES-256으로 암호화 저장
- 열람 권한: SECURITY_ADMIN 전용
- 재처리 성공 시: `recovered = true`, `dlq_ref` 기록

### 8.3 Concurrency Controller

- **Hard guardrail**: DB p95 latency ≥ 200ms → 처리 속도 자동 감소
- **Hard guardrail**: Connection pool 사용률 ≥ 80% → throttle 적용
- **Soft goal**: 처리 ETA 최소화 (adaptive batch sizing)

---

## 9. UI 동기화 설계

### 9.1 Optimistic → Event Confirm → Refetch 흐름

```
1. [즉시] 화면에 낙관적 변경 반영 (Optimistic)
2. [이벤트] ChangeApplied 수신 → 변경 확인
3. [Refetch] viewport 내 영향 row micro-batch 조회
   - pkList ≤ 500: ID 기반 선택적 refetch
   - pkList > 500: viewport fast reload
4. [실패 시] rollback 표시 + 에러 메시지
```

### 9.2 Overload 대응

- Patch 큐 100개 초과 → patch 중단 → reload 권고
- 이벤트 수신 지연 3초 이상 → 연결 상태 경고 표시
- Backpressure: 클라이언트 처리 속도에 따라 서버 push rate 조절

---

## 10. Sidecar 설계

### 10.1 모드

| 모드 | 설명 | 기본값 |
| -- | -- | -- |
| A. Daemon | 로컬 프로세스로 항상 실행 | - |
| B. Managed | API가 수명 관리 (시작/종료) | ✅ 기본 |
| C. Remote/Team | 원격 팀 공유 인스턴스 | 제한적 |

### 10.2 Remote Mode (C) 접근 방식 ✅ 확정

- **인증**: JWT Bearer 토큰 또는 API Key
- JWT: 만료 1시간, refresh token으로 갱신
- API Key: SECURITY_ADMIN 발급/폐기, 키별 rate limit
- 연결 시 TLS 필수
- Rate limit: 연결당 100 req/s

---

## 11. TUI 설계

### 11.1 레이아웃

- **Adaptive Navigation**: 터미널 크기에 따라 사이드바/탭 전환
- **Command Palette**: `Ctrl+P`로 즉시 접근
- **Row/Cell mode**: `Tab`으로 전환
- **LIVE / PAUSED** 토글: `Space`

### 11.2 렌더링 (30fps cap) ✅ 확정

```typescript
class RenderLoop {
  private readonly TARGET_FPS = 30;
  private readonly FRAME_BUDGET_MS = 1000 / 30; // 33.33ms

  private dirty = false;

  markDirty() { this.dirty = true; }

  start() {
    setInterval(() => {
      if (this.dirty) {
        this.render();
        this.dirty = false;
      }
    }, this.FRAME_BUDGET_MS);
  }
}
```

### 11.3 화면 (Scenes)

| Scene      | 설명                  |
| ---------- | ------------------- |
| Explore    | 테이블 탐색 + 실시간 상태 조회  |
| Monitor    | 스트리밍 메트릭 + 처리량 시각화  |
| Recovery   | DLQ 확인 + 재처리 (SECURITY_ADMIN) |
| IndexLab   | 인덱스 분석 + 제안         |
| Audit      | 감사 로그 검색/조회         |

### 11.4 권한 기반 UI

- edit 불가 role → 수정 메뉴 항목 자체를 `[LOCKED]`로 표시
- ExecutionMode가 MANUAL이면 실행 버튼 비활성 + "DBA 실행 필요" 표시
- DLQ Recovery Scene → SECURITY_ADMIN 아닌 경우 접근 차단

---

## 12. Web Console

| 기능 | 설명 |
| -- | -- |
| Approval Inbox | PENDING 변경 요청 목록 + 승인/거부 |
| Policy Settings | ExecutionMode 정책 편집 |
| Key Rotation | HMAC/암호화 키 회전 (SECURITY_ADMIN) |
| DLQ Browser | DLQ 목록 열람 (복호화 없이, SECURITY_ADMIN) |
| Change Timeline | 전체 변경 이력 + 상태 추적 |

---

## 13. 보안

### 13.1 entity_id_hash

```
HMAC-SHA256(current_active_key, canonical_id_string)
```

- canonical_id_string: 엔티티 타입별 정규화 규칙 적용
- key_id를 events_raw에 함께 저장 (키 회전 추적)

### 13.2 entity_id_plain 정책 ✅ 확정

```
PROD 기본값: false (저장 안 함)
환경변수 ENTITY_ID_PLAIN_ENABLED=true 로 override 가능
DEV/LOCAL 기본값: true
PROD에서 활성화 시 → audit_events에 SECURITY_WARNING 기록
```

### 13.3 Key Rotation

- 주기: 30일 또는 SECURITY_ADMIN 수동 트리거
- 동시 활성 키: active (현재) + previous (전환 기간 유예)
- 키 상태: `ACTIVE` → `PREVIOUS` → `RETIRED`
- 회전 시 기존 해시는 유효 (재해시 없음, key_id로 추적)

### 13.4 DLQ 암호화

- 알고리즘: AES-256-GCM
- 키 관리: hmac_keys 테이블 (암호화 저장)
- 복호화 가능 주체: SECURITY_ADMIN 전용

---

## 14. 테스트 전략

| 테스트 종류 | 대상 | 도구 |
| ------- | -- | -- |
| Domain unit | 도메인 엔티티, VO | Jest |
| AST validator | SQL AST 파서 규칙 | Jest |
| PolicyEvaluator | ExecutionMode 결정 로직 | Jest |
| UseCase integration | DB + Kafka mocking | Jest + testcontainers |
| Load test | Projector throughput | k6 |
| Overload test | Concurrency controller 반응 | k6 |
| E2E | TUI → API → DB 전체 흐름 | Playwright + testcontainers |

---

## 15. e-commerce Mock 도메인

### State 엔티티

| 엔티티 | 테이블명 |
| --- | -- |
| Users | `state_users` |
| Products | `state_products` |
| Orders | `state_orders` |
| Payments | `state_payments` |
| Shipments | `state_shipments` |

### 이벤트 종류

| 이벤트 | 대상 엔티티 | 설명 |
| --- | ----- | -- |
| OrderCreated | orders | 주문 생성 |
| PaymentCaptured | payments | 결제 완료 |
| ProductAdjusted | products | 재고/가격 조정 |
| ShipmentStatusChanged | shipments | 배송 상태 변경 |

---

## 16. 배포 전략

### v1 (현재)

- Docker Compose
- 단일 인스턴스
- 로컬/DEV 환경 타겟

### v2 (예정)

- Kubernetes (Helm chart)
- 수평 확장 (Projector multi-replica)
- Managed Kafka (MSK/Confluent)

---

## 17. 개발 순서 (구현 로드맵)

```
Phase 1: 기반 인프라
  ├─ PostgreSQL DDL (전체 스키마)
  ├─ Kafka 연결 설정
  └─ Docker Compose 구성

Phase 2: 도메인 코어
  ├─ Change 엔진 도메인 모델
  ├─ SQL AST 파서 + 검증기
  ├─ PolicyEvaluator
  └─ RiskScorer

Phase 3: 스트리밍 파이프라인
  ├─ Projector (Kafka → PostgreSQL)
  ├─ DLQ 처리
  └─ Concurrency Controller

Phase 4: API 레이어
  ├─ REST API (Change CRUD)
  ├─ WebSocket (실시간 동기화)
  └─ SSE fallback

Phase 5: TUI
  ├─ 렌더링 엔진 (30fps)
  ├─ Scene 구현 (Explore/Monitor/Recovery/Audit)
  └─ 권한 기반 UI

Phase 6: Web Console
  ├─ Approval Inbox
  ├─ Policy Settings
  └─ DLQ Browser

Phase 7: 보안/운영
  ├─ HMAC key rotation
  ├─ AES-256 DLQ 암호화
  └─ Sidecar Remote Mode (JWT)
```

---

## 부록: 확정된 상수값 일람

```typescript
export const CONSTANTS = {
  // Change Engine
  BULK_CHANGE_THRESHOLD_ROWS: 1000,
  CHANGE_APPLIED_PKLISTMAX: 500,
  BACKUP_SNAPSHOT_TTL_DAYS: 7,

  // TUI
  TUI_TARGET_FPS: 30,
  TUI_FRAME_BUDGET_MS: 33.33,

  // Sidecar Remote
  SIDECAR_JWT_EXPIRY_SECONDS: 3600,
  SIDECAR_RATE_LIMIT_RPS: 100,

  // Entity ID
  ENTITY_ID_PLAIN_ENABLED_DEFAULT_PROD: false,
  ENTITY_ID_PLAIN_ENABLED_DEFAULT_DEV: true,

  // Concurrency
  DB_P95_LATENCY_HARD_LIMIT_MS: 200,
  CONNECTION_POOL_THROTTLE_PCT: 80,

  // Key Rotation
  HMAC_KEY_ROTATION_DAYS: 30,
} as const;
```
