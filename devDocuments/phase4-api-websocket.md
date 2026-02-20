# Phase 4: API + WebSocket 레이어

## 개요

API는 TUI와 Web Console의 단일 게이트웨이다. REST로 CRUD를 처리하고, WebSocket(기본)/SSE(fallback)으로 실시간 이벤트를 푸시한다.

---

## 1. 컴포넌트 구조

```
apps/api/
  ├── index.ts                   # Entry point
  ├── server.ts                  # Fastify 인스턴스 + 미들웨어
  └── di-container.ts            # 의존성 주입

packages/application/api/
  ├── routes/
  │   ├── changes.routes.ts      # /api/v1/changes
  │   ├── approvals.routes.ts    # /api/v1/approvals
  │   ├── state.routes.ts        # /api/v1/state/:table
  │   ├── audit.routes.ts        # /api/v1/audit
  │   └── health.routes.ts       # /health
  ├── websocket/
  │   ├── WsConnectionManager.ts
  │   ├── WsEventBroadcaster.ts
  │   └── SseFallbackHandler.ts
  └── middleware/
      ├── auth.middleware.ts     # JWT 검증 + role 추출
      ├── rbac.middleware.ts     # 권한 체크
      └── audit.middleware.ts    # 요청 자동 감사
```

---

## 2. REST API 명세

### 변경 요청 (Changes)

| Method | Path | Role | 설명 |
|--------|------|------|------|
| POST | `/api/v1/changes` | MANAGER, DBA | 변경 요청 생성 (DRAFT) |
| GET | `/api/v1/changes` | ALL | 변경 요청 목록 조회 |
| GET | `/api/v1/changes/:id` | ALL | 단건 조회 |
| POST | `/api/v1/changes/:id/submit` | MANAGER, DBA | DRAFT → PENDING/APPROVED |
| POST | `/api/v1/changes/:id/execute` | MANAGER, DBA | CONFIRM 모드 실행 확인 |
| POST | `/api/v1/changes/:id/revert` | DBA | 실패 건 되돌리기 |

### 승인 (Approvals)

| Method | Path | Role | 설명 |
|--------|------|------|------|
| GET | `/api/v1/approvals/pending` | MANAGER, DBA | 대기 중인 승인 요청 |
| POST | `/api/v1/approvals/:changeId/approve` | MANAGER, DBA | 승인 |
| POST | `/api/v1/approvals/:changeId/reject` | MANAGER, DBA | 거부 |

### 상태 조회 (State)

| Method | Path | Role | 설명 |
|--------|------|------|------|
| GET | `/api/v1/state/:table` | ALL | 테이블 상태 조회 (pagination) |
| GET | `/api/v1/state/:table/:id` | ALL | 단건 entity 조회 |

### 감사 로그 (Audit)

| Method | Path | Role | 설명 |
|--------|------|------|------|
| GET | `/api/v1/audit` | MANAGER, DBA, SECURITY_ADMIN | 감사 로그 조회 |

---

## 3. 인증 미들웨어

```typescript
// auth.middleware.ts
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  try {
    const payload = await verifyJwt(token);
    // session 컨텍스트에 role 주입 (RLS에서 사용)
    request.actor = payload.sub;
    request.role = payload.role as UserRole;

    // PostgreSQL session 변수 설정 (RLS용)
    await request.db.query(`
      SELECT set_config('app.current_actor', $1, true),
             set_config('app.current_role', $2, true)
    `, [payload.sub, payload.role]);

  } catch {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}
```

---

## 4. RBAC 미들웨어

```typescript
// rbac.middleware.ts
export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(request.role)) {
      // 권한 없으면 UI 진입 자체 차단 원칙 — 403 반환
      await auditWriter.write({
        category: 'AUTH',
        actor: request.actor,
        action: 'ACCESS_DENIED',
        resource: request.url,
        result: 'FAILURE',
      });
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
}

// 사용 예시
fastify.post('/api/v1/changes',
  { preHandler: [authMiddleware, requireRole('MANAGER', 'DBA')] },
  createChangeHandler,
);
```

---

## 5. WebSocket 이벤트 설계

### 연결 흐름

```
Client                          Server
  │                               │
  │── WS Upgrade ────────────────>│
  │<─ 101 Switching Protocols ────│
  │                               │
  │── { type: "SUBSCRIBE",       │
  │     tables: ["state_orders"] }│──>│
  │                               │ 구독 등록
  │<── { type: "SUBSCRIBED" } ───│
  │                               │
  │        [이벤트 발생]            │
  │<── { type: "CHANGE_APPLIED"  │
  │     ...payload } ────────────│
  │                               │
  │── { type: "PING" } ─────────>│
  │<── { type: "PONG" } ─────────│
```

