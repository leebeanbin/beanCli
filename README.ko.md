<div align="center">

```
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║    ◈  B E A N C L I    —    터미널 우선 데이터베이스 콘솔                 ║
║                                                                          ║
║    9가지 DB  ·  Ink TUI  ·  Next.js 웹  ·  AI 어시스턴트                ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

[![Node](https://img.shields.io/badge/Node-%3E%3D20.0-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-10.28.1-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io)
[![Turbo](https://img.shields.io/badge/Turbo-2.8-EF4444?style=flat-square&logo=turborepo&logoColor=white)](https://turbo.build)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/leebeanbin/beanCli?style=flat-square&color=brightgreen)](https://github.com/leebeanbin/beanCli/commits/master)

**하나의 콘솔로 모든 데이터베이스를 — 터미널에서도, 브라우저에서도.**

[English →](README.md)

</div>

---

## 두 개의 인터페이스, 하나의 코드베이스

BeanCLI는 **동일한 기능**을 두 가지 방식으로 제공합니다. 터미널에 익숙한 개발자는 TUI를, 팀원과 협업할 때는 웹 콘솔을 사용할 수 있습니다.

```
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│         ◈  TUI  (Ink)           │     │      ◈  웹 콘솔  (Next.js)       │
│─────────────────────────────────│     │──────────────────────────────────│
│  • 키보드 중심, 30fps            │     │  • 레트로 게임보이 스타일 UI      │
│  • 3-패널 레이아웃               │     │  • 14개 페이지, 다크/라이트 테마  │
│  • 멀티라인 SQL 에디터            │     │  • 마우스 + 키보드               │
│  • psql 메타 커맨드              │     │  • CSV / JSON 다운로드           │
│  • 실시간 AI 채팅 패널           │     │  • ◈ AI 플로팅 위젯              │
│  • 변경 / 승인 패널              │     │  • 변경 상태 필터 탭              │
│  • 인덱스 랩 (생성 / 삭제)       │     │  • 인덱스 사용률 % 바            │
│  • 비밀번호 변경 오버레이         │     │  • AI 응답에서 바로 SQL 실행     │
│                                 │     │                                  │
│  beancli --mock                 │     │  pnpm dev:web  →  :3000          │
└─────────────────────────────────┘     └──────────────────────────────────┘
```

---

## TUI 미리보기

<div align="center">
  <img src="docs/perform_beancli.gif" alt="BeanCLI TUI 데모" width="720" />
</div>

실제 터미널에서 이렇게 보입니다. 왼쪽은 스키마 트리, 가운데는 SQL 에디터, 오른쪽 하단은 결과 테이블입니다.

```
┌─ BeanCLI v0.1.2 ───────────────────────────────────────────────────────────┐
│ [1] 스키마              │ [2] 쿼리 에디터                                    │
│─────────────────────────│────────────────────────────────────────────────────│
│ ◉ tfsdc_demo            │  1│ SELECT u.username, o.status,                   │
│  ├─ state_users   25    │  2│        o.total_cents                           │
│  ├─ state_orders  40    │  3│   FROM state_users u                           │
│  ├─ state_products 18   │  4│   JOIN state_orders o USING (user_id)          │
│  ├─ state_payments      │  5│  WHERE o.status = 'EXECUTING'                  │
│  ├─ state_shipments     │  6│  LIMIT 50;                                     │
│  ├─ events_raw    60    │────────────────────────────────────────────────────│
│  ├─ audit_events  30    │ [3] 결과  6행 · 12ms                               │
│  └─ dlq_events     8    │  username    status       total_cents               │
│─────────────────────────│  ▶ alice     EXECUTING    $1,249.00                 │
│ ◈ AI 어시스턴트 [4]     │    bob       DONE           $89.99                  │
│────────────────────────────────────────────────────────────────────────────│
│ PG  leebeanbin/tfsdc_demo   DBA   dev    [?] 도움말  [Ctrl+P] 팔레트  [q] 종료│
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 빠른 시작

