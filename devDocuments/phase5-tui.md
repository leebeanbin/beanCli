# Phase 5: TUI 렌더링 엔진

## 개요

TUI는 제품의 메인 인터페이스다. 30fps cap 렌더 루프, Optimistic UI, 권한 기반 컴포넌트 잠금, 5개 Scene을 포함한다.

---

## 1. 컴포넌트 구조

```
packages/ui-tui/
  ├── core/
  │   ├── RenderLoop.ts          # 30fps cap 메인 루프
  │   ├── TerminalCanvas.ts      # 터미널 출력 추상화
  │   ├── EventBus.ts            # 키 입력 → 이벤트 변환
  │   └── Layout.ts              # Adaptive layout 엔진
  ├── components/
  │   ├── Table.ts               # 데이터 테이블 (스크롤, 선택)
  │   ├── CommandPalette.ts      # Ctrl+P 팔레트
  │   ├── StatusBar.ts           # 하단 상태바
  │   ├── ChangeForm.ts          # SQL 입력 + 위험도 미리보기
  │   ├── ConfirmDialog.ts       # CONFIRM 모드 확인 UI
  │   └── LockedMenu.ts          # 권한 없는 항목 [LOCKED] 표시
  ├── scenes/
  │   ├── ExploreScene.ts        # 테이블 탐색 + 실시간 상태
  │   ├── MonitorScene.ts        # 스트리밍 메트릭
  │   ├── RecoveryScene.ts       # DLQ 재처리
  │   ├── IndexLabScene.ts       # 인덱스 분석
  │   └── AuditScene.ts          # 감사 로그 검색
  ├── store/
  │   ├── AppState.ts            # 전역 상태
  │   ├── ViewportState.ts       # 현재 화면 범위 추적
  │   └── OptimisticPatch.ts     # Optimistic UI 패치 관리
  └── ws/
      └── TuiWsClient.ts         # WebSocket/SSE 클라이언트
```

---

## 2. 렌더 루프 (30fps cap)

```typescript
// core/RenderLoop.ts
export class RenderLoop {
  private readonly TARGET_FPS = 30;
  private readonly FRAME_BUDGET_MS = 1000 / this.TARGET_FPS; // 33.33ms

  private dirty = false;
  private running = false;
  private lastFrameTime = 0;

  constructor(
    private readonly canvas: TerminalCanvas,
    private readonly rootScene: IScene,
  ) {}

  markDirty(): void {
    this.dirty = true;
  }

  start(): void {
    this.running = true;
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
  }

  private scheduleFrame(): void {
    if (!this.running) return;

    const now = Date.now();
    const elapsed = now - this.lastFrameTime;
    const delay = Math.max(0, this.FRAME_BUDGET_MS - elapsed);

    setTimeout(() => {
      if (this.dirty) {
        this.renderFrame();
        this.dirty = false;
        this.lastFrameTime = Date.now();
      }
      this.scheduleFrame();
    }, delay);
  }

  private renderFrame(): void {
    const start = performance.now();
    this.canvas.beginFrame();
    this.rootScene.render(this.canvas);
    this.canvas.endFrame();
    const took = performance.now() - start;

    // 프레임 예산 초과 경고 (디버그용)
    if (took > this.FRAME_BUDGET_MS) {
      this.rootScene.onSlowFrame(took);
    }
  }
}
```

---

## 3. Adaptive Layout

터미널 크기에 따라 레이아웃이 자동 전환된다.

```
< 80 columns:  탭 기반 내비게이션 (좌측 사이드바 숨김)
≥ 80 columns:  좌측 사이드바 + 메인 패널 분할
≥ 120 columns: 사이드바 + 메인 + 우측 상세 패널

PAUSED 모드: 상단에 [PAUSED] 배너 표시
LIVE 모드:   상단에 실시간 통계 표시
```

```typescript
// core/Layout.ts
export class Layout {
  compute(cols: number, rows: number): LayoutRegions {
    if (cols < 80) {
      return {
        mode: 'compact',
        main: { x: 0, y: 1, width: cols, height: rows - 2 },
        statusBar: { x: 0, y: rows - 1, width: cols, height: 1 },
      };
    }

    const sidebarWidth = Math.min(24, Math.floor(cols * 0.2));
    return {
      mode: cols >= 120 ? 'full' : 'split',
      sidebar: { x: 0, y: 1, width: sidebarWidth, height: rows - 2 },
      main: { x: sidebarWidth + 1, y: 1, width: cols - sidebarWidth - 1, height: rows - 2 },
      statusBar: { x: 0, y: rows - 1, width: cols, height: 1 },
    };
  }
}
```

