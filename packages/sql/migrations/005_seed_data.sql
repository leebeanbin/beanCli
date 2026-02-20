-- =============================================================
-- 005_seed_data.sql
-- Terminal-First Streaming Data Console v1
-- 개발/테스트용 초기 데이터 (LOCAL/DEV 환경 전용)
-- DO NOT RUN IN PROD
-- =============================================================

-- -----------------------------------------------
-- HMAC 초기 키 (개발용 - PROD에서는 별도 키 생성 필수)
-- -----------------------------------------------
INSERT INTO hmac_keys (key_id, key_value, status)
VALUES (
  'dev-key-v1',
  -- 실제 운영에서는 pgcrypto encrypt() 사용
  -- 개발 편의를 위해 평문 바이트로 저장
  decode('6465762d686d61632d736563726574','hex'),
  'ACTIVE'
);

-- -----------------------------------------------
-- e-commerce mock 도메인 초기 상태 데이터
-- (Projector가 없을 때 개발용)
-- -----------------------------------------------

-- Users (10명)
INSERT INTO state_users
  (entity_id_hash, updated_event_time_ms, last_offset, username, status, tier, country_code, created_event_time_ms)
VALUES
  ('hash_user_001', 1700000001000, 1, 'alice_k',   'ACTIVE', 'VIP',      'US', 1700000001000),
  ('hash_user_002', 1700000002000, 2, 'bob_j',     'ACTIVE', 'PREMIUM',  'KR', 1700000002000),
  ('hash_user_003', 1700000003000, 3, 'carol_m',   'ACTIVE', 'STANDARD', 'JP', 1700000003000),
  ('hash_user_004', 1700000004000, 4, 'dave_r',    'ACTIVE', 'STANDARD', 'GB', 1700000004000),
  ('hash_user_005', 1700000005000, 5, 'eve_s',     'INACTIVE','STANDARD','DE', 1700000005000),
  ('hash_user_006', 1700000006000, 6, 'frank_l',   'ACTIVE', 'PREMIUM',  'US', 1700000006000),
  ('hash_user_007', 1700000007000, 7, 'grace_t',   'ACTIVE', 'VIP',      'KR', 1700000007000),
  ('hash_user_008', 1700000008000, 8, 'henry_w',   'ACTIVE', 'STANDARD', 'AU', 1700000008000),
  ('hash_user_009', 1700000009000, 9, 'iris_p',    'ACTIVE', 'STANDARD', 'FR', 1700000009000),
  ('hash_user_010', 1700000010000, 10,'james_b',   'INACTIVE','STANDARD','CA', 1700000010000);

-- Products (5개)
INSERT INTO state_products
  (entity_id_hash, updated_event_time_ms, last_offset, sku, name, category, price_cents, stock_quantity, status, created_event_time_ms)
VALUES
  ('hash_prod_001', 1700000100000, 100, 'SKU-A001', 'Wireless Headphones',   'Electronics', 7999,  50, 'ACTIVE',       1700000100000),
  ('hash_prod_002', 1700000101000, 101, 'SKU-B002', 'Mechanical Keyboard',   'Electronics', 12999, 30, 'ACTIVE',       1700000101000),
  ('hash_prod_003', 1700000102000, 102, 'SKU-C003', 'USB-C Hub',             'Electronics', 3499,  0,  'ACTIVE',       1700000102000),
  ('hash_prod_004', 1700000103000, 103, 'SKU-D004', 'Office Chair',          'Furniture',   49999, 10, 'ACTIVE',       1700000103000),
  ('hash_prod_005', 1700000104000, 104, 'SKU-E005', 'Standing Desk',         'Furniture',   89999, 5,  'DISCONTINUED', 1700000104000);

-- Orders (5개)
INSERT INTO state_orders
  (entity_id_hash, updated_event_time_ms, last_offset, user_id_hash, status, total_amount_cents, item_count, currency_code, created_event_time_ms)
VALUES
  ('hash_ord_001', 1700001000000, 200, 'hash_user_001', 'DELIVERED',       15998, 2, 'USD', 1700001000000),
  ('hash_ord_002', 1700001001000, 201, 'hash_user_002', 'SHIPPED',         12999, 1, 'USD', 1700001001000),
  ('hash_ord_003', 1700001002000, 202, 'hash_user_003', 'PAYMENT_PENDING', 3499,  1, 'USD', 1700001002000),
  ('hash_ord_004', 1700001003000, 203, 'hash_user_006', 'PAID',            49999, 1, 'USD', 1700001003000),
  ('hash_ord_005', 1700001004000, 204, 'hash_user_007', 'CREATED',         107998,2, 'USD', 1700001004000);

-- Payments (5개)
INSERT INTO state_payments
  (entity_id_hash, updated_event_time_ms, last_offset, order_id_hash, user_id_hash, status, amount_cents, currency_code, payment_method, created_event_time_ms)
VALUES
  ('hash_pay_001', 1700001100000, 300, 'hash_ord_001', 'hash_user_001', 'CAPTURED',  15998, 'USD', 'CARD',          1700001100000),
  ('hash_pay_002', 1700001101000, 301, 'hash_ord_002', 'hash_user_002', 'CAPTURED',  12999, 'USD', 'CARD',          1700001101000),
  ('hash_pay_003', 1700001102000, 302, 'hash_ord_003', 'hash_user_003', 'PENDING',   3499,  'USD', 'BANK_TRANSFER', 1700001102000),
  ('hash_pay_004', 1700001103000, 303, 'hash_ord_004', 'hash_user_006', 'CAPTURED',  49999, 'USD', 'WALLET',        1700001103000),
  ('hash_pay_005', 1700001104000, 304, 'hash_ord_005', 'hash_user_007', 'AUTHORIZED',107998,'USD', 'CARD',          1700001104000);

-- Shipments (3개)
INSERT INTO state_shipments
  (entity_id_hash, updated_event_time_ms, last_offset, order_id_hash, user_id_hash, status, carrier, destination_country, created_event_time_ms)
VALUES
  ('hash_ship_001', 1700001200000, 400, 'hash_ord_001', 'hash_user_001', 'DELIVERED',   'FedEx', 'US', 1700001200000),
  ('hash_ship_002', 1700001201000, 401, 'hash_ord_002', 'hash_user_002', 'IN_TRANSIT',  'DHL',   'KR', 1700001201000),
  ('hash_ship_003', 1700001202000, 402, 'hash_ord_004', 'hash_user_006', 'PREPARING',   'UPS',   'US', 1700001202000);

-- -----------------------------------------------
-- 초기 audit 이벤트 (시드 완료 기록)
-- -----------------------------------------------
INSERT INTO audit_events (category, actor, action, resource, result, correlation_id, data)
VALUES (
  'POLICY',
  'SYSTEM',
  'SEED_DATA_APPLIED',
  'database',
  'SUCCESS',
  uuid_generate_v4(),
  jsonb_build_object(
    'environment', 'DEV',
    'tables', ARRAY['state_users','state_products','state_orders','state_payments','state_shipments'],
    'note', 'Development seed data. DO NOT run in PROD.'
  )
);