```bash
# ① 클론 & 설치
git clone https://github.com/leebeanbin/beanCli && cd beanCli
pnpm setup                  # 설치 + 글로벌 링크 + docker 시작

# ② 실행 (DB 없이도 OK)
beancli --mock              # 샘플 데이터로 전체 TUI 실행

# ③ 또는 웹 콘솔 실행
pnpm dev:web                # → http://localhost:3000

# ④ 풀 스택 (API + Kafka + DB + TUI)
pnpm dev:all
```

> **이미 설치됐나요?** `pnpm link:global` 한 번 실행 후 `beancli --mock`.

---

## 기능 한눈에 보기

```
┌──────────────────────────────────────────────────────────────────────────┐
│  데이터베이스         인터페이스           생산성              보안        │
│──────────────────────────────────────────────────────────────────────────│
│  PostgreSQL   ●     TUI (Ink/React) ●   AI 어시스턴트  ●  JWT + RBAC ●  │
│  MySQL        ●     웹 (Next.js)   ●   변경 검토     ●  AES-256-GCM ●  │
│  SQLite       ●     Mock 모드      ●   감사 로그      ●  요청 제한   ●  │
│  MongoDB      ●     플러그인 API   ●   CSV/JSON 내보내기● SQL 가드   ●  │
│  Redis        ●     한/영 i18n     ●   EXPLAIN 트리   ●  행 상한     ●  │
│  Kafka        ●     다크/라이트 UI ●   DLQ 복구       ●  로그 난독화 ●  │
│  RabbitMQ     ●     WebSocket 실시간●  인덱스 랩      ●  인자 가드   ●  │
│  Elasticsearch●     게임보이 쉘    ●   비밀번호 변경  ●              │  │
│  NATS         ●                         SSE 스트리밍   ●              │  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 지원 데이터베이스

9가지 DB 타입을 동일한 인터페이스로 조작할 수 있습니다. 각 어댑터는 OCP 레지스트리 패턴으로 등록되어, 플러그인으로 커스텀 어댑터를 추가할 수도 있습니다.

```
┌──────────────────┬──────┬──────────────────────────────────────────────┐
│ 타입             │ 포트 │ 비고                                          │
├──────────────────┼──────┼──────────────────────────────────────────────┤
│ postgresql  [PG] │ 5432 │ 완전 지원 · 풀 max=2 · 스키마 카탈로그       │
│ mysql       [MY] │ 3306 │ MariaDB 호환 · 백틱 쿼팅                    │
│ sqlite      [SQ] │  —   │ node:sqlite 내장 · 파일 또는 :memory:        │
│ mongodb     [MG] │27017 │ 컬렉션 → 테이블 · admin listDatabases        │
│ redis       [RD] │ 6379 │ HASH·LIST·SET·ZSET·STRING · 키 프리픽스      │
│ kafka       [KF] │ 9092 │ 토픽 목록 · 임시 컨슈머 메시지 조회          │
│ rabbitmq    [RB] │ 5672 │ Management API + AMQP 채널 큐 탐색          │
│ elasticsearch[ES]│ 9200 │ 인덱스 목록 · {}로 네이티브 JSON 쿼리        │
│ nats        [NT] │ 4222 │ JetStream 스트림 · 풀 컨슈머                 │
└──────────────────┴──────┴──────────────────────────────────────────────┘
```

> **데이터베이스 선택 단계 건너뜀** (바로 테이블 피커로): sqlite · redis · kafka · rabbitmq · elasticsearch · nats

---

## TUI 시작 흐름

TUI 첫 실행 시 아래 순서로 연결 설정을 안내합니다. 연결 정보는 `~/.config/beanCli/connections.json`에 AES-256-GCM으로 암호화 저장됩니다.

```
  beancli
     │
     ▼
  ╔══════════════════╗
  ║  연결 피커       ║  ← j/k 이동  n 추가  d 삭제  * 기본값  Enter 연결
  ╚══════════════════╝
        │ Enter (연결)
        ▼
  ╔══════════════════╗
  ║  데이터베이스 피커║  ← j/k 이동  n 생성  d 삭제  Enter 선택
  ╚══════════════════╝       (sqlite / redis / kafka 등은 건너뜀)
        │ Enter (DB 선택)
        ▼
  ╔══════════════════╗
  ║  테이블 피커     ║  ← j/k  g/G 상단/하단  / 필터  Enter 열기
  ╚══════════════════╝
        │ Enter (테이블 열기)
        ▼
  ╔══════════════════════════════════════════════════════════╗
  ║  메인 3-패널 UI                                          ║
  ║  [1] 스키마  │  [2] 쿼리 + [3] 결과  │  [4] AI           ║
  ║              └── 모드: b·m·A·R·I·C·P                    ║
  ╚══════════════════════════════════════════════════════════╝
