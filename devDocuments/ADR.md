# ADR Index

| ADR | 제목 | 상태 |
|-----|------|------|
| [ADR-001](#adr-001) | v1 데이터베이스 PostgreSQL 단일 사용 | 확정 |
| [ADR-002](#adr-002) | Kafka 기반 이벤트 스트리밍 | 확정 |
| [ADR-003](#adr-003) | HMAC-SHA256 entity ID 익명화 | 확정 |
| [ADR-004](#adr-004) | ChangeRequest Aggregate 생명주기 | 확정 |
| [ADR-005](#adr-005) | ExecutionMode 3단계 정책 | 확정 |
| [ADR-006](#adr-006) | TUI-First + 30fps 렌더 루프 | 확정 |
| [ADR-007](#adr-007) | Optimistic UI + WebSocket 동기화 | 확정 |
| [ADR-008](#adr-008) | Sidecar Remote Mode JWT/API Key 인증 | 확정 |

---

<a name="adr-001"></a>
# ADR-001: v1 데이터베이스 PostgreSQL 단일 사용

- **상태**: 확정
- **결정일**: v1 설계 단계
- **결정자**: 팀 전체

## 맥락

실시간 스트리밍 데이터를 저장하고 상태를 투영하는 데이터 레이어가 필요했다. 후보군으로 PostgreSQL, MySQL, MongoDB, Cassandra, Redis가 검토됐다.

## 결정

v1에서는 PostgreSQL만 사용한다. 다른 DB는 v2 이후에 고려한다.

## 근거

PostgreSQL은 다음 기능을 단일 시스템으로 제공한다.

- **JSONB**: 이벤트 payload를 스키마 없이 저장하면서도 인덱싱 가능
- **UNIQUE constraint**: `(topic, partition, offset)` 조합으로 중복 이벤트 DB 레벨 방어
- **Row Level Security**: 역할별 접근 제어를 애플리케이션이 아닌 DB 레이어에서 수행
- **ON CONFLICT DO NOTHING / DO UPDATE**: 멱등적 upsert 원자적 처리
- **pgcrypto**: AES 암호화, HMAC 계산을 DB 내부에서 처리
- **트랜잭션**: events_raw INSERT + state UPSERT를 단일 트랜잭션으로 원자화

여러 DB를 도입하면 v1 범위에서 운영 복잡도가 불필요하게 높아진다.

## 결과

- Kafka offset commit 이전에 DB 트랜잭션을 완료함으로써 at-least-once + 멱등성을 달성한다.
- v2에서 수평 확장이 필요하면 read replica 또는 Citus 파티셔닝을 검토한다.

## 대안으로 고려했던 것

- **Cassandra**: 쓰기 throughput은 높지만 트랜잭션 없음 → 멱등성 보장이 복잡해짐
- **MongoDB**: JSONB와 유사하지만 RLS 기능 없음
- **Redis**: 캐시 레이어로는 적합하지만 영속성/감사 요구사항 부적합

---

<a name="adr-002"></a>
# ADR-002: Kafka 기반 이벤트 스트리밍

- **상태**: 확정
- **결정일**: v1 설계 단계

## 맥락

외부 시스템으로부터 도메인 이벤트를 수신해 DB에 투영하는 파이프라인이 필요했다. 후보로 Kafka, RabbitMQ, AWS SQS, PostgreSQL LISTEN/NOTIFY가 검토됐다.

## 결정

Kafka를 이벤트 스트리밍 레이어로 사용한다.

## 근거

- **오프셋 기반 재처리**: partition + offset으로 이벤트를 재처리할 수 있어 DLQ 구현이 자연스럽다
- **순서 보장**: 파티션 내 순서가 보장되어 entity 상태 투영 시 `updated_event_time_ms`와 결합해 충돌을 방지한다
- **Consumer Group**: Projector 수평 확장이 가능하다
- **내구성**: 이벤트가 Kafka에 보존되므로 Projector 재시작 시 누락 없이 재처리 가능

## 결과

- Projector는 `autoCommit: false`로 설정해 DB 커밋 완료 후 offset commit을 수행한다 (at-least-once)
- 중복 이벤트는 `UNIQUE (topic, partition, offset)` constraint로 무해하게 처리된다

## 대안으로 고려했던 것

- **RabbitMQ**: 메시지 순서 보장이 약하고 대용량 재처리 어려움
- **PostgreSQL LISTEN/NOTIFY**: 외부 시스템 연동 불가, 페이로드 크기 제한

---

<a name="adr-003"></a>
# ADR-003: HMAC-SHA256 entity ID 익명화

- **상태**: 확정
- **결정일**: v1 설계 단계

## 맥락

DB에 원본 user_id, order_id 등이 평문으로 저장되면 DB 유출 시 PII(개인식별정보)가 노출된다. 동시에 동일 entity를 식별하고 상태를 추적해야 한다.

## 결정

모든 entity ID를 `HMAC-SHA256(active_key, "entity_type:raw_id")`로 변환해 `entity_id_hash`로 저장한다. 원본 ID는 PROD에서 기본적으로 저장하지 않는다.

## 근거

- **단방향**: 해시에서 원본 ID를 역산할 수 없다
- **결정론적**: 동일 key + 동일 raw_id → 항상 동일 해시 → 상태 추적 가능
- **키 회전 가능**: key_id를 함께 저장하므로 키 회전 후에도 구 이벤트를 재처리 가능
- **검색 가능**: 특정 entity를 조회할 때 hash를 계산해 WHERE 조건에 사용

## entity_id_plain 정책 확정

- PROD 기본값: `false` (저장 안 함)
- 환경변수 `ENTITY_ID_PLAIN_ENABLED=true`로 override 가능
- PROD에서 활성화 시 `audit_events`에 `SECURITY_WARNING` 기록
- DEV/LOCAL 기본값: `true` (디버깅 편의)

## 결과

- 애플리케이션은 조회 시 raw_id를 hash로 변환한 뒤 DB 쿼리를 수행해야 한다
- key 회전 후 새 이벤트는 새 key로 해시되나, 기존 이벤트의 해시는 변경되지 않는다 (재해시 없음)

---

<a name="adr-004"></a>
# ADR-004: ChangeRequest Aggregate 생명주기

- **상태**: 확정
- **결정일**: v1 설계 단계

## 맥락

데이터 변경을 어떤 방식으로 모델링할지 선택해야 했다. 단순 CRUD 방식과 이벤트 소싱 방식 그리고 Aggregate 패턴이 검토됐다.

## 결정

ChangeRequest를 Aggregate Root로 모델링한다. 모든 상태 전이는 메서드를 통해서만 발생하며, 도메인 이벤트를 방출한다.

## 상태 전이 확정

```
DRAFT → PENDING_APPROVAL → APPROVED → WAITING_EXECUTION → EXECUTING → DONE
                         → APPROVED → EXECUTING (AUTO mode)
                                                          → FAILED → REVERTED
```

## 근거

- **불변 규칙 캡슐화**: WHERE 없는 변경 차단, ANALYST 생성 불가 등 비즈니스 규칙이 Aggregate 내부에 위치한다
- **감사 추적**: 모든 전이가 도메인 이벤트로 기록되어 감사 로그와 연동된다
- **낙관적 동시성**: Aggregate는 상태 전이 유효성 검사를 DB 트랜잭션과 결합해 동시 승인 충돌을 방지한다

## 결과

- `ChangeRequest.submit()`, `.approve()`, `.complete()` 등 명시적 메서드만 허용한다
- 직접 status 필드 수정은 컴파일 에러를 유발한다 (private `_status`)

---

<a name="adr-005"></a>
# ADR-005: ExecutionMode 3단계 정책

- **상태**: 확정
- **결정일**: v1 설계 단계

## 맥락

변경 요청이 승인된 이후 어떻게 실행할지 결정해야 했다. 단일 자동 실행 방식은 PROD 사고 위험이 높고, 모든 변경을 수동으로 처리하면 운영 부담이 크다.

## 결정

AUTO / CONFIRM / MANUAL 3단계 ExecutionMode를 도입한다. 환경 + 위험 레벨의 조합으로 자동 결정된다.

## 확정 정책 테이블

| 환경 | L0 | L1 | L2 |
|------|----|----|----|
| LOCAL | AUTO | AUTO | AUTO |
| DEV | AUTO | AUTO | CONFIRM |
| PROD | CONFIRM | CONFIRM | MANUAL |

추가 규칙:
- 영향 행 ≥ 1,000 (BULK_CHANGE) → 최소 CONFIRM 이상으로 상향
- ANALYST → 생성 자체 불가

## 근거

- PROD L2(고위험)는 DBA가 반드시 직접 실행해야 한다. 자동 실행 사고를 원천 차단한다
- PROD L0/L1도 CONFIRM을 요구해 오타 등 실수를 방지한다
- LOCAL/DEV는 개발 편의를 위해 AUTO를 허용한다

## 결과

- ExecutionMode는 PolicyEvaluator가 결정하며 요청자가 임의로 변경할 수 없다
- UI는 ExecutionMode를 항상 명시적으로 표시한다

---

<a name="adr-006"></a>
# ADR-006: TUI-First + 30fps 렌더 루프

- **상태**: 확정
- **결정일**: v1 설계 단계

## 맥락

데이터 콘솔의 메인 인터페이스를 무엇으로 할지 선택해야 했다. Web-only, TUI-only, TUI+Web 하이브리드가 검토됐다.

## 결정

TUI를 메인 인터페이스로 한다. Web은 승인/정책/보안 관리 전용 보조 UI다. TUI 렌더 루프는 30fps cap을 적용한다.

## 근거 (TUI-First)

- 운영/DBA는 서버에 직접 SSH 접속해 작업하는 경우가 많아 TUI가 자연스러운 워크플로우에 맞는다
- 브라우저 없이 동작하므로 배포 복잡도가 낮다
- 실시간 스트리밍 데이터를 터미널에서 직접 탐색하는 것이 핵심 UX 가치다

## 근거 (30fps cap)

- 스트리밍 이벤트가 초당 수백 개 발생할 때 무제한 렌더는 CPU 스파이크를 유발한다
- 60fps는 터미널 환경에서 체감 차이가 없다
- dirty flag + 33ms 타이머 방식으로 이벤트가 없으면 렌더를 생략한다
- PAUSED 모드에서는 렌더를 완전히 중단해 추가 절약한다

## 결과

- Web Console이 없어도 핵심 기능(탐색/변경/모니터링)은 TUI만으로 완결된다
- 렌더 프레임이 33ms를 초과하면 느린 프레임 경고를 개발 모드에서 로그한다

---

<a name="adr-007"></a>
# ADR-007: Optimistic UI + WebSocket 동기화

- **상태**: 확정
- **결정일**: v1 설계 단계

## 맥락

변경 적용 후 UI를 어떻게 동기화할지 결정해야 했다. 폴링(polling), 서버 푸시(SSE/WebSocket), Optimistic UI 세 가지 방식이 검토됐다.

## 결정

WebSocket(기본) / SSE(fallback) + Optimistic UI 조합을 사용한다. pkList가 500개를 초과하면 전체 뷰포트 refetch로 전환한다.

## 확정 정책

- pkList ≤ 500: ID 기반 선택적 micro-batch refetch
- pkList > 500 (`pkListTruncated: true`): 뷰포트 전체 fast reload
- 클라이언트 큐 100개 초과: OVERLOAD_WARNING 전송 + 큐 초기화

## 근거

- **Optimistic UI**: 사용자는 변경이 즉시 반영되는 것처럼 느낀다. 실패 시 롤백한다
- **WebSocket vs 폴링**: 폴링은 불필요한 DB 부하와 지연이 발생한다
- **500개 pkList 제한**: WebSocket 메시지 크기를 제어하고, 대량 변경 시 클라이언트 파싱 부담을 줄인다
- **SSE fallback**: WebSocket을 지원하지 않는 환경(프록시 차단 등)에서 동작을 보장한다

## 결과

- ChangeApplied 이벤트 수신 후 UI는 서버와 최종 일관성을 유지한다
- Overload 상태에서 클라이언트는 전체 reload를 수행해 일관성을 복구한다

---

<a name="adr-008"></a>
# ADR-008: Sidecar Remote Mode JWT/API Key 인증

- **상태**: 확정
- **결정일**: v1 미결정 항목 확정 단계

## 맥락

Sidecar Remote Mode(C)는 팀이 공유하는 원격 Sidecar 인스턴스다. 이 인스턴스에 어떻게 인증할지 결정해야 했다. 사내망 제한(VPN/IP whitelist) vs 토큰 기반이 검토됐다.

## 결정

JWT Bearer 토큰 또는 API Key 방식을 지원한다. TLS는 필수다.

## 근거

- **토큰 기반이 사내망 제한보다 유연하다**: VPN/IP whitelist는 클라우드 환경, 재택 근무, 다중 사무소 환경에서 관리가 복잡해진다
- **API Key**: 장기 자격증명이 필요한 자동화/스크립트에 적합하다. SECURITY_ADMIN이 발급/폐기한다
- **JWT**: 단기 자격증명(1시간)으로 만료가 자동 처리된다. 사람이 사용하는 경우에 적합하다
- **TLS 필수**: 토큰이 평문 전송되는 것을 방지한다

## 세부 정책

- JWT 만료: 1시간, refresh token으로 갱신
- API Key: `sck_` 접두사, SHA-256 해시로 DB 저장 (평문 미저장)
- Rate limit: 연결당 100 req/s
- 발급/폐기 이력: audit_events `SIDECAR_KEY_ISSUED` / `SIDECAR_KEY_REVOKED`

## 결과

- v1에서 Sidecar Remote Mode는 선택적 기능이다. 기본 모드는 Managed(B)다
- Remote Mode 사용 시 API Key 또는 JWT 중 하나를 반드시 제공해야 연결된다

---

*이 문서는 결정이 변경될 때마다 갱신한다. 새 ADR은 ADR-009부터 번호를 부여한다.*
