# Phase 7: 보안 및 운영

## 개요

보안은 설계 단계부터 내재화되어 있다. HMAC 기반 entity ID 익명화, AES-256 DLQ 암호화, key rotation, Sidecar JWT 인증이 핵심이다.

---

## 1. HMAC Entity ID 익명화

### 1.1 설계 원칙

원본 entity ID(user_id, order_id 등)는 DB에 직접 저장하지 않는다. 대신 `HMAC-SHA256(key, canonical_id)`를 계산해 `entity_id_hash`로 저장한다.

```
canonical_id 정규화 규칙 (엔티티 타입별):
  user:    "user:{userId}"
  order:   "order:{orderId}"
  payment: "payment:{paymentId}"
  product: "product:{sku}"
```

### 1.2 구현

```typescript
// packages/infrastructure/security/HmacHasher.ts
import { createHmac } from 'crypto';

export class HmacHasher {
  constructor(private readonly keyStore: IKeyStore) {}

  async hash(entityType: string, rawId: string): Promise<string> {
    const activeKey = await this.keyStore.getActiveKey();
    const canonical = `${entityType}:${rawId}`;

    return createHmac('sha256', activeKey.value)
      .update(canonical)
      .digest('hex');
  }

  async hashWithKeyId(
    entityType: string,
    rawId: string,
    keyId: string,
  ): Promise<string> {
    const key = await this.keyStore.getKeyById(keyId);
    const canonical = `${entityType}:${rawId}`;

    return createHmac('sha256', key.value)
      .update(canonical)
      .digest('hex');
  }
}
```

### 1.3 entity_id_plain 정책

```typescript
// 환경변수 기반 제어
const ENTITY_ID_PLAIN_ENABLED =
  process.env.APP_ENV === 'prod'
    ? (process.env.ENTITY_ID_PLAIN_ENABLED === 'true')  // PROD: 기본 false
    : true;  // DEV/LOCAL: 기본 true

// PROD에서 활성화 시 audit 경고 기록
if (process.env.APP_ENV === 'prod' && ENTITY_ID_PLAIN_ENABLED) {
  await auditWriter.write({
    category: 'SECURITY',
    actor: 'SYSTEM',
    action: 'ENTITY_ID_PLAIN_ENABLED_IN_PROD',
    resource: 'config',
    result: 'SUCCESS',
    data: { warning: 'entity_id_plain storage enabled in PROD environment' },
  });
}
```

---

## 2. Key Rotation

### 2.1 회전 흐름

```
[SECURITY_ADMIN 트리거 또는 30일 스케줄러]
    │
    ▼
1. 새 키 생성 (crypto.randomBytes(32))
2. DB: ACTIVE → PREVIOUS
3. DB: PREVIOUS (구) → RETIRED
4. DB: 새 키 → ACTIVE
5. audit_events 기록
6. Projector에 새 키 공지 (Kafka 내부 토픽)
```

```typescript
// packages/application/security/RotateKeyUseCase.ts
export class RotateKeyUseCase {
  async execute(actor: string): Promise<void> {
    const newKeyId = `key-${Date.now()}`;
    const newKeyValue = crypto.randomBytes(32);

    // DB 함수 호출 (004_policies_functions_maintenance.sql)
    await this.db.query(
      'SELECT rotate_hmac_key($1, $2)',
      [newKeyId, newKeyValue],
    );

    // Projector에 키 변경 통지
    await this.kafkaProducer.send({
      topic: 'tfsdc.internal.key-rotation',
      messages: [{ value: JSON.stringify({ newKeyId }) }],
    });

    await this.auditWriter.write({
      category: 'SECURITY',
      actor,
      action: 'KEY_ROTATION',
      resource: `hmac_keys/${newKeyId}`,
      result: 'SUCCESS',
    });
  }
}
```

### 2.2 키 상태 전이

```
ACTIVE ──rotate──> PREVIOUS ──rotate──> RETIRED
   ↑
   new key
```

- `ACTIVE`: 현재 새 이벤트 해시에 사용
- `PREVIOUS`: 유예 기간 (기존 이벤트 재처리 가능)
- `RETIRED`: 사용 불가 (복호화만 가능, 별도 보관)

---

## 3. AES-256-GCM DLQ 암호화

### 3.1 암호화

```typescript
// packages/infrastructure/security/AesEncryptor.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export class AesEncryptor {
  private readonly ALGORITHM = 'aes-256-gcm';

  async encrypt(
    plaintext: Buffer,
    keyId: string,
  ): Promise<{ ciphertext: Buffer; keyId: string }> {
    const key = await this.keyStore.getActiveKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.ALGORITHM, key.value, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // IV(16) + AuthTag(16) + Ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return { ciphertext: combined, keyId };
  }

  async decrypt(
    ciphertext: Buffer,
    keyId: string,
  ): Promise<Buffer> {
    const key = await this.keyStore.getKeyById(keyId);
    const iv = ciphertext.subarray(0, 16);
    const authTag = ciphertext.subarray(16, 32);
    const encrypted = ciphertext.subarray(32);

    const decipher = createDecipheriv(this.ALGORITHM, key.value, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}
```

---

## 4. Sidecar 설계

### 4.1 모드별 동작

| 모드 | 시작 | 인증 | 용도 |
|------|------|------|------|
| A. Daemon | OS 서비스 | 로컬 소켓 | 단독 서버 |
| B. Managed | API 수명 관리 | 없음(로컬) | 기본값 |
| C. Remote | 독립 실행 | JWT/API Key | 팀 공유 |