```

---

## 아키텍처

순수 DDD 레이어드 아키텍처를 채택합니다. 의존성은 단방향이며 순환이 없습니다.

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  apps/                                                               │
 │    cli/          ← TUI 진입점 (index-ink.tsx) — beancli 바이너리    │
 │    api/          ← Fastify REST + WebSocket  (포트 3100)             │
 │    web/          ← Next.js 15 웹 콘솔        (포트 3000)             │
 │    projector/    ← Kafka → PostgreSQL 상태 프로젝터                  │
 │    recovery-worker/ ← DLQ 재처리기                                   │
 ├──────────────────────────────────────────────────────────────────────┤
 │  packages/                                                           │
 │    tui/          ← Ink TUI 컴포넌트 + IConnectionService             │
 │    kernel/       ← 공유 타입 · Result<T,E> · ErrorCode               │
 │    domain/       ← DDD 애그리게이트  (ChangeRequest 상태 머신)        │
 │    application/  ← 유스케이스 · 포트 인터페이스                       │
 │    infrastructure/ ← DB 어댑터 (9가지) · OCP 레지스트리               │
 │    policy/       ← ExecutionMode × RiskScore 매트릭스                │
 │    audit/        ← 불변 감사 이벤트 기록기                            │
 │    dsl/          ← SQL AST 파서 · WHERE 강제 적용                    │
 │    sql/          ← DDL 마이그레이션 001–006                           │
 │    ui-web/       ← 웹 콘솔 공유 React 컴포넌트                        │
 └──────────────────────────────────────────────────────────────────────┘

  의존성 방향 (순환 없음):

  kernel ──► domain ──► application ──► infrastructure
                                   ▲
                    policy · audit · dsl  (리프 패키지)

  앱은 최상위에서 패키지에 의존. 패키지가 앱을 참조하지 않음.
```

---

## 웹 콘솔 페이지

레트로 게임보이 스타일의 UI를 가진 14개 페이지로 구성됩니다. 모든 페이지는 JWT 인증으로 보호됩니다.

