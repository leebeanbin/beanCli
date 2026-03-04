# beanCLI — Terminal-First Database Console

> 터미널에서 PostgreSQL · MySQL · SQLite · MongoDB · Redis 를 하나의 인터페이스로 탐색하고, SQL 변경을 심사·실행·감사하는 개발자 도구.

```
╔══ beanCLI v0.1.2 ═══════════════════════════════════════════════════╗
║ Schema [1]     ║  Query Editor [2]                                  ║
║────────────────║────────────────────────────────────────────────────║
║ > state_users  ║  1 │ SELECT *                                      ║
║   state_orders ║  2 │   FROM "state_orders"                        ║
║   state_prod.. ║  3 │  WHERE status = 'EXECUTING'                  ║
║   payments     ║  4 │  LIMIT 50;                    Enter: execute ║
║   shipments    ╠════════════════════════════════════════════════════╣
║   audit_events ║  Results [3]                                       ║
║   dlq_events   ║  entity_id_hash    status       total_cents        ║
║                ║  > a3f7c2...       EXECUTING    $1,249.00          ║
║                ║    b8e1d4...       DONE         $89.99             ║
╠════════════════╬════════════════════════════════════════════════════╣
║ AI · beanllm[4]║  PG  leebeanbin (pg) › state_orders   DBA   dev   ║
╚════════════════╩════════════════════════════════════════════════════╝
```

---

## 특징

|                   |                                                  |
| ----------------- | ------------------------------------------------ |
| **5개 DB 지원**   | PostgreSQL · MySQL · SQLite · MongoDB · Redis    |
| **3-패널 TUI**    | Schema 트리 / SQL 에디터 / 결과 뷰어             |
| **CRUD**          | 행 탐색·편집·삽입·삭제 (역할 기반)               |
| **변경 심사**     | SQL → 위험도 평가 → AUTO / CONFIRM / MANUAL 실행 |
| **AI 어시스턴트** | beanllm SSE 스트리밍 (자연어 → SQL)              |
| **감사 로그**     | 모든 변경 이력 불변 기록                         |
| **Mock 모드**     | DB 없이 즉시 실행 (개발·데모용)                  |

---

## 빠른 시작

### 요구사항

```
Node.js ≥ 20   |   pnpm 10.28.1   |   Docker (인프라용, Mock 모드는 불필요)
```

### 설치 & 실행

```bash
# 1. 최초 셋업 (설치 + 글로벌 등록 + Docker 시작)
pnpm setup

# 2a. Mock 모드 — DB/API 없이 즉시 실행 (권장: 첫 실행)
beancli --mock

# 2b. 실제 모드 — Docker 인프라 필요
beancli

# 전체 스택 (API + Projector + Worker + TUI)
pnpm dev:all
```

> `**beancli`를 처음 등록할 때\*\*: `pnpm setup` 이후 새 터미널을 열면 바로 사용 가능.
> 이미 설치된 경우: `pnpm link:global` 한 번만 실행하면 됩니다.

---

## 부팅 흐름

```
앱 시작
  └─ ConnectionPicker (저장된 연결 목록 또는 새 연결 추가)
       └─ 연결 성공
            └─ DatabasePicker (서버의 데이터베이스 선택)
                 └─ TablePicker (테이블 선택)
                      └─ 메인 3-패널 UI
```

---

## 키보드 단축키

### 글로벌

| 키                  | 동작               |
| ------------------- | ------------------ |
| `Ctrl+P`            | 커맨드 팔레트      |
| `?`                 | 전체 단축키 도움말 |
| `Tab` / `Shift+Tab` | 패널 이동          |
| `q`                 | 종료               |

### 패널 포커스

| 키  | 패널                 |
| --- | -------------------- |
| `1` | Schema (테이블 목록) |
| `2` | Query Editor         |
| `3` | Results              |
| `4` | AI 어시스턴트        |

### 모드 전환

| 키  | 모드                  |
| --- | --------------------- |
| `t` | 테이블 피커           |
| `b` | Browse (행 탐색)      |
| `m` | Monitor (스트림 상태) |
| `A` | Audit 로그            |
| `R` | DLQ Recovery          |
| `I` | Index Lab             |

### SQL 에디터

| 키                  | 동작               |
| ------------------- | ------------------ |
| `Enter`             | SQL 실행           |
| `Shift+Enter`       | 줄 바꿈            |
| `↑` / `↓` (빈 버퍼) | 히스토리           |
| `Ctrl+A` / `Ctrl+E` | 줄 처음/끝         |
| `\dt`               | 테이블 목록        |
| `\d <table>`        | 스키마 조회        |
| `\x`                | Expanded mode 토글 |

### Browse / Explore 모드

| 키        | 동작                              |
| --------- | --------------------------------- |
| `j` / `k` | 행 이동                           |
| `h` / `l` | 컬럼 이동                         |
| `Enter`   | 행 상세                           |
| `e`       | 편집 (DBA/MANAGER)                |
| `i`       | 삽입 (DBA/MANAGER)                |
| `D`       | 삭제 (DBA)                        |
| `Q`       | 현재 테이블 SELECT → Query Editor |
| `r`       | 새로고침                          |
| `f`       | 필터                              |