---

## 4. Optimistic UI + Event Confirm

```typescript
// store/OptimisticPatch.ts
export class OptimisticPatchManager {
  // changeId → 패치 목록
  private patches = new Map<string, OptimisticPatch[]>();

  apply(changeId: string, patch: OptimisticPatch): void {
    const list = this.patches.get(changeId) ?? [];
    list.push({ ...patch, appliedAt: Date.now() });
    this.patches.set(changeId, list);
    // 렌더 루프에 dirty 신호
    renderLoop.markDirty();
  }

  // ChangeApplied 이벤트 수신 → 패치 확정 + refetch
  confirm(changeId: string, event: ChangeAppliedEvent): void {
    this.patches.delete(changeId);

    if (event.pkListTruncated) {
      // 500개 초과: 뷰포트 전체 refetch
      viewportRefetcher.reloadViewport(event.tableName);
    } else {
      // 500개 이하: 선택적 micro-batch refetch
      viewportRefetcher.refetchRows(event.tableName, event.pkList!);
    }
  }

  // 실패 시 롤백
  rollback(changeId: string): void {
    const patches = this.patches.get(changeId) ?? [];
    // 역순으로 패치 되돌리기
    for (const patch of patches.reverse()) {
      this.revertPatch(patch);
    }
    this.patches.delete(changeId);
    renderLoop.markDirty();
  }
}
```

---

## 5. Scene: ExploreScene

테이블 탐색 + 실시간 상태 + 인라인 변경 요청.

```
┌─────────────────────────────────────────────────────────────────┐
│ [LIVE] state_orders             Ctrl+P: Command Palette  [HELP] │
├─────────────┬───────────────────────────────────────────────────┤
│ > Explore   │ entity_id_hash │ status          │ total_cents    │
│   Monitor   │ hash_ord_001   │ DELIVERED       │ 15,998         │
│   Recovery  │ hash_ord_002   │ SHIPPED     ◀── │ 12,999         │ ← 실시간 갱신
│   IndexLab  │ hash_ord_003   │ PAYMENT_PENDING │ 3,499          │
│   Audit     │ hash_ord_004   │ PAID            │ 49,999         │
│             ├───────────────────────────────────────────────────┤
│             │ [e] Edit  [f] Filter  [/] Search  [r] Refresh     │
│             │ ExecutionMode: CONFIRM  Env: PROD  Role: MANAGER  │
└─────────────┴───────────────────────────────────────────────────┘
```

**키 바인딩:**

| 키 | 동작 |
|---|---|
| `↑` / `↓` | 행 선택 |
| `Space` | LIVE/PAUSED 토글 |
| `e` | 선택 행 Edit (권한 없으면 [LOCKED]) |
| `f` | 필터 입력 |
| `/` | 인라인 검색 |
| `Ctrl+P` | Command Palette 열기 |
| `Tab` | Row mode ↔ Cell mode 전환 |

---

## 6. 권한 기반 UI 잠금

```typescript
// components/LockedMenu.ts
export class LockedMenu {
  render(canvas: TerminalCanvas, items: MenuItem[], role: UserRole): void {
    for (const item of items) {
      const allowed = item.requiredRoles.includes(role);

      if (allowed) {
        canvas.write(item.label, { color: 'white' });
      } else {
        // 권한 없는 항목: [LOCKED] 표시 + 회색
        canvas.write(`[LOCKED] ${item.label}`, { color: 'gray', dim: true });
      }
    }
  }
}

// ExecutionMode 표시
export function renderExecutionModeBadge(
  canvas: TerminalCanvas,
  mode: ExecutionMode,
): void {
  const styles: Record<ExecutionMode, { label: string; color: string }> = {
    AUTO:    { label: '⚡ AUTO',    color: 'green'  },
    CONFIRM: { label: '⚠ CONFIRM', color: 'yellow' },
    MANUAL:  { label: '🔒 MANUAL', color: 'red'    },
  };
  const { label, color } = styles[mode];
  canvas.write(label, { color });
}
```