```
┌─────────────┬──────────────┬──────────────────────────────────────────────┐
│ 페이지      │ 경로         │ 주요 기능                                    │
├─────────────┼──────────────┼──────────────────────────────────────────────┤
│ Dashboard   │ /            │ API 상태 · 저장된 연결 현황                   │
│ Query       │ /query       │ SQL 에디터 · [Explain] 버튼 · CSV/JSON 다운로드│
│             │              │ ?sql= 딥링크 (AI 페이지에서 연결)             │
│ Explore     │ /explore     │ 테이블 탐색 · 실시간 행 필터 · 인라인 편집   │
│             │              │ 행 삽입/삭제 · 테이블 생성 모달              │
│ Schema      │ /schema      │ 컬럼 타입 · EXPLAIN ANALYZE 트리 뷰          │
│ Monitor     │ /monitor     │ 스트림 통계 · SSE 실시간 카운터              │
│ Indexes     │ /indexes     │ 인덱스 목록 (사용률 % 바) · 생성 · 삭제      │
│ Audit       │ /audit       │ 불변 감사 로그 · 카테고리 필터               │
│ Recovery    │ /recovery    │ DLQ 실패 변경사항 재제출                     │
│ AI          │ /ai          │ 스트리밍 채팅 · [Run SQL] 버튼               │
│ Changes     │ /changes     │ 상태 탭 (ALL/DRAFT/PENDING/APPROVED/…)       │
│             │              │ FAILED 행에 [Revert] 버튼                    │
│ Approvals   │ /approvals   │ 승인 대기 큐 · 승인 / 거절                   │
│ Auth        │ /auth        │ 로그인 폼 · 개발 계정 힌트 (JWT 24h)         │
│ Connections │ /connections │ API URL 설정 · 연결 테스트                   │
│ Admin/Users │ /admin/users │ 생성 · 이름 변경 · 비활성화 (DBA 전용)       │
└─────────────┴──────────────┴──────────────────────────────────────────────┘
```

---

## 키보드 단축키

### 전역

```
  Ctrl+P  ── 커맨드 팔레트          ?  ── 전체 단축키 오버레이
  Tab     ── 다음 패널              q  ── 종료 (SQL 에디터 밖에서)
  1 / 2 / 3 / 4  ── 스키마 / 쿼리 / 결과 / AI 패널 포커스
```

### 모드 전환

```
  b ── Browse (행 탐색)         m ── 스트림 모니터
  I ── 인덱스 랩                A ── 감사 로그
  R ── DLQ Recovery             C ── 변경 요청
  P ── 승인 대기                t ── 테이블 피커
```

### SQL 에디터 (패널 2)

```
  Enter         쿼리 실행              Shift+Enter  새 줄
  ↑ / ↓        히스토리 탐색           Ctrl+L       에디터 초기화
  Ctrl+A / E   줄 시작 / 끝           ← / →        커서 이동

  \dt              테이블 목록          \d <테이블>   테이블 구조
  \x               확장 모드 토글       \ping         응답 시간 테스트
  \status          연결 정보            \q            종료
  \export csv|json <파일>   결과셋 내보내기
  \explain <sql>            EXPLAIN ANALYZE 인라인 실행
  \pw                       비밀번호 변경 (3단계 오버레이)
```

### Browse / Explore 모드 (패널 3)

```
  j / k  행 이동      h / l  열 이동       Enter  행 상세
  e      행 편집      i      행 삽입         D     행 삭제
  Q      현재 테이블 SELECT → 쿼리 에디터    r     새로고침
```

### 인덱스 랩 (`I` 모드)

```
  n  인덱스 생성  (테이블 → 컬럼 → 이름, 3단계 인라인 폼)
  d  선택된 인덱스 삭제  (y / N 확인 프롬프트)
  f  탭 전환  (인덱스 ↔ 테이블 통계)
  /  필터    r  새로고침
```

### 변경 패널 (`C`)

```
  j / k  탐색   n  새 요청   s  제출 (DRAFT→PENDING)
  x  실행       r  되돌리기  f  상태 필터 순환   R  새로고침
```

---

## 변경 검토 워크플로우

BeanCLI의 핵심 기능 중 하나입니다. 모든 DML 쿼리는 AST 파서를 거쳐 위험도를 평가받고, 환경과 위험 수준에 따라 자동 실행 또는 승인 워크플로우로 분기됩니다.

