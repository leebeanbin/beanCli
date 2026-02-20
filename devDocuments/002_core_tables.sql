-- =============================================================
-- 002_core_tables.sql
-- Terminal-First Streaming Data Console v1
-- Core infrastructure tables
-- =============================================================

-- -----------------------------------------------
-- hmac_keys
-- HMAC-SHA256 키 관리 + key rotation 지원
-- -----------------------------------------------
CREATE TABLE hmac_keys (
  key_id       TEXT         NOT NULL,
  key_value    BYTEA        NOT NULL,  -- 암호화 저장 (pgcrypto)
  status       key_status   NOT NULL DEFAULT 'ACTIVE',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  rotated_at   TIMESTAMPTZ,
  retired_at   TIMESTAMPTZ,

  CONSTRAINT hmac_keys_pkey PRIMARY KEY (key_id)
);

-- 동시에 ACTIVE 키는 1개만 허용
CREATE UNIQUE INDEX hmac_keys_active_unique
  ON hmac_keys (status)
  WHERE status = 'ACTIVE';

COMMENT ON TABLE hmac_keys IS 'HMAC-SHA256 키 관리. 30일 주기 또는 SECURITY_ADMIN 수동 회전.';
COMMENT ON COLUMN hmac_keys.key_value IS 'pgcrypto로 암호화된 키 바이트. 복호화는 SECURITY_ADMIN만 가능.';

-- -----------------------------------------------
-- events_raw
-- Kafka 스트리밍 원천 이벤트 저장소
-- -----------------------------------------------
CREATE TABLE events_raw (
  id              BIGSERIAL    NOT NULL,
  source_topic    TEXT         NOT NULL,
  partition       INT          NOT NULL,
  offset          BIGINT       NOT NULL,
  event_time_ms   BIGINT       NOT NULL,
  entity_type     TEXT         NOT NULL,
  entity_id_hash  TEXT         NOT NULL,  -- HMAC-SHA256
  entity_id_plain TEXT,                   -- PROD 기본 NULL, 환경변수로 override
  payload         JSONB        NOT NULL,
  recovered       BOOLEAN      NOT NULL DEFAULT false,
  dlq_ref         TEXT,                   -- DLQ 원본 참조 키
  key_id          TEXT         NOT NULL,  -- 사용된 HMAC 키 참조
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT events_raw_pkey PRIMARY KEY (id),
  CONSTRAINT events_raw_topic_partition_offset_unique
    UNIQUE (source_topic, partition, offset)
);

CREATE INDEX events_raw_entity_type_hash_idx
  ON events_raw (entity_type, entity_id_hash);

CREATE INDEX events_raw_event_time_ms_idx
  ON events_raw (event_time_ms DESC);

CREATE INDEX events_raw_created_at_idx
  ON events_raw (created_at DESC);

CREATE INDEX events_raw_recovered_idx
  ON events_raw (recovered)
  WHERE recovered = true;

COMMENT ON TABLE events_raw IS 'Kafka 원천 이벤트 저장. Projector가 INSERT, 중복은 unique constraint로 방지.';
COMMENT ON COLUMN events_raw.entity_id_plain IS 'PROD 기본 NULL. ENTITY_ID_PLAIN_ENABLED=true 환경변수로 저장 활성화 가능.';

-- -----------------------------------------------
-- dlq_events
-- Dead Letter Queue - 실패 이벤트 격리 저장
-- -----------------------------------------------
CREATE TABLE dlq_events (
  id                  BIGSERIAL    NOT NULL,
  source_topic        TEXT         NOT NULL,
  partition           INT          NOT NULL,
  offset              BIGINT       NOT NULL,
  payload_encrypted   BYTEA        NOT NULL,  -- AES-256-GCM 암호화
  key_id              TEXT         NOT NULL,  -- 복호화 키 참조
  error_message       TEXT         NOT NULL,
  retry_count         INT          NOT NULL DEFAULT 0,
  last_retry_at       TIMESTAMPTZ,
  resolved            BOOLEAN      NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT dlq_events_pkey PRIMARY KEY (id)
);

CREATE INDEX dlq_events_resolved_idx
  ON dlq_events (resolved)
  WHERE resolved = false;

CREATE INDEX dlq_events_created_at_idx
  ON dlq_events (created_at DESC);

COMMENT ON TABLE dlq_events IS 'DLQ. 3회 재시도 실패 이벤트 격리. 열람/재처리는 SECURITY_ADMIN 전용.';
COMMENT ON COLUMN dlq_events.payload_encrypted IS 'AES-256-GCM으로 암호화. key_id로 복호화 키 추적.';