---

## 지원 DB

| 타입         | 기본 포트 | 특이사항                                    |
| ------------ | --------- | ------------------------------------------- |
| `postgresql` | 5432      | 완전 지원. Pool max=2                       |
| `mysql`      | 3306      | MariaDB 호환. 백틱 인용                     |
| `sqlite`     | —         | `node:sqlite` 내장 모듈 사용                |
| `mongodb`    | 27017     | 컬렉션 = 테이블                             |
| `redis`      | 6379      | 키 접두어 = 테이블. HASH·LIST·SET·ZSET 지원 |

---

## 프로젝트 구조

```
apps/
  cli/              ← TUI 진입점 (index-ink.tsx)
  api/              ← Fastify REST + WebSocket (port 3100)
  projector/        ← Kafka → PostgreSQL state projector
  recovery-worker/  ← DLQ 재처리기

packages/
  tui/              ← Ink 기반 TUI (현재 개발 중심)
  kernel/           ← 공유 타입, Result<T,E>, ErrorCode
  domain/           ← DDD 집합체 (ChangeRequest 등)
  application/      ← 유스케이스, 포트 인터페이스
  infrastructure/   ← DB 어댑터 (PG, MySQL, SQLite, MongoDB, Redis)
  policy/           ← ExecutionMode × RiskScore 정책
  audit/            ← 불변 감사 로그
  dsl/              ← SQL AST 파서 + WHERE 강제
  sql/              ← DDL 마이그레이션 001–010
  ui-tui/           ← (구 canvas TUI — 삭제 예정)
```

---

## 변경 심사 흐름

```
SQL 제출
  └─ AST 파서 (WHERE 절 없는 UPDATE/DELETE 차단)
       └─ 위험도 평가
            ├─ L0: rows < 10   → AUTO 즉시 실행
            ├─ L1: 10 ≤ rows < 1000 → CONFIRM 사용자 확인
            └─ L2: rows ≥ 1000 또는 DDL → MANUAL 승인 워크플로
                 └─ 실행 → 감사 로그 기록 → Kafka 이벤트
```

### 환경별 실행 정책

| 환경        | L0      | L1      | L2      |
| ----------- | ------- | ------- | ------- |
| LOCAL / DEV | AUTO    | AUTO    | CONFIRM |
| PROD        | CONFIRM | CONFIRM | MANUAL  |

---

## 역할 (RBAC)

| 역할             | SELECT | INSERT | UPDATE | DELETE | DDL |
| ---------------- | ------ | ------ | ------ | ------ | --- |
| `ANALYST`        | ✅     |        |        |        |     |
| `MANAGER`        | ✅     | ✅     | ✅     |        |     |
| `DBA`            | ✅     | ✅     | ✅     | ✅     | ✅  |
| `SECURITY_ADMIN` | ✅     |        |        |        |     |

---

## 보안

- **연결 파일**: `~/.config/beanCli/connections.json` — AES-256-GCM 암호화, chmod 600
- **엔티티 ID**: HMAC-SHA256 해시 (평문 ID 저장 안 함 — `ENTITY_ID_PLAIN_ENABLED` 제어)
- **SQL 인젝션**: 파라미터화 쿼리 + quoteIdent() 식별자 인용
- **감사 로그**: `audit_events` 테이블 — 애플리케이션 레이어에서 UPDATE/DELETE 권한 없음
- **쿼리 타임아웃**: 전 어댑터 30s 하드 킬 (PG·MySQL·MongoDB·Redis), 결과 5,000행 상한
- **Rate Limiting**: `@fastify/rate-limit` — 전역 60 req/min, `/auth/login` 5/min, `/connections/test` 10/min
- **로거 redact**: Fastify pino — `authorization`, `password`, `credential`, `secret` 필드 자동 마스킹
- **KeyStore 캐시**: `CachedKeyStore` — DB 조회 없이 TTL 5분 인메모리 캐시 (3–10× 처리량 향상)

---

## 개발 커맨드

```bash
# ── TUI 실행 ─────────────────────────────────────────────────
beancli               # 실제 모드 (API + DB 필요)
beancli --mock        # Mock 모드 (외부 서비스 불필요)
MOCK=true beancli     # 환경변수로 mock 지정

# ── 개발 watch 모드 (소스 변경 시 자동 재시작) ─────────────
pnpm dev:cli          # TUI watch (실제 모드)
pnpm dev:mock         # TUI watch (Mock 모드)
pnpm dev:all          # 전체 스택 watch

# ── 빌드 & 타입 체크 ────────────────────────────────────────
pnpm build                                    # Turbo 전체 빌드
pnpm --filter @tfsdc/tui exec tsc --noEmit    # TUI 타입 체크
pnpm --filter @tfsdc/cli exec tsc --noEmit    # CLI 타입 체크

# ── 테스트 ──────────────────────────────────────────────────
pnpm test                                     # 전체
pnpm test:watch                               # TDD watch 모드
pnpm test -- --testPathPattern="ExplorePanel"

# ── Lint / Format ────────────────────────────────────────────
pnpm lint && pnpm lint:fix
pnpm format

# ── DB / Docker ──────────────────────────────────────────────
pnpm docker:up && pnpm docker:wait
pnpm db:migrate
pnpm docker:reset                     # 볼륨 초기화 + 재시작

# ── 글로벌 커맨드 등록 ───────────────────────────────────────
pnpm link:global                      # beancli를 전역 PATH에 등록
```