```
  사용자가 SQL 제출
        │
        ▼
  ┌─────────────────────────────────────┐
  │  AST 파서                           │
  │  • WHERE 없는 UPDATE/DELETE 차단    │
  │  • 스키마 변경 감지                 │
  └──────────────────┬──────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────┐
  │  위험도 평가                        │
  │  L0: 행 수 < 10                     │
  │  L1: 10 ≤ 행 수 < 1000             │
  │  L2: 행 수 ≥ 1000  OR  DDL 변경    │
  └──────────┬─────────────┬────────────┘
             │             │
    ┌────────┘             └────────┐
    ▼                               ▼
 L0 / L1 (dev)                   L2 / prod
 ┌──────────┐                 ┌───────────────┐
 │  AUTO    │                 │  MANUAL       │
 │ 즉시 실행 │                 │ 승인 큐       │
 │          │                 │ C 패널 / 웹   │
 └────┬─────┘                 └──────┬────────┘
      │                              │ 승인됨
      ▼                              ▼
  ┌──────────────────────────────────────┐
  │  실행 → audit_events → Kafka 메시지  │
  └──────────────────────────────────────┘
```

### 환경별 실행 정책

```
  ┌──────────────┬────────┬────────┬────────┐
  │ 환경         │  L0    │  L1    │  L2    │
  ├──────────────┼────────┼────────┼────────┤
  │ LOCAL / DEV  │  AUTO  │  AUTO  │CONFIRM │
  │ PROD         │CONFIRM │CONFIRM │ MANUAL │
  └──────────────┴────────┴────────┴────────┘
```

---

## TUI ↔ 웹 기능 대응표

두 인터페이스가 지원하는 기능을 비교합니다. UX 방식은 달라도 동일한 작업이 가능합니다.

```
  기능                            TUI                웹
  ─────────────────────────────────────────────────────────────────
  SQL 에디터                      ✅ 멀티라인         ✅ textarea
  EXPLAIN ANALYZE                 ✅ \explain         ✅ [Explain] 버튼
  결과 내보내기 (CSV/JSON)         ✅ \export          ✅ 다운로드 버튼
  테이블 탐색 + 필터              ✅ j/k + /          ✅ 테이블 + 입력창
  행 편집 / 삽입 / 삭제           ✅ e/i/D 키         ✅ 모달 + 버튼
  AI 어시스턴트                   ✅ 패널 4           ✅ /ai + 위젯
  AI → SQL 실행                   ✅ 에디터로 복사     ✅ [Run SQL] 버튼
  변경 요청                       ✅ C 패널           ✅ /changes 페이지
  상태 필터 (변경)                ✅ f 키             ✅ 탭 버튼
  실패 변경 되돌리기              ✅ r 키             ✅ [Revert] 버튼
  승인 큐                         ✅ P 패널           ✅ /approvals
  인덱스 생성 / 삭제              ✅ n/d 키           ✅ 폼 + 버튼
  인덱스 사용률 통계              ✅ TABLE STATS 탭    ✅ 사용률 % 바
  감사 로그                       ✅ A 패널           ✅ /audit 페이지
  DLQ 복구                        ✅ R 패널           ✅ /recovery
  비밀번호 변경                   ✅ \pw 오버레이      —  (관리자 페이지)
  테이블 생성 위저드              —  (웹 전용)          ✅ 모달
```

---

## 역할 기반 접근 제어

JWT 토큰의 역할(role) 클레임을 기반으로 모든 API 라우트와 UI 액션이 제어됩니다.

```
  ┌────────────────┬────────┬────────┬────────┬────────┬─────┐
  │ 역할           │ SELECT │ INSERT │ UPDATE │ DELETE │ DDL │
  ├────────────────┼────────┼────────┼────────┼────────┼─────┤
  │ ANALYST        │   ✅   │        │        │        │     │
  │ MANAGER        │   ✅   │   ✅   │   ✅   │        │     │
  │ DBA            │   ✅   │   ✅   │   ✅   │   ✅   │ ✅  │
  │ SECURITY_ADMIN │   ✅   │        │        │        │     │
  └────────────────┴────────┴────────┴────────┴────────┴─────┘
```

---

## 보안 레이어

