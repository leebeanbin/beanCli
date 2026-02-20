# Phase 6: Web Console

## 개요

Web Console은 TUI의 보조 인터페이스다. 승인 워크플로우, 정책 설정, 보안 관리처럼 GUI가 더 적합한 작업을 담당한다.

---

## 1. 컴포넌트 구조

```
apps/web/
  ├── app/                       # Next.js App Router
  │   ├── layout.tsx
  │   ├── (auth)/login/
  │   ├── approvals/             # 승인 Inbox
  │   ├── changes/               # 변경 이력
  │   ├── policy/                # 정책 설정
  │   ├── dlq/                   # DLQ Browser
  │   └── security/              # 키 관리
  └── components/
      ├── ApprovalCard.tsx
      ├── ChangeTimeline.tsx
      ├── PolicyEditor.tsx
      ├── DlqTable.tsx
      └── RiskBadge.tsx

packages/ui-web/
  ├── hooks/
  │   ├── useWsEvents.ts         # WebSocket 구독
  │   ├── usePendingChanges.ts
  │   └── useAuditLog.ts
  └── api-client/
      └── ApiClient.ts
```

---

## 2. 화면 구성

### 2.1 Approval Inbox

승인 대기 중인 변경 요청 목록. 가장 중요한 화면이다.

```
┌────────────────────────────────────────────────────────────┐
│ Approval Inbox                          3 pending           │
├────────────────────────────────────────────────────────────┤
│ ⚠ [L2] state_orders — alice             MANUAL  PROD  8min │
│   UPDATE state_orders SET status='CANCELLED'               │
│   WHERE entity_id_hash = 'hash_ord_003'                    │
│   Affected: ~1 rows   [Approve] [Reject] [View Details]    │
├────────────────────────────────────────────────────────────┤
│ ⚡ [L1] state_products — bob             CONFIRM PROD  2min │
│   UPDATE state_products SET price_cents = 8999             │
│   WHERE sku = 'SKU-A001'                                   │
│   Affected: ~1 rows   [Approve] [Reject] [View Details]    │
├────────────────────────────────────────────────────────────┤
│ ⚡ [L0] state_users — frank              AUTO    DEV   1min │
│   UPDATE state_users SET tier = 'PREMIUM'                  │
│   WHERE entity_id_hash = 'hash_user_006'                   │
│   [Approve] [Reject]                                       │
└────────────────────────────────────────────────────────────┘
```

```tsx
// components/ApprovalCard.tsx
export function ApprovalCard({ change }: { change: PendingChange }) {
  const [approving, setApproving] = useState(false);

  const approve = async () => {
    setApproving(true);
    await apiClient.post(`/approvals/${change.id}/approve`);
  };

  return (
    <div className={`approval-card risk-${change.riskLevel.toLowerCase()}`}>
      <header>
        <RiskBadge level={change.riskLevel} />
        <span>{change.targetTable}</span>
        <span className="actor">{change.actor}</span>
        <ExecutionModeBadge mode={change.executionMode} />
        <span className="env">{change.environment}</span>
        <span className="waiting">{change.waitingMinutes}min ago</span>
      </header>

      <code className="sql">{change.sqlStatement}</code>

      <footer>
        <span>Affected: ~{change.affectedRowsEstimate} rows</span>
        {change.isBulkChange && <span className="bulk-warning">⚠ BULK CHANGE</span>}
        <button onClick={approve} disabled={approving}>
          {approving ? 'Approving...' : 'Approve'}
        </button>
        <button onClick={() => reject(change.id)}>Reject</button>
      </footer>
    </div>
  );
}
```

---

### 2.2 Change Timeline

```
┌────────────────────────────────────────────────────────────┐
│ Change Timeline            [Filter: status, actor, table]  │
├─────────┬──────────────────────────────────────────────────┤
│ 14:32   │ ✅ DONE    alice  state_orders   L2  1 row        │
│ 14:30   │ ✅ DONE    bob    state_products L1  1 row        │
│ 14:25   │ ⏳ PENDING alice  state_users    L0  1 row        │
│ 14:20   │ ❌ FAILED  frank  state_orders   L2  err: timeout │
│ 14:18   │ ↩ REVERTED frank  state_orders  L2  reverted     │
└─────────┴──────────────────────────────────────────────────┘
```