---

## 7. Scene: MonitorScene

```
┌─────────────────────────────────────────────────────────────────┐
│ [LIVE] Monitor — Streaming Health                               │
├─────────────┬───────────────────────────────────────────────────┤
│   Explore   │ Entity Type  │ Events/min │ Latest Event │ DLQ   │
│ > Monitor   │ orders       │ 142        │ 2s ago       │ 0     │
│   Recovery  │ payments     │ 98         │ 1s ago       │ 2 ⚠   │
│   IndexLab  │ products     │ 12         │ 8s ago       │ 0     │
│   Audit     │ shipments    │ 34         │ 3s ago       │ 0     │
│             ├───────────────────────────────────────────────────┤
│             │ DB p95: 14ms │ Pool: 23%  │ Batch: 250   │ Lag:0 │
└─────────────┴───────────────────────────────────────────────────┘
```

---

## 8. Scene: AuditScene

```
┌─────────────────────────────────────────────────────────────────┐
│ Audit Log                    [/] Search  [f] Filter by category │
├─────────────┬───────────────────────────────────────────────────┤
│   Explore   │ Time       │ Actor   │ Action              │ Result│
│   Monitor   │ 14:32:01   │ alice   │ CHANGE:EXECUTE      │ ✓ OK │
│   Recovery  │ 14:30:55   │ bob     │ CHANGE:APPROVE      │ ✓ OK │
│   IndexLab  │ 14:29:12   │ alice   │ CHANGE:SUBMIT       │ ✓ OK │
│ > Audit     │ 14:25:00   │ SYSTEM  │ CLEANUP_SNAPSHOTS   │ ✓ OK │
│             ├───────────────────────────────────────────────────┤
│             │ [Enter] 상세보기  [c] correlation_id로 묶어보기     │
└─────────────┴───────────────────────────────────────────────────┘
```

---

## 9. TUI WebSocket 클라이언트

```typescript
// ws/TuiWsClient.ts
export class TuiWsClient {
  private ws?: WebSocket;
  private reconnectDelay = 1000;
  private mode: 'LIVE' | 'PAUSED' = 'LIVE';

  connect(url: string, tables: string[]): void {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000; // reset backoff
      this.ws!.send(JSON.stringify({ type: 'SUBSCRIBE', tables }));
    };

    this.ws.onmessage = (e) => {
      if (this.mode === 'PAUSED') return; // PAUSED 모드: 이벤트 무시
      const msg = JSON.parse(e.data) as ServerMessage;
      this.dispatch(msg);
    };

    this.ws.onclose = () => {
      // 지수 백오프 재연결 (최대 30초)
      setTimeout(() => this.connect(url, tables),
        Math.min(this.reconnectDelay *= 2, 30000));
    };
  }

  togglePause(): void {
    this.mode = this.mode === 'LIVE' ? 'PAUSED' : 'LIVE';
    renderLoop.markDirty();
  }

  private dispatch(msg: ServerMessage): void {
    switch (msg.type) {
      case 'CHANGE_APPLIED':
        optimisticPatch.confirm(msg.event.changeId, msg.event);
        break;
      case 'OVERLOAD_WARNING':
        appState.setOverloadWarning(msg.reason);
        renderLoop.markDirty();
        break;
      case 'STREAM_EVENT':
        appState.updateStreamStats(msg.entityType, msg.count);
        renderLoop.markDirty();
        break;
    }
  }
}
```

---

## 10. 테스트 전략

```typescript
describe('RenderLoop', () => {
  it('33ms 이내에 프레임이 렌더된다', async () => {
    const loop = new RenderLoop(mockCanvas, mockScene);
    loop.markDirty();
    loop.start();
    await delay(50);
    expect(mockScene.renderCallCount).toBeGreaterThan(0);
    expect(mockScene.lastFrameMs).toBeLessThan(33.34);
  });
});

describe('OptimisticPatchManager', () => {
  it('pkListTruncated=true이면 전체 reload가 호출된다', () => {
    patchManager.confirm('change-1', { pkListTruncated: true, ... });
    expect(viewportRefetcher.reloadViewport).toHaveBeenCalled();
  });
});
```