```
  ┌─────────────────────────────────────────────────────────────┐
  │  저장된 자격증명                                             │
  │  ~/.config/beanCli/connections.json                         │
  │  AES-256-GCM 암호화 · chmod 600                             │
  ├─────────────────────────────────────────────────────────────┤
  │  전송 / 인증                                                │
  │  JWT HS256 · 24h TTL · RBAC 가드 (모든 라우트)             │
  │  bcrypt 패스워드 · 변경 엔드포인트 (시간당 5회 제한)        │
  ├─────────────────────────────────────────────────────────────┤
  │  SQL 안전성                                                 │
  │  파라미터화 쿼리 · quoteIdent() 식별자 쿼팅                 │
  │  AST 파서: WHERE 없는 UPDATE/DELETE 차단                    │
  │  DB명 허용 목록 정규식 /^[a-zA-Z_][a-zA-Z0-9_$\-]{0,63}$/ │
  ├─────────────────────────────────────────────────────────────┤
  │  요청 제한  (@fastify/rate-limit)                           │
  │  전역 60/분 · /auth/login 5/분                              │
  │  /auth/change-password 5/시간 · /connections/test 10/분    │
  ├─────────────────────────────────────────────────────────────┤
  │  쿼리 안전성                                                │
  │  30초 강제 종료 · 모든 어댑터 5,000행 상한                  │
  ├─────────────────────────────────────────────────────────────┤
  │  감사 & 관찰가능성                                          │
  │  불변 audit_events (앱 레이어에서 UPDATE/DELETE 불가)       │
  │  Fastify pino 난독화: authorization · password ·           │
  │    currentPassword · newPassword · credential · secret     │
  ├─────────────────────────────────────────────────────────────┤
  │  엔티티 프라이버시                                          │
  │  HMAC-SHA256 엔티티 ID 해싱 (ENTITY_ID_PLAIN_ENABLED)      │
  │  CachedKeyStore 5분 TTL (처리량 3–10배 향상)               │
  └─────────────────────────────────────────────────────────────┘
```

---

## API 레퍼런스

기본 URL: `http://localhost:3100`

```
  인증
  ─────────────────────────────────────────────────────────────────
  POST  /api/v1/auth/login               로그인 → JWT 반환
  POST  /api/v1/auth/change-password     현재 유저 비밀번호 변경

  SQL / 스키마
  ─────────────────────────────────────────────────────────────────
  POST  /api/v1/sql/execute              SQL 직접 실행
  POST  /api/v1/schema/analyze           EXPLAIN ANALYZE 실행
  GET   /api/v1/schema/tables            테이블 목록
  GET   /api/v1/state/:table             행 탐색 (페이지네이션)

  변경 요청
  ─────────────────────────────────────────────────────────────────
  POST  /api/v1/changes                  변경 제출
  GET   /api/v1/changes                  변경 목록 (?status= 필터)
  POST  /api/v1/changes/:id/submit       DRAFT → PENDING
  POST  /api/v1/changes/:id/execute      승인된 변경 실행
  POST  /api/v1/changes/:id/revert       FAILED 변경 되돌리기

  승인
  ─────────────────────────────────────────────────────────────────
  GET   /api/v1/approvals/pending        승인 대기 목록
  POST  /api/v1/approvals/:id/approve    승인
  POST  /api/v1/approvals/:id/reject     거절

  인덱스
  ─────────────────────────────────────────────────────────────────
  GET   /api/v1/schema/indexes           인덱스 목록
  POST  /api/v1/indexes                  인덱스 생성
  DELETE /api/v1/indexes/:name           인덱스 삭제

  연결
  ─────────────────────────────────────────────────────────────────
  POST  /api/v1/connections/test         DB 연결 테스트
  POST  /api/v1/connections/execute      연결로 SQL 실행

  기타
  ─────────────────────────────────────────────────────────────────
  GET   /health                          헬스 체크
  GET   /api/v1/audit                    감사 로그
  GET   /api/v1/monitoring/stream-stats  스트림 통계
  POST  /api/v1/ai/stream               AI SSE 스트림
  WS    /ws                              실시간 이벤트 스트림
```