### 서버 → 클라이언트 이벤트

```typescript
// WS 메시지 타입 정의

type ServerMessage =
  | { type: 'SUBSCRIBED';    tables: string[] }
  | { type: 'CHANGE_APPLIED'; event: ChangeAppliedPayload }
  | { type: 'STREAM_EVENT';   entityType: string; count: number }
  | { type: 'OVERLOAD_WARNING'; reason: string }
  | { type: 'PONG' };

interface ChangeAppliedPayload {
  changeId: string;
  tableName: string;
  affectedCount: number;
  pkList?: string[];        // ≤ 500개일 때만
  pkListTruncated: boolean;
  correlationId: string;
}
```

### WsConnectionManager

```typescript
export class WsConnectionManager {
  // table → Set<WebSocket> 구독 맵
  private subscriptions = new Map<string, Set<WebSocket>>();

  register(ws: WebSocket, tables: string[]): void {
    for (const table of tables) {
      if (!this.subscriptions.has(table)) {
        this.subscriptions.set(table, new Set());
      }
      this.subscriptions.get(table)!.add(ws);
    }

    ws.on('close', () => this.unregister(ws));
  }

  broadcast(table: string, message: ServerMessage): void {
    const subscribers = this.subscriptions.get(table);
    if (!subscribers) return;

    const payload = JSON.stringify(message);
    let deadSockets: WebSocket[] = [];

    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else {
        deadSockets.push(ws);
      }
    }

    // 끊어진 소켓 정리
    for (const ws of deadSockets) {
      subscribers.delete(ws);
    }
  }
}
```

---

## 6. SSE Fallback

WebSocket 연결이 실패하거나 클라이언트가 SSE를 요청한 경우 사용.

```typescript
// GET /api/v1/stream?tables=state_orders,state_payments
export async function sseHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',   // Nginx 버퍼링 비활성
  });

  const tables = (request.query as any).tables?.split(',') ?? [];
  const clientId = crypto.randomUUID();

  wsManager.registerSse(clientId, tables, (message) => {
    reply.raw.write(`data: ${JSON.stringify(message)}\n\n`);
  });

  // Keepalive ping (30초마다)
  const pingInterval = setInterval(() => {
    reply.raw.write(': ping\n\n');
  }, 30_000);

  request.raw.on('close', () => {
    clearInterval(pingInterval);
    wsManager.unregisterSse(clientId);
  });
}
```

---

## 7. Backpressure 처리

```typescript
export class WsEventBroadcaster {
  // 클라이언트당 미전송 메시지 큐
  private queues = new Map<WebSocket, ServerMessage[]>();
  private readonly MAX_QUEUE_SIZE = 100;

  send(ws: WebSocket, message: ServerMessage): void {
    const queue = this.queues.get(ws) ?? [];

    if (queue.length >= this.MAX_QUEUE_SIZE) {
      // Overload: patch 중단 경고 전송 후 큐 초기화
      ws.send(JSON.stringify({
        type: 'OVERLOAD_WARNING',
        reason: 'Message queue full. Please reload.',
      }));
      this.queues.set(ws, []);
      return;
    }

    queue.push(message);
    this.queues.set(ws, queue);
    this.flush(ws);
  }

  private flush(ws: WebSocket): void {
    if (ws.bufferedAmount > 0) return; // 아직 전송 중
    const queue = this.queues.get(ws) ?? [];
    const batch = queue.splice(0, 10); // 최대 10개씩 flush
    for (const msg of batch) {
      ws.send(JSON.stringify(msg));
    }
  }
}
```

---

## 8. 감사 미들웨어 (자동 기록)

모든 쓰기 요청은 응답 완료 후 자동으로 감사 로그에 기록된다.

```typescript
// audit.middleware.ts
export function auditWriteHook(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
  done: () => void,
): void {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    auditWriter.write({
      category: 'CHANGE',
      actor: request.actor,
      action: `${request.method}:${request.routeOptions.url}`,
      resource: request.url,
      result: reply.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
      correlationId: request.headers['x-correlation-id'] as string
        ?? crypto.randomUUID(),
      data: { statusCode: reply.statusCode },
    }).catch(console.error); // non-blocking
  }
  done();
}
```

---

## 9. 헬스체크

```typescript
// GET /health
{
  "status": "ok",
  "db": { "status": "ok", "p95LatencyMs": 12 },
  "kafka": { "status": "ok", "consumerLag": 0 },
  "websocket": { "connections": 4 },
  "uptime": 3600
}
```
