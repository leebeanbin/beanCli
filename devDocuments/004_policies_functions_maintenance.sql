-- =============================================================
-- 004_policies_functions_maintenance.sql
-- Terminal-First Streaming Data Console v1
-- Row Level Security, 유틸 함수, 유지보수 작업
-- =============================================================

-- =============================================================
-- 섹션 1: Row Level Security (RLS)
-- =============================================================

-- change_requests: ANALYST는 자신의 요청만 조회
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY change_requests_analyst_read
  ON change_requests
  FOR SELECT
  USING (
    current_setting('app.current_role', true) != 'ANALYST'
    OR actor = current_setting('app.current_actor', true)
  );

-- audit_events: ANALYST는 자신의 이벤트만 조회
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_events_analyst_read
  ON audit_events
  FOR SELECT
  USING (
    current_setting('app.current_role', true) != 'ANALYST'
    OR actor = current_setting('app.current_actor', true)
  );

-- dlq_events: SECURITY_ADMIN만 접근
ALTER TABLE dlq_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY dlq_events_security_admin_only
  ON dlq_events
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'SECURITY_ADMIN'
  );

-- hmac_keys: SECURITY_ADMIN만 접근
ALTER TABLE hmac_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY hmac_keys_security_admin_only
  ON hmac_keys
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'SECURITY_ADMIN'
  );

-- =============================================================
-- 섹션 2: 유틸리티 함수
-- =============================================================

-- -----------------------------------------------
-- get_active_hmac_key_id()
-- 현재 ACTIVE 키 ID 반환
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION get_active_hmac_key_id()
RETURNS TEXT AS $$
  SELECT key_id FROM hmac_keys WHERE status = 'ACTIVE' LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- -----------------------------------------------