---

## 환경 변수

```
  ┌─────────────────────────────┬───────────────────────┬─────────────────────┐
  │ 변수                        │ 기본값                │ 설명                │
  ├─────────────────────────────┼───────────────────────┼─────────────────────┤
  │ APP_ENV                     │ dev                   │ local/dev/prod      │
  │ DATABASE_URL                │ —                     │ PostgreSQL DSN      │
  │ KAFKA_BROKER                │ localhost:9092        │ 부트스트랩 서버      │
  │ JWT_SECRET                  │ —                     │ HS256 서명 키       │
  │ ENTITY_ID_PLAIN_ENABLED     │ true (dev)            │ 평문 ID 저장 여부   │
  │ API_URL                     │ http://localhost:3100 │ TUI → API           │
  │ NEXT_PUBLIC_API_URL         │ http://localhost:3100 │ 웹 → API            │
  │ MOCK                        │ —                     │ true = Mock 모드    │
  └─────────────────────────────┴───────────────────────┴─────────────────────┘
```

---

## Docker 인프라

```
  ┌──────────────────┬───────┬──────────────────────────────────────┐
  │ 서비스           │ 포트  │ 설명                                  │
  ├──────────────────┼───────┼──────────────────────────────────────┤
  │ PostgreSQL 15    │ 5432  │ 주 데이터베이스                       │
  │ Kafka            │ 9092  │ 이벤트 스트리밍                       │
  │ Kafka UI         │ 8080  │ 토픽 브라우저 (개발용)                │
  │ Zookeeper        │ 2181  │ Kafka 코디네이션                      │
  └──────────────────┴───────┴──────────────────────────────────────┘
```

```bash
pnpm docker:up      # 모든 서비스 시작
pnpm docker:wait    # 헬스 확인까지 대기
pnpm db:migrate     # SQL 마이그레이션 적용 (001–006)
pnpm docker:reset   # 볼륨 초기화 + 재시작
```

---

## 개발 명령어

```bash
# ── TUI ────────────────────────────────────────────────────────────────
beancli               # 실제 모드 (API + DB 필요)
beancli --mock        # Mock 모드 — 외부 서비스 불필요
pnpm dev:mock         # Watch 모드 + Mock (코드 변경 시 자동 재시작)
pnpm dev:cli          # Watch 모드 + 실제 API

# ── 웹 콘솔 ─────────────────────────────────────────────────────────────
pnpm dev:web          # → http://localhost:3000

# ── 풀 스택 ───────────────────────────────────────────────────────────────
pnpm dev:all          # API + Projector + Recovery + TUI 전부 Watch 모드

# ── 빌드 & 타입 체크 ───────────────────────────────────────────────────────
pnpm build
pnpm --filter @tfsdc/tui exec tsc --noEmit
pnpm --filter @tfsdc/cli exec tsc --noEmit
pnpm --filter @tfsdc/web exec tsc --noEmit

# ── 테스트 / 린트 / 포맷 ─────────────────────────────────────────────
pnpm test && pnpm test:watch
pnpm lint && pnpm lint:fix
pnpm format

# ── 데이터베이스 ─────────────────────────────────────────────────────────
pnpm db:migrate       # 마이그레이션 적용
pnpm db:seed          # 샘플 데이터 투입
pnpm db:test-conn     # 연결 확인

# ── 글로벌 바이너리 ────────────────────────────────────────────────────────
pnpm link:global      # beancli를 전역 PATH에 등록
```

---

## 로드맵

