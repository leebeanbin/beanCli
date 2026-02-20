-- =============================================================
-- 006_sidecar_api_keys.sql
-- Terminal-First Streaming Data Console v1
-- Sidecar Remote Mode (C) API Key 관리
-- =============================================================

CREATE TABLE sidecar_api_keys (
  id              BIGSERIAL    NOT NULL,
  key_hash        TEXT         NOT NULL,  -- SHA-256(평문 키), 평문은 DB에 미저장
  label           TEXT         NOT NULL,
  issued_by       TEXT         NOT NULL,  -- 발급한 SECURITY_ADMIN
  rate_limit_rps  INT          NOT NULL DEFAULT 100,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT sidecar_api_keys_pkey PRIMARY KEY (id),
  CONSTRAINT sidecar_api_keys_key_hash_unique UNIQUE (key_hash)
);

CREATE INDEX sidecar_api_keys_active_idx
  ON sidecar_api_keys (key_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX sidecar_api_keys_issued_by_idx
  ON sidecar_api_keys (issued_by);

-- RLS: SECURITY_ADMIN만 접근
ALTER TABLE sidecar_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY sidecar_api_keys_security_admin_only
  ON sidecar_api_keys
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'SECURITY_ADMIN'
  );

COMMENT ON TABLE sidecar_api_keys IS 'Sidecar Remote Mode API Key. sck_ 접두사 키의 SHA-256 해시 저장. SECURITY_ADMIN 전용.';
COMMENT ON COLUMN sidecar_api_keys.key_hash IS 'SHA-256(평문 API Key). 발급 시 평문은 한 번만 반환되고 DB에는 해시만 보관.';