```tsx
// hooks/useWsEvents.ts — 실시간 업데이트 구독
export function useWsEvents(tables: string[]) {
  const [events, setEvents] = useState<ServerMessage[]>([]);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}`);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'SUBSCRIBE', tables }));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      setEvents(prev => [msg, ...prev].slice(0, 200)); // 최근 200개 보관
    };
    return () => ws.close();
  }, [tables]);

  return events;
}
```

---

### 2.3 Policy Editor

ExecutionMode 정책을 환경별로 설정한다. DBA 전용.

```
┌────────────────────────────────────────────────────────────┐
│ Execution Policy Settings                     DBA only     │
├──────────┬─────────┬─────────┬──────────────────────────── │
│ Env      │ L0      │ L1      │ L2                          │
├──────────┼─────────┼─────────┼─────────────────────────── │
│ LOCAL    │ AUTO ▼  │ AUTO ▼  │ AUTO ▼                      │
│ DEV      │ AUTO ▼  │ AUTO ▼  │ CONFIRM ▼                   │
│ PROD     │CONFIRM▼ │CONFIRM▼ │ MANUAL ▼                    │
├──────────┴─────────┴─────────┴─────────────────────────────┤
│ Bulk Change Threshold: [1000] rows                         │
│ ChangeApplied pkList Limit: [500] items                    │
│                                        [Save Policy]       │
└────────────────────────────────────────────────────────────┘
```

---

### 2.4 DLQ Browser (SECURITY_ADMIN 전용)

```
┌────────────────────────────────────────────────────────────┐
│ DLQ Browser                          SECURITY_ADMIN only   │
├────────────────────────────────────────────────────────────┤
│ ID  │ Topic          │ Offset │ Error           │ Retries  │
│ 12  │ ecom.orders    │ 50421  │ DB timeout      │ 3        │
│ 11  │ ecom.payments  │ 30918  │ Hash key error  │ 3        │
│     │                │        │                 │          │
│ [Reprocess Selected]   ← payload 복호화 없이 재처리 트리거  │
└────────────────────────────────────────────────────────────┘
```

DLQ payload 자체는 Web Console에서 표시되지 않는다. 열람이 필요한 경우 별도 SECURITY_ADMIN 전용 CLI 도구를 통해 복호화한다.

---

### 2.5 Key Rotation (SECURITY_ADMIN 전용)

```
┌────────────────────────────────────────────────────────────┐
│ HMAC Key Management                  SECURITY_ADMIN only   │
├────────────────────────────────────────────────────────────┤
│ Current Key: dev-key-v2              ACTIVE                │
│   Created: 2024-01-15  Next rotation: 2024-02-14          │
│                                                            │
│ Previous Key: dev-key-v1             PREVIOUS              │
│   Rotated: 2024-01-15                                      │
│                                                            │
│ [Trigger Manual Rotation]   ← 새 키 ID 입력 후 즉시 회전   │
└────────────────────────────────────────────────────────────┘
```

---

## 3. 인증 흐름

Web Console은 API와 동일한 JWT를 사용한다.

```
사용자 로그인
    │
    ▼
POST /auth/login { username, password }
    │
    ▼
{ accessToken (1h), refreshToken (7d) }
    │
    ▼
모든 API 요청 헤더: Authorization: Bearer <accessToken>
    │
    ▼
만료 시: POST /auth/refresh { refreshToken } → 새 accessToken
```

---

## 4. 실시간 알림

승인 대기 건이 새로 생기면 브라우저 탭 제목과 뱃지로 알린다.

```typescript
// 탭 제목 업데이트
useEffect(() => {
  document.title = pendingCount > 0
    ? `(${pendingCount}) Approval Inbox — TFSDC`
    : 'TFSDC';
}, [pendingCount]);

// 브라우저 알림 (사용자 허용 시)
if (Notification.permission === 'granted' && newPending) {
  new Notification('새 승인 요청', {
    body: `${newChange.actor}의 ${newChange.targetTable} 변경 요청`,
    icon: '/favicon.ico',
  });
}
```

---

## 5. 접근 제어 요약

| 화면 | ANALYST | MANAGER | DBA | SECURITY_ADMIN |
|------|---------|---------|-----|----------------|
| Approval Inbox | ✗ | ✓ | ✓ | ✗ |
| Change Timeline | 자신만 | ✓ | ✓ | ✓ |
| Policy Settings | ✗ | ✗ | ✓ | ✗ |
| DLQ Browser | ✗ | ✗ | ✗ | ✓ |
| Key Rotation | ✗ | ✗ | ✗ | ✓ |