-- compute_entity_id_hash(key_id, canonical_id)
-- HMAC-SHA256 해시 계산 (pgcrypto 사용)
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION compute_entity_id_hash(
  p_key_id     TEXT,
  p_canonical  TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_key BYTEA;
BEGIN
  SELECT key_value INTO v_key
  FROM hmac_keys
  WHERE key_id = p_key_id AND status IN ('ACTIVE', 'PREVIOUS');

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'HMAC key not found or retired: %', p_key_id;
  END IF;

  RETURN encode(hmac(p_canonical::BYTEA, v_key, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------
-- rotate_hmac_key(new_key_id, new_key_value)
-- 키 회전 수행 (SECURITY_ADMIN 전용)
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION rotate_hmac_key(
  p_new_key_id    TEXT,
  p_new_key_value BYTEA
)
RETURNS VOID AS $$
BEGIN
  -- 현재 ACTIVE → PREVIOUS
  UPDATE hmac_keys
  SET status = 'PREVIOUS', rotated_at = now()
  WHERE status = 'ACTIVE';

  -- 기존 PREVIOUS → RETIRED
  UPDATE hmac_keys
  SET status = 'RETIRED', retired_at = now()
  WHERE status = 'PREVIOUS'
    AND key_id != (SELECT key_id FROM hmac_keys WHERE status = 'PREVIOUS' ORDER BY rotated_at DESC LIMIT 1);

  -- 새 키 삽입
  INSERT INTO hmac_keys (key_id, key_value, status)
  VALUES (p_new_key_id, p_new_key_value, 'ACTIVE');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------
-- validate_change_request_transition(current, next)
-- 상태 전이 유효성 검사
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION validate_change_request_transition(
  p_current change_request_status,
  p_next    change_request_status
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN CASE
    WHEN p_current = 'DRAFT'              AND p_next = 'PENDING_APPROVAL' THEN true
    WHEN p_current = 'DRAFT'              AND p_next = 'APPROVED'          THEN true  -- policy: no approval needed
    WHEN p_current = 'PENDING_APPROVAL'   AND p_next = 'APPROVED'          THEN true
    WHEN p_current = 'PENDING_APPROVAL'   AND p_next = 'DRAFT'             THEN true  -- rejection → back to draft
    WHEN p_current = 'APPROVED'           AND p_next = 'WAITING_EXECUTION' THEN true
    WHEN p_current = 'APPROVED'           AND p_next = 'EXECUTING'         THEN true  -- AUTO mode
    WHEN p_current = 'WAITING_EXECUTION'  AND p_next = 'EXECUTING'         THEN true
    WHEN p_current = 'EXECUTING'          AND p_next = 'DONE'              THEN true
    WHEN p_current = 'EXECUTING'          AND p_next = 'FAILED'            THEN true
    WHEN p_current = 'FAILED'             AND p_next = 'REVERTED'          THEN true
    ELSE false
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- -----------------------------------------------
-- transition_change_request(id, next_status, actor, reason?)
-- 상태 전이 + 자동 타임스탬프 + audit 기록
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION transition_change_request(
  p_id          UUID,
  p_next        change_request_status,
  p_actor       TEXT,
  p_reason      TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_current change_request_status;
BEGIN
  SELECT status INTO v_current
  FROM change_requests
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ChangeRequest not found: %', p_id;
  END IF;

  IF NOT validate_change_request_transition(v_current, p_next) THEN
    RAISE EXCEPTION 'Invalid status transition: % → %', v_current, p_next;
  END IF;

  UPDATE change_requests
  SET
    status       = p_next,
    approved_by  = CASE WHEN p_next = 'APPROVED' THEN p_actor ELSE approved_by END,
    approved_at  = CASE WHEN p_next = 'APPROVED' THEN now()   ELSE approved_at END,
    executed_at  = CASE WHEN p_next = 'DONE'     THEN now()   ELSE executed_at END,
    reverted_at  = CASE WHEN p_next = 'REVERTED' THEN now()   ELSE reverted_at END,
    failure_reason = CASE WHEN p_next = 'FAILED' THEN p_reason ELSE failure_reason END,
    updated_at   = now()
  WHERE id = p_id;

  -- audit 자동 기록
  INSERT INTO audit_events (category, actor, action, resource, result, correlation_id, data)
  SELECT
    'CHANGE',
    p_actor,
    'STATUS_TRANSITION:' || v_current || '_TO_' || p_next,
    'change_requests/' || p_id,
    'SUCCESS',
    correlation_id,
    jsonb_build_object(
      'from', v_current,
      'to', p_next,
      'reason', p_reason
    )
  FROM change_requests WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 섹션 3: 유지보수 (Maintenance)
-- =============================================================

-- -----------------------------------------------
-- cleanup_expired_snapshots()
-- TTL 만료된 backup_snapshots 삭제
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_expired_snapshots()
RETURNS INT AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM backup_snapshots
  WHERE expires_at < now()
    AND NOT EXISTS (
      -- REVERTED 상태인 경우 보존 (revert 진행 중일 수 있음)
      SELECT 1 FROM change_requests cr
      WHERE cr.id = backup_snapshots.change_id
        AND cr.status IN ('EXECUTING', 'FAILED')
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- cleanup 감사 기록
  INSERT INTO audit_events (category, actor, action, resource, result, correlation_id, data)
  VALUES (
    'POLICY',
    'SYSTEM',
    'CLEANUP_EXPIRED_SNAPSHOTS',
    'backup_snapshots',
    'SUCCESS',
    uuid_generate_v4(),
    jsonb_build_object('deleted_count', v_deleted)
  );

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------
-- cleanup_resolved_dlq(older_than_days INT DEFAULT 30)
-- 처리 완료된 DLQ 이벤트 정리
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_resolved_dlq(
  p_older_than_days INT DEFAULT 30
)
RETURNS INT AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM dlq_events
  WHERE resolved = true
    AND created_at < (now() - (p_older_than_days || ' days')::INTERVAL);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO audit_events (category, actor, action, resource, result, correlation_id, data)
  VALUES (
    'POLICY',
    'SYSTEM',
    'CLEANUP_RESOLVED_DLQ',
    'dlq_events',
    'SUCCESS',
    uuid_generate_v4(),
    jsonb_build_object('deleted_count', v_deleted, 'older_than_days', p_older_than_days)
  );

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 섹션 4: 뷰 (Views)
-- =============================================================

-- -----------------------------------------------
-- v_pending_changes
-- 승인 대기 중인 변경 요청 요약 (Web Approval Inbox용)
-- -----------------------------------------------
CREATE VIEW v_pending_changes AS
SELECT
  id,
  actor,
  role,
  target_table,
  risk_level,
  execution_mode,
  environment,
  is_bulk_change,
  affected_rows_estimate,
  created_at,
  EXTRACT(EPOCH FROM (now() - created_at)) / 60 AS waiting_minutes
FROM change_requests
WHERE status = 'PENDING_APPROVAL'
ORDER BY risk_level DESC, created_at ASC;

COMMENT ON VIEW v_pending_changes IS 'Web Approval Inbox 전용. 위험도 높은 건 먼저 표시.';

-- -----------------------------------------------
-- v_change_timeline
-- 최근 변경 이력 타임라인 (Web Change Timeline용)
-- -----------------------------------------------
CREATE VIEW v_change_timeline AS
SELECT
  cr.id,
  cr.status,
  cr.actor,
  cr.role,
  cr.target_table,
  cr.risk_level,
  cr.execution_mode,
  cr.environment,
  cr.is_bulk_change,
  cr.affected_rows_actual,
  cr.approved_by,
  cr.approved_at,
  cr.executed_at,
  cr.reverted_at,
  cr.created_at,
  cr.updated_at,
  bs.snapshot_count
FROM change_requests cr
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS snapshot_count
  FROM backup_snapshots
  WHERE change_id = cr.id
) bs ON true
ORDER BY cr.updated_at DESC;

-- -----------------------------------------------
-- v_streaming_health
-- 스트리밍 파이프라인 상태 모니터링 (TUI Monitor Scene용)
-- -----------------------------------------------
CREATE VIEW v_streaming_health AS
SELECT
  entity_type,
  COUNT(*) AS total_events,
  MAX(event_time_ms) AS latest_event_time_ms,
  COUNT(*) FILTER (WHERE recovered = true) AS recovered_count,
  COUNT(*) FILTER (WHERE dlq_ref IS NOT NULL) AS dlq_ref_count,
  MAX(created_at) AS latest_ingested_at,
  -- 최근 1분 처리량
  COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '1 minute') AS events_last_1min,
  -- 최근 5분 처리량
  COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '5 minutes') AS events_last_5min
FROM events_raw
GROUP BY entity_type;

COMMENT ON VIEW v_streaming_health IS 'TUI Monitor Scene용. 엔티티 타입별 스트리밍 처리 현황.';
