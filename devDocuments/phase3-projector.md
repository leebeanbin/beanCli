# Phase 3: Projector 스트리밍 파이프라인

## 개요

Projector는 Kafka에서 이벤트를 소비해 `events_raw`에 저장하고 `state_*` 테이블을 UPSERT한다. 멱등성(idempotency)과 순서 보장이 핵심 설계 원칙이다.

---

## 1. 컴포넌트 구조

```
apps/projector/
  └── index.ts                   # Entry point, DI wiring

packages/application/projector/
  ├── ProjectorLoop.ts           # Kafka consumer 루프
  ├── EventDispatcher.ts         # entity_type → Handler 라우팅
  └── use-cases/
      ├── ProcessEventUseCase.ts
      └── ReprocessDlqUseCase.ts

packages/domain/streaming/
  ├── entities/
  │   └── RawEvent.ts
  ├── value-objects/
  │   ├── EntityIdHash.ts        # HMAC-SHA256 래퍼
  │   └── KafkaOffset.ts
  ├── services/
  │   └── EventDeduplicator.ts
  └── handlers/                  # 이벤트 타입별 도메인 핸들러
      ├── IEventHandler.ts
      ├── OrderCreatedHandler.ts
      ├── PaymentCapturedHandler.ts
      ├── ProductAdjustedHandler.ts
      └── ShipmentStatusChangedHandler.ts

packages/infrastructure/kafka/
  ├── KafkaConsumerAdapter.ts
  ├── KafkaProducerAdapter.ts
  └── DlqPublisher.ts
```

---

## 2. 처리 파이프라인

```
Kafka Topic
    │
    ▼
[KafkaConsumerAdapter]
    │  poll(batch)
    ▼
[ProjectorLoop]
    │  for each message:
    ▼
[EventDispatcher]
    │  entity_type → Handler
    ▼
[ProcessEventUseCase]
    ├── 1. EntityIdHash 계산 (HMAC-SHA256)
    ├── 2. events_raw INSERT (중복 시 skip)
    ├── 3. state_{entity_type} UPSERT
    └── 4. Kafka offset commit
         (실패 시 DLQ 발행 → 재시도 3회)
```

---

## 3. 멱등성 보장

`events_raw` 테이블의 `UNIQUE (source_topic, partition, offset)` 제약으로 중복 처리를 DB 레벨에서 방지한다.

```typescript
// ProcessEventUseCase.ts
async execute(event: RawEvent): Promise<void> {
  // HMAC-SHA256 해시 계산
  const entityIdHash = await this.hasher.hash(
    event.entityType,
    event.canonicalId,
  );

  try {
    await this.db.transaction(async (tx) => {
      // events_raw INSERT — 중복이면 ON CONFLICT DO NOTHING
      await tx.query(`
        INSERT INTO events_raw
          (source_topic, partition, offset, event_time_ms,
           entity_type, entity_id_hash, payload, key_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (source_topic, partition, offset) DO NOTHING
      `, [
        event.sourceTopic, event.partition, event.offset,
        event.eventTimeMs, event.entityType, entityIdHash,
        event.payload, this.activeKeyId,
      ]);

      // state UPSERT — event_time_ms 기준으로 오래된 이벤트 무시
      const handler = this.dispatcher.resolve(event.entityType);
      await handler.upsertState(tx, entityIdHash, event);
    });

    await this.kafkaConsumer.commitOffset(event);

  } catch (err) {
    await this.handleFailure(event, err);
  }
}
```

---

## 4. 이벤트 핸들러 인터페이스

```typescript
// packages/domain/streaming/handlers/IEventHandler.ts
export interface IEventHandler {
  readonly entityType: string;

  upsertState(
    tx: DbTransaction,
    entityIdHash: string,
    event: RawEvent,
  ): Promise<void>;
}
```

### 구현 예시: OrderCreatedHandler

```typescript
export class OrderCreatedHandler implements IEventHandler {
  readonly entityType = 'order';

  async upsertState(tx, entityIdHash, event): Promise<void> {
    const p = event.payload;

    await tx.query(`
      INSERT INTO state_orders
        (entity_id_hash, updated_event_time_ms, last_offset,
         user_id_hash, status, total_amount_cents, item_count,
         currency_code, created_event_time_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $2)
      ON CONFLICT (entity_id_hash) DO UPDATE SET
        updated_event_time_ms = EXCLUDED.updated_event_time_ms,
        last_offset           = EXCLUDED.last_offset,
        user_id_hash          = EXCLUDED.user_id_hash,
        status                = EXCLUDED.status,
        total_amount_cents    = EXCLUDED.total_amount_cents,
        item_count            = EXCLUDED.item_count,
        currency_code         = EXCLUDED.currency_code
      WHERE state_orders.updated_event_time_ms < EXCLUDED.updated_event_time_ms
    `, [
      entityIdHash, event.eventTimeMs, event.offset,
      await this.hasher.hash('user', p.userId),
      p.status, p.totalAmountCents, p.itemCount, p.currencyCode,
    ]);
  }
}
```

> **핵심**: `WHERE updated_event_time_ms < EXCLUDED.updated_event_time_ms` 조건으로 오래된 이벤트가 최신 상태를 덮어쓰는 것을 방지한다.

---

## 5. DLQ 처리

```
실패 이벤트
    │
    ▼ retry_count < 3
[재시도 (지수 백오프: 1s, 4s, 16s)]
    │
    ▼ retry_count >= 3
[DlqPublisher]
    ├── payload AES-256-GCM 암호화
    ├── dlq_events INSERT
    └── Kafka offset commit (처리 완료 처리)

[ReprocessDlqUseCase] (SECURITY_ADMIN 트리거)
    ├── payload 복호화
    ├── ProcessEventUseCase 재실행
    └── dlq_events.resolved = true, events_raw.recovered = true
```

```typescript
// DlqPublisher.ts
async publish(event: RawEvent, error: Error): Promise<void> {
  const encrypted = await this.encryptor.encrypt(
    Buffer.from(JSON.stringify(event.payload)),
    this.activeKeyId,
  );

  await this.db.query(`
    INSERT INTO dlq_events
      (source_topic, partition, offset, payload_encrypted, key_id, error_message)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [
    event.sourceTopic, event.partition, event.offset,
    encrypted.ciphertext, this.activeKeyId, error.message,
  ]);
}
```

---

## 6. Concurrency Controller

DB 부하 기반 처리 속도 자동 조절.

```typescript
export class ConcurrencyController {
  private currentBatchSize = 100;