```
  코어 TUI
  ─────────────────────────────────────────────────────────────
  ✅  3-패널 Ink 레이아웃 (스키마 / 쿼리 / 결과 / AI)
  ✅  ConnectionPicker → DatabasePicker → TablePicker 부트 플로우
  ✅  멀티라인 SQL 에디터 + psql 메타 커맨드 (\dt \d \x \ping)
  ✅  \export csv|json  ·  \explain  ·  \pw (비밀번호 변경)
  ✅  DML 확인 (EXPLAIN 행 추정 → y/n)
  ✅  변경 요청 패널 (C)  +  승인 패널 (P)
  ✅  인덱스 랩 — 생성 (n) / 삭제 (d) / 사용률 통계

  데이터베이스 & 인프라
  ─────────────────────────────────────────────────────────────
  ✅  9가지 DB 어댑터 (PG · MySQL · SQLite · MongoDB · Redis ·
                      Kafka · RabbitMQ · Elasticsearch · NATS)
  ✅  AES-256-GCM 자격증명 암호화
  ✅  쿼리 타임아웃 (30초) + 행 상한 (5,000)
  ✅  API 요청 제한 + 로거 자격증명 난독화
  ✅  플러그인 어댑터 API (--plugin ./adapter.js)

  웹 콘솔
  ─────────────────────────────────────────────────────────────
  ✅  14개 페이지 — Query · Explore · Schema · Monitor · Indexes
                   Audit · Recovery · AI · Changes · Approvals
                   Auth · Connections · Admin/Users · Dashboard
  ✅  게임보이 레트로 쉘 UI — 다크 / 라이트 테마
  ✅  한/영 언어 전환 (localStorage 저장)
  ✅  플로팅 AI 채팅 위젯 (전 페이지)
  ✅  WebSocket LiveTableRefresh  ·  RBAC AccessGuard
  ✅  [Explain] 버튼 + ?sql= 딥링크
  ✅  변경 상태 필터 탭 (ALL/DRAFT/PENDING/APPROVED/…)
  ✅  FAILED 행에 [Revert] 버튼
  ✅  실시간 행 필터 (Explore)
  ✅  인덱스 사용률 % 바 (████░░ N%)
  ✅  AI ```sql 블록 → [Run SQL] 버튼 자동 감지

  인증 & RBAC
  ─────────────────────────────────────────────────────────────
  ✅  JWT 로그인 (24h) · bcrypt 패스워드 · RBAC 라우트 가드
  ✅  관리자 유저 관리 (생성 · 이름 변경 · 비활성화)
  ✅  EXPLAIN ANALYZE 트리 뷰
  ✅  CSV / JSON 내보내기 (TUI \export + 웹 다운로드 버튼)
```

---

## 플러그인 API

런타임에 커스텀 DB 어댑터를 로드할 수 있습니다. 오픈-클로즈드 원칙(OCP) 레지스트리 패턴으로 설계되어, 소스 수정 없이 새 DB 타입을 추가할 수 있습니다.

```bash
beancli --plugin ./my-adapter.js
```

```typescript
// my-adapter.js  — 최소 예시
module.exports = {
  type: 'mypgfork',
  create(config) {
    return {
      async listTables() { /* … */ },
      async queryRows(sql) { /* … */ },
      async close() { /* … */ },
    };
  },
};
```

> 전체 인터페이스 명세는 [`docs/plugin-api.md`](docs/plugin-api.md)를 참조하세요.

---

## Claude Code 커스텀 커맨드

```
  /commit     주제별 커밋 가이드라인 (관심사 하나 = 커밋 하나)
  /typecheck  전 패키지 TypeScript 검사
  /test       테스트 실행 가이드
  /issue      GitHub Issue / PR 생성
  /seed       DB 샘플 데이터 투입
  /perf       성능 감사
```

---

<div align="center">

[Ink](https://github.com/vadimdemedes/ink) ·
[Fastify](https://fastify.dev) ·
[Next.js](https://nextjs.org) ·
[kafkajs](https://kafka.js.org) ·
[neverthrow](https://github.com/supermacro/neverthrow)으로 만들었습니다

[이슈 신고](https://github.com/leebeanbin/beanCli/issues) · [English](README.md)

</div>