-- -----------------------------------------------
-- change_requests
-- 모든 데이터 변경 요청의 생명주기 추적
-- -----------------------------------------------
CREATE TABLE change_requests (
  id               UUID                    NOT NULL DEFAULT uuid_generate_v4(),
  status           change_request_status   NOT NULL DEFAULT 'DRAFT',
  actor            TEXT                    NOT NULL,
  role             user_role               NOT NULL,
  target_table     TEXT                    NOT NULL,
  sql_statement    TEXT                    NOT NULL,
  ast_hash         TEXT                    NOT NULL,  -- SQL AST 무결성 검증
  risk_score       INT                     NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level       risk_level              NOT NULL,
  execution_mode   execution_mode          NOT NULL,
  environment      environment             NOT NULL,
  is_bulk_change   BOOLEAN                 NOT NULL DEFAULT false,  -- >= 1000행
  affected_rows_estimate INT,                -- EXPLAIN 기반 추정치
  affected_rows_actual   INT,               -- 실행 후 실제값
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  executed_at      TIMESTAMPTZ,
  reverted_at      TIMESTAMPTZ,
  failure_reason   TEXT,
  correlation_id   UUID                    NOT NULL DEFAULT uuid_generate_v4(),
  created_at       TIMESTAMPTZ             NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ             NOT NULL DEFAULT now(),

  CONSTRAINT change_requests_pkey PRIMARY KEY (id)
);

CREATE INDEX change_requests_status_idx
  ON change_requests (status);

CREATE INDEX change_requests_actor_idx
  ON change_requests (actor);

CREATE INDEX change_requests_target_table_idx
  ON change_requests (target_table);

CREATE INDEX change_requests_created_at_idx
  ON change_requests (created_at DESC);

CREATE INDEX change_requests_correlation_id_idx
  ON change_requests (correlation_id);

CREATE INDEX change_requests_pending_idx
  ON change_requests (status, created_at DESC)
  WHERE status = 'PENDING_APPROVAL';

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER change_requests_updated_at_trigger
  BEFORE UPDATE ON change_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE change_requests IS '모든 데이터 변경 요청. DRAFT → DONE/FAILED/REVERTED 상태 전이.';
COMMENT ON COLUMN change_requests.ast_hash IS 'SQL AST의 SHA-256 해시. 실행 전 무결성 재검증에 사용.';
COMMENT ON COLUMN change_requests.is_bulk_change IS 'affected_rows_estimate >= 1000 시 true. 추가 승인 및 L2 강제 적용.';

-- -----------------------------------------------
-- backup_snapshots
-- 변경 대상 row의 사전 스냅샷 (TTL 7일)
-- -----------------------------------------------
CREATE TABLE backup_snapshots (
  id            BIGSERIAL    NOT NULL,
  change_id     UUID         NOT NULL,
  table_name    TEXT         NOT NULL,
  where_clause  TEXT         NOT NULL,
  snapshot      JSONB        NOT NULL,  -- 변경 전 row 데이터
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ  NOT NULL DEFAULT (now() + INTERVAL '7 days'),

  CONSTRAINT backup_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT backup_snapshots_change_id_fkey
    FOREIGN KEY (change_id) REFERENCES change_requests(id)
);

CREATE INDEX backup_snapshots_change_id_idx
  ON backup_snapshots (change_id);

CREATE INDEX backup_snapshots_expires_at_idx
  ON backup_snapshots (expires_at)
  WHERE expires_at > now();

COMMENT ON TABLE backup_snapshots IS '변경 전 row 스냅샷. TTL 7일. L2 변경 필수, L0/L1 선택.';
COMMENT ON COLUMN backup_snapshots.expires_at IS 'TTL 7일. 만료된 스냅샷은 vacuum job이 주기적으로 삭제.';

-- -----------------------------------------------
-- audit_events
-- 모든 행위의 불변 감사 로그 (INSERT ONLY)
-- -----------------------------------------------
CREATE TABLE audit_events (
  id              BIGSERIAL      NOT NULL,
  category        audit_category NOT NULL,
  actor           TEXT           NOT NULL,
  action          TEXT           NOT NULL,
  resource        TEXT           NOT NULL,
  result          audit_result   NOT NULL,
  correlation_id  UUID           NOT NULL,
  data            JSONB          NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT audit_events_pkey PRIMARY KEY (id)
);

-- audit_events는 UPDATE/DELETE 금지 (INSERT ONLY)
CREATE OR REPLACE RULE audit_events_no_update AS
  ON UPDATE TO audit_events DO INSTEAD NOTHING;

CREATE OR REPLACE RULE audit_events_no_delete AS
  ON DELETE TO audit_events DO INSTEAD NOTHING;

CREATE INDEX audit_events_actor_idx
  ON audit_events (actor, created_at DESC);

CREATE INDEX audit_events_category_action_idx
  ON audit_events (category, action);

CREATE INDEX audit_events_correlation_id_idx
  ON audit_events (correlation_id);

CREATE INDEX audit_events_created_at_idx
  ON audit_events (created_at DESC);

COMMENT ON TABLE audit_events IS '불변 감사 로그. INSERT ONLY. UPDATE/DELETE rule로 변경 차단.';