  private readonly MAX_BATCH_SIZE = 500;
  private readonly MIN_BATCH_SIZE = 10;
  private readonly P95_HARD_LIMIT_MS = 200;    // DB p95 latency
  private readonly POOL_THROTTLE_PCT = 80;     // connection pool 사용률

  async getBatchSize(): Promise<number> {
    const [p95, poolUsage] = await Promise.all([
      this.metrics.getDbP95LatencyMs(),
      this.metrics.getConnectionPoolUsagePct(),
    ]);

    if (p95 >= this.P95_HARD_LIMIT_MS || poolUsage >= this.POOL_THROTTLE_PCT) {
      // Hard guardrail: 배치 크기 절반으로 감소
      this.currentBatchSize = Math.max(
        this.MIN_BATCH_SIZE,
        Math.floor(this.currentBatchSize / 2),
      );
    } else {
      // Soft goal: 서서히 증가
      this.currentBatchSize = Math.min(
        this.MAX_BATCH_SIZE,
        Math.floor(this.currentBatchSize * 1.1),
      );
    }

    return this.currentBatchSize;
  }
}
```

---

## 7. Kafka 설정

```typescript
// KafkaConsumerAdapter.ts 설정값
const CONSUMER_CONFIG = {
  groupId: 'tfsdc-projector',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxBytesPerPartition: 1048576, // 1MB
  autoCommit: false,             // 수동 commit (멱등성 보장)
};

// 토픽별 파티션 수 (e-commerce mock)
const TOPICS = {
  'ecom.orders':    { partitions: 3 },
  'ecom.payments':  { partitions: 3 },
  'ecom.products':  { partitions: 1 },
  'ecom.shipments': { partitions: 2 },
};
```

---

## 8. 모니터링 지표

Projector가 주기적으로 기록하는 메트릭 (TUI Monitor Scene에서 표시).

| 지표 | 설명 |
|---|---|
| `events_processed_total` | 총 처리 이벤트 수 |
| `events_per_second` | 최근 10초 평균 처리량 |
| `dlq_events_total` | 총 DLQ 이관 수 |
| `batch_size_current` | 현재 배치 크기 |
| `db_p95_latency_ms` | DB p95 응답시간 |
| `consumer_lag` | Kafka consumer lag (파티션별) |
| `duplicate_skip_total` | 중복으로 건너뛴 이벤트 수 |

---

## 9. 테스트 전략

```typescript
describe('ProcessEventUseCase', () => {
  it('동일 (topic, partition, offset)은 두 번 처리되지 않는다', async () => {
    await useCase.execute(event);
    await useCase.execute(event); // 중복
    expect(await db.count('events_raw')).toBe(1);
  });

  it('오래된 이벤트는 최신 상태를 덮어쓰지 않는다', async () => {
    await useCase.execute(newerEvent);   // time=200
    await useCase.execute(olderEvent);  // time=100
    const state = await db.find('state_orders', entityIdHash);
    expect(state.updated_event_time_ms).toBe(200);
  });

  it('3회 실패 시 DLQ에 암호화 저장된다', async () => {
    jest.spyOn(handler, 'upsertState').mockRejectedValue(new Error('DB error'));
    await useCase.execute(event); // 내부적으로 3회 재시도
    expect(await db.count('dlq_events')).toBe(1);
  });
});
```