### 4.2 Remote Mode (C) — JWT 인증

```typescript
// packages/infrastructure/sidecar/SidecarRemoteAuth.ts

// API Key 발급 (SECURITY_ADMIN)
export class SidecarApiKeyService {
  async issue(actor: string, label: string): Promise<string> {
    const key = `sck_${crypto.randomBytes(24).toString('hex')}`;
    const hashed = sha256(key);

    await this.db.query(`
      INSERT INTO sidecar_api_keys (key_hash, label, issued_by, rate_limit_rps)
      VALUES ($1, $2, $3, 100)
    `, [hashed, label, actor]);

    await this.auditWriter.write({ action: 'SIDECAR_KEY_ISSUED', actor, ... });

    return key; // 발급 시 단 한 번만 평문 반환
  }

  async revoke(keyHash: string, actor: string): Promise<void> {
    await this.db.query(
      'UPDATE sidecar_api_keys SET revoked_at = now() WHERE key_hash = $1',
      [keyHash],
    );
    await this.auditWriter.write({ action: 'SIDECAR_KEY_REVOKED', actor, ... });
  }
}

// Remote Sidecar 요청 인증 미들웨어
export async function sidecarAuthMiddleware(req, reply) {
  const apiKey = req.headers['x-sidecar-api-key'];
  const bearerToken = req.headers.authorization?.replace('Bearer ', '');

  if (apiKey) {
    const hashed = sha256(apiKey);
    const record = await db.query(
      'SELECT * FROM sidecar_api_keys WHERE key_hash = $1 AND revoked_at IS NULL',
      [hashed],
    );
    if (!record) return reply.status(401).send({ error: 'Invalid API Key' });

    // Rate limit 체크 (연결당 100 req/s)
    await rateLimiter.check(`sidecar:${hashed}`, 100);

  } else if (bearerToken) {
    // JWT 검증 (만료: 1시간)
    const payload = await verifyJwt(bearerToken);
    if (!payload || payload.type !== 'sidecar') {
      return reply.status(401).send({ error: 'Invalid JWT' });
    }
  } else {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}
```

### 4.3 Sidecar 역할

```
Sidecar (Remote Mode C)
    │
    ├── Kafka 이벤트 수신 + 버퍼링
    ├── Backpressure 적용 (클라이언트 처리 속도 기반)
    ├── 여러 TUI 클라이언트에 멀티플렉싱
    └── TLS 암호화 전송
```

```typescript
// Sidecar 연결 설정 (TUI 클라이언트 측)
const SIDECAR_CONFIG = {
  mode: 'REMOTE',
  endpoint: 'wss://sidecar.internal.company.com',
  auth: {
    type: 'api-key',                    // 또는 'jwt'
    value: process.env.SIDECAR_API_KEY,
  },
  tls: true,                            // 필수
  rateLimitRps: 100,
};
```

---

## 5. 보안 감사 이벤트

보안 관련 모든 행위는 `SECURITY` 카테고리로 별도 기록된다.

| Action | 트리거 |
|--------|--------|
| `KEY_ROTATION` | HMAC 키 회전 |
| `SIDECAR_KEY_ISSUED` | API Key 발급 |
| `SIDECAR_KEY_REVOKED` | API Key 폐기 |
| `DLQ_ACCESSED` | DLQ 이벤트 열람 |
| `DLQ_DECRYPTED` | DLQ payload 복호화 |
| `ENTITY_ID_PLAIN_ENABLED_IN_PROD` | PROD plain 저장 활성화 |
| `UNAUTHORIZED_ACCESS` | 권한 없는 접근 시도 |

---

## 6. 운영 스케줄러

```typescript
// apps/api/scheduler.ts
export function startScheduler(): void {
  // 만료 스냅샷 정리 (매일 새벽 3시)
  cron.schedule('0 3 * * *', async () => {
    const deleted = await db.query('SELECT cleanup_expired_snapshots()');
    logger.info(`Cleaned up ${deleted} expired snapshots`);
  });

  // 처리된 DLQ 정리 (매주 일요일)
  cron.schedule('0 2 * * 0', async () => {
    const deleted = await db.query('SELECT cleanup_resolved_dlq(30)');
    logger.info(`Cleaned up ${deleted} resolved DLQ events`);
  });

  // HMAC 키 자동 회전 (30일 주기)
  cron.schedule('0 0 * * *', async () => {
    const activeKey = await keyStore.getActiveKey();
    const ageInDays = daysSince(activeKey.createdAt);

    if (ageInDays >= 30) {
      await rotateKeyUseCase.execute('SYSTEM');
      logger.info('HMAC key auto-rotated');
    }
  });
}
```

---

## 7. 위협 모델 요약

| 위협 | 대응 |
|------|------|
| DB 유출 시 PII 노출 | entity_id_hash로 원본 ID 익명화 |
| DLQ payload 평문 노출 | AES-256-GCM 암호화 저장 |
| HMAC 키 탈취 | 30일 rotation + PREVIOUS/RETIRED 분리 |
| 무단 DLQ 접근 | SECURITY_ADMIN Role + RLS 이중 차단 |
| Sidecar 무단 연결 | JWT/API Key + TLS 필수 |
| 감사 로그 위변조 | INSERT ONLY rule (UPDATE/DELETE 차단) |
| 권한 없는 UI 접근 | RBAC 미들웨어 + 프론트 렌더링 단계 잠금 |