---

## Claude Code 커스텀 커맨드

`.claude/commands/` 에 등록된 슬래시 커맨드:

| 커맨드       | 설명                      |
| ------------ | ------------------------- |
| `/commit`    | 테마별 커밋 가이드라인    |
| `/typecheck` | 전 패키지 TypeScript 검사 |
| `/test`      | 테스트 실행 가이드        |
| `/issue`     | GitHub Issue/PR 생성      |
| `/seed`      | DB 시드 데이터 투입       |
| `/perf`      | 성능 점검                 |

---

## API (앱 api)

Base URL: `http://localhost:3100`

| Method | Path                          | 설명                 |
| ------ | ----------------------------- | -------------------- |
| `POST` | `/api/v1/changes`             | SQL 변경 제출        |
| `GET`  | `/api/v1/changes`             | 변경 목록            |
| `POST` | `/api/v1/changes/:id/execute` | 승인된 변경 실행     |
| `GET`  | `/api/v1/audit`               | 감사 로그            |
| `GET`  | `/api/v1/health`              | 헬스체크             |
| `GET`  | `/api/v1/monitoring/metrics`  | DB 지연·풀 상태      |
| `WS`   | `/ws`                         | 실시간 이벤트 스트림 |

---

## 환경 변수

| 변수                      | 기본값                  | 설명                     |
| ------------------------- | ----------------------- | ------------------------ |
| `APP_ENV`                 | `dev`                   | `local` / `dev` / `prod` |
| `DATABASE_URL`            | —                       | PostgreSQL 연결 문자열   |
| `KAFKA_BROKER`            | `localhost:9092`        | Kafka 부트스트랩         |
| `JWT_SECRET`              | —                       | HS256 서명 키            |
| `ENTITY_ID_PLAIN_ENABLED` | `true` (dev)            | 평문 ID 저장 여부        |
| `API_URL`                 | `http://localhost:3100` | TUI → API 주소           |
| `MOCK`                    | —                       | `true` 설정 시 Mock 모드 |

---

## Docker 인프라

| 서비스        | 포트 | 설명                 |
| ------------- | ---- | -------------------- |
| PostgreSQL 15 | 5432 | 주 데이터베이스      |
| Kafka         | 9092 | 이벤트 스트리밍      |
| Kafka UI      | 8080 | Kafka 브라우저 (dev) |
| Zookeeper     | 2181 | Kafka 코디네이션     |

---

## 로드맵

| 항목                                                                        | 상태    |
| --------------------------------------------------------------------------- | ------- |
| Ink TUI 3-패널 레이아웃                                                     | ✅ Done |
| 5개 DB 어댑터                                                               | ✅ Done |
| CRUD (e/i/D) + 역할 제어                                                    | ✅ Done |
| 멀티라인 SQL 에디터                                                         | ✅ Done |
| AI 패널 (beanllm SSE)                                                       | ✅ Done |
| ConnectionPicker → DatabasePicker 흐름                                      | ✅ Done |
| SEC-005: 쿼리 타임아웃 + 행 수 제한 (전 어댑터)                             | ✅ Done |
| SEC-006: Fastify 로거 자격증명 redact                                       | ✅ Done |
| CachedKeyStore: AES/HMAC KeyStore TTL 캐시 (5분)                            | ✅ Done |
| API rate limiting: 전역 60/min + 민감 엔드포인트 강화                       | ✅ Done |
| QueryResult.warning + ResultPanel amber 경고 UI                             | ✅ Done |
| 쿼리 히스토리 파일 저장 (~/.config/beanCli/history.json)                    | ✅ Done |
| ARCH-006: 구 ui-tui 패키지 삭제                                             | ✅ Done |
| `beancli` 글로벌 커맨드 (`pnpm setup` → `beancli`)                          | ✅ Done |
| Web Console (Next.js) — State 테이블 뷰어, Changes, Approvals, Audit        | ✅ Done |
| Web Console — WebSocket LiveTableRefresh (router.refresh 자동 갱신)         | ✅ Done |
| Web Console — RBAC AccessGuard (parseRole + hasAccess 페이지 접근 제어)     | ✅ Done |
| Web Console — Recovery 페이지 개선 (Client Component, Clone 버튼, SQL 접기) | ✅ Done |
| ui-web — WsEventManager + ApiClient + useAccessControl 단위 테스트          | ✅ Done |
