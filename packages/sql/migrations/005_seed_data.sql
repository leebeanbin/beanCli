-- =============================================================
-- 005_seed_data.sql
-- Terminal-First Streaming Data Console v1
-- 커머스 실전형 개발/테스트 시드 데이터 (DEV 전용)
-- DO NOT RUN IN PROD
-- =============================================================

-- HMAC dev key
INSERT INTO hmac_keys (key_id, key_value, status)
VALUES ('dev-key-v1', decode('6465762d686d61632d736563726574','hex'), 'ACTIVE')
ON CONFLICT (key_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- USERS (20명)  ACTIVE:15 / INACTIVE:5  STANDARD:9/PREMIUM:6/VIP:5
-- ──────────────────────────────────────────────────────────────
INSERT INTO state_users
  (entity_id_hash, updated_event_time_ms, last_offset,
   username, status, tier, country_code, created_event_time_ms)
VALUES
  ('usr_alice_kr',   1733000001000,  1,  'alice.k',      'ACTIVE',   'VIP',      'KR', 1700000001000),
  ('usr_bob_us',     1733000002000,  2,  'bob.johnson',  'ACTIVE',   'PREMIUM',  'US', 1700000002000),
  ('usr_carol_jp',   1733000003000,  3,  'carol.m',      'ACTIVE',   'STANDARD', 'JP', 1700000003000),
  ('usr_dave_gb',    1733000004000,  4,  'dave.r',       'ACTIVE',   'STANDARD', 'GB', 1700000004000),
  ('usr_eve_de',     1733000005000,  5,  'eve.schmidt',  'INACTIVE', 'STANDARD', 'DE', 1700000005000),
  ('usr_frank_us',   1733000006000,  6,  'frank.l',      'ACTIVE',   'PREMIUM',  'US', 1700000006000),
  ('usr_grace_kr',   1733000007000,  7,  'grace.t',      'ACTIVE',   'VIP',      'KR', 1700000007000),
  ('usr_henry_au',   1733000008000,  8,  'henry.w',      'ACTIVE',   'STANDARD', 'AU', 1700000008000),
  ('usr_iris_fr',    1733000009000,  9,  'iris.p',       'ACTIVE',   'PREMIUM',  'FR', 1700000009000),
  ('usr_james_ca',   1733000010000, 10,  'james.b',      'INACTIVE', 'STANDARD', 'CA', 1700000010000),
  ('usr_karen_sg',   1733000011000, 11,  'karen.lim',    'ACTIVE',   'VIP',      'SG', 1700000011000),
  ('usr_leo_br',     1733000012000, 12,  'leo.silva',    'ACTIVE',   'STANDARD', 'BR', 1700000012000),
  ('usr_mia_us',     1733000013000, 13,  'mia.chen',     'ACTIVE',   'PREMIUM',  'US', 1700000013000),
  ('usr_noah_in',    1733000014000, 14,  'noah.patel',   'ACTIVE',   'STANDARD', 'IN', 1700000014000),
  ('usr_olivia_nl',  1733000015000, 15,  'olivia.v',     'INACTIVE', 'PREMIUM',  'NL', 1700000015000),
  ('usr_paul_kr',    1733000016000, 16,  'paul.oh',      'ACTIVE',   'VIP',      'KR', 1700000016000),
  ('usr_quinn_mx',   1733000017000, 17,  'quinn.reyes',  'ACTIVE',   'STANDARD', 'MX', 1700000017000),
  ('usr_rosa_it',    1733000018000, 18,  'rosa.ferrari', 'INACTIVE', 'STANDARD', 'IT', 1700000018000),
  ('usr_sam_us',     1733000019000, 19,  'sam.taylor',   'ACTIVE',   'VIP',      'US', 1700000019000),
  ('usr_tina_cn',    1733000020000, 20,  'tina.wang',    'INACTIVE', 'STANDARD', 'CN', 1700000020000)
ON CONFLICT (entity_id_hash) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- PRODUCTS (14개)  Electronics/Fashion/Sports/Home/Food
-- ──────────────────────────────────────────────────────────────
INSERT INTO state_products
  (entity_id_hash, updated_event_time_ms, last_offset,
   sku, name, category, price_cents, stock_quantity, status,
   created_event_time_ms)
VALUES
  ('prd_wh_pro',      1733100001000, 100, 'ELEC-001', 'AirPods Pro Max',        'Electronics',  54900,  42,  'ACTIVE',       1700100001000),
  ('prd_kb_mech',     1733100002000, 101, 'ELEC-002', 'MX Keys S Keyboard',     'Electronics',  11900,  88,  'ACTIVE',       1700100002000),
  ('prd_hub_usbc',    1733100003000, 102, 'ELEC-003', 'USB-C 12-in-1 Hub',      'Electronics',   5900,   0,  'ACTIVE',       1700100003000),
  ('prd_chair_ergo',  1733100004000, 103, 'FURN-001', 'Herman Miller Aeron',    'Furniture',    139900,   5,  'ACTIVE',       1700100004000),
  ('prd_desk_stand',  1733100005000, 104, 'FURN-002', 'Flexispot E7 Desk',      'Furniture',     69900,   3,  'ACTIVE',       1700100005000),
  ('prd_jacket_wl',   1733100006000, 105, 'FASH-001', 'Patagonia Nano Puff',    'Fashion',       27900,  20,  'ACTIVE',       1700100006000),
  ('prd_shoes_run',   1733100007000, 106, 'SPRT-001', 'Nike Air Zoom Pegasus',  'Sports',        13900,  55,  'ACTIVE',       1700100007000),
  ('prd_mat_yoga',    1733100008000, 107, 'SPRT-002', 'Manduka PRO Yoga Mat',   'Sports',         8900,  12,  'ACTIVE',       1700100008000),
  ('prd_monitor_27',  1733100009000, 108, 'ELEC-004', 'LG UltraWide 34"',       'Electronics',  89900,   7,  'ACTIVE',       1700100009000),
  ('prd_bag_travel',  1733100010000, 109, 'FASH-002', 'Tumi Alpha 3 Carry-On',  'Fashion',       62900,   0,  'DISCONTINUED', 1700100010000),
  ('prd_coffee_sub',  1733100011000, 110, 'FOOD-001', 'Blue Bottle Monthly Box', 'Food',          3900,  99,  'ACTIVE',       1700100011000),
  ('prd_watch_smart', 1733100012000, 111, 'ELEC-005', 'Apple Watch Ultra 2',    'Electronics',  79900,  18,  'ACTIVE',       1700100012000),
  ('prd_headset_vr',  1733100013000, 112, 'ELEC-006', 'Meta Quest 3',           'Electronics',  49900,   0,  'ACTIVE',       1700100013000),
  ('prd_bottle_water',1733100014000, 113, 'LIFE-001', 'Stanley Quencher 40oz',  'Lifestyle',     4500,  200, 'ACTIVE',       1700100014000)
ON CONFLICT (entity_id_hash) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- ORDERS (22개)  전체 상태 스펙트럼
-- ──────────────────────────────────────────────────────────────
INSERT INTO state_orders
  (entity_id_hash, updated_event_time_ms, last_offset,
   user_id_hash, status, total_amount_cents, item_count, currency_code,
   created_event_time_ms)
VALUES
  ('ord_001', 1735200001000, 200, 'usr_alice_kr',  'DELIVERED',       54900,  1, 'USD', 1733200001000),
  ('ord_002', 1735200002000, 201, 'usr_bob_us',    'SHIPPED',         25800,  2, 'USD', 1733200002000),
  ('ord_003', 1735200003000, 202, 'usr_carol_jp',  'PAYMENT_PENDING',  5900,  1, 'JPY', 1735200003000),
  ('ord_004', 1735200004000, 203, 'usr_frank_us',  'PAID',           139900,  1, 'USD', 1734200004000),
  ('ord_005', 1735200005000, 204, 'usr_grace_kr',  'FULFILLING',     164800,  2, 'KRW', 1735100005000),
  ('ord_006', 1735200006000, 205, 'usr_henry_au',  'CREATED',         13900,  1, 'AUD', 1735200006000),
  ('ord_007', 1735200007000, 206, 'usr_iris_fr',   'DELIVERED',       95800,  2, 'EUR', 1733200007000),
  ('ord_008', 1735200008000, 207, 'usr_karen_sg',  'CANCELLED',       62900,  1, 'SGD', 1734500008000),
  ('ord_009', 1735200009000, 208, 'usr_leo_br',    'REFUNDED',        27900,  1, 'BRL', 1733900009000),
  ('ord_010', 1735200010000, 209, 'usr_mia_us',    'DELIVERED',      169800,  2, 'USD', 1732200010000),
  ('ord_011', 1735200011000, 210, 'usr_noah_in',   'SHIPPED',         22800,  2, 'USD', 1735100011000),
  ('ord_012', 1735200012000, 211, 'usr_paul_kr',   'PAID',            79900,  1, 'KRW', 1735180012000),
  ('ord_013', 1735200013000, 212, 'usr_quinn_mx',  'PAYMENT_PENDING',  8400,  2, 'MXN', 1735200013000),
  ('ord_014', 1735200014000, 213, 'usr_sam_us',    'FULFILLING',     219700,  3, 'USD', 1735150014000),
  ('ord_015', 1735200015000, 214, 'usr_alice_kr',  'DELIVERED',       49900,  1, 'USD', 1730200015000),
  ('ord_016', 1735200016000, 215, 'usr_bob_us',    'SHIPPED',         89900,  1, 'USD', 1735100016000),
  ('ord_017', 1735200017000, 216, 'usr_grace_kr',  'CREATED',          4500,  1, 'KRW', 1735200017000),
  ('ord_018', 1735200018000, 217, 'usr_karen_sg',  'DELIVERED',      139900,  1, 'SGD', 1731200018000),
  ('ord_019', 1735200019000, 218, 'usr_mia_us',    'REFUNDED',        54900,  1, 'USD', 1734800019000),
  ('ord_020', 1735200020000, 219, 'usr_paul_kr',   'PAID',           179800,  2, 'KRW', 1735190020000),
  ('ord_021', 1735200021000, 220, 'usr_sam_us',    'SHIPPED',         69900,  1, 'USD', 1735150021000),
  ('ord_022', 1735200022000, 221, 'usr_frank_us',  'DELIVERED',       27900,  1, 'USD', 1728200022000)
ON CONFLICT (entity_id_hash) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- PAYMENTS (22개)  CARD/BANK_TRANSFER/WALLET/CRYPTO
-- ──────────────────────────────────────────────────────────────
INSERT INTO state_payments
  (entity_id_hash, updated_event_time_ms, last_offset,
   order_id_hash, user_id_hash, status,
   amount_cents, currency_code, payment_method,
   created_event_time_ms)
VALUES
  ('pay_001', 1735210001000, 300, 'ord_001', 'usr_alice_kr',  'CAPTURED',   54900, 'USD', 'CARD',          1733210001000),
  ('pay_002', 1735210002000, 301, 'ord_002', 'usr_bob_us',    'CAPTURED',   25800, 'USD', 'CARD',          1733210002000),
  ('pay_003', 1735210003000, 302, 'ord_003', 'usr_carol_jp',  'PENDING',     5900, 'JPY', 'BANK_TRANSFER', 1735210003000),
  ('pay_004', 1735210004000, 303, 'ord_004', 'usr_frank_us',  'CAPTURED',  139900, 'USD', 'WALLET',        1734210004000),
  ('pay_005', 1735210005000, 304, 'ord_005', 'usr_grace_kr',  'AUTHORIZED', 164800,'KRW', 'CARD',          1735110005000),
  ('pay_006', 1735210006000, 305, 'ord_006', 'usr_henry_au',  'PENDING',    13900, 'AUD', 'CARD',          1735210006000),
  ('pay_007', 1735210007000, 306, 'ord_007', 'usr_iris_fr',   'CAPTURED',   95800, 'EUR', 'CARD',          1733210007000),
  ('pay_008', 1735210008000, 307, 'ord_008', 'usr_karen_sg',  'REFUNDED',   62900, 'SGD', 'CARD',          1734510008000),
  ('pay_009', 1735210009000, 308, 'ord_009', 'usr_leo_br',    'REFUNDED',   27900, 'BRL', 'BANK_TRANSFER', 1733910009000),
  ('pay_010', 1735210010000, 309, 'ord_010', 'usr_mia_us',    'CAPTURED',  169800, 'USD', 'WALLET',        1732210010000),
  ('pay_011', 1735210011000, 310, 'ord_011', 'usr_noah_in',   'CAPTURED',   22800, 'USD', 'BANK_TRANSFER', 1735110011000),
  ('pay_012', 1735210012000, 311, 'ord_012', 'usr_paul_kr',   'AUTHORIZED',  79900,'KRW', 'CARD',          1735180012000),
  ('pay_013', 1735210013000, 312, 'ord_013', 'usr_quinn_mx',  'PENDING',     8400, 'MXN', 'CARD',          1735210013000),
  ('pay_014', 1735210014000, 313, 'ord_014', 'usr_sam_us',    'AUTHORIZED', 219700,'USD', 'WALLET',        1735150014000),
  ('pay_015', 1735210015000, 314, 'ord_015', 'usr_alice_kr',  'CAPTURED',   49900, 'USD', 'CARD',          1730210015000),
  ('pay_016', 1735210016000, 315, 'ord_016', 'usr_bob_us',    'CAPTURED',   89900, 'USD', 'CARD',          1735110016000),
  ('pay_017', 1735210017000, 316, 'ord_017', 'usr_grace_kr',  'PENDING',     4500, 'KRW', 'WALLET',        1735210017000),
  ('pay_018', 1735210018000, 317, 'ord_018', 'usr_karen_sg',  'CAPTURED',  139900, 'SGD', 'CARD',          1731210018000),
  ('pay_019', 1735210019000, 318, 'ord_019', 'usr_mia_us',    'REFUNDED',   54900, 'USD', 'CARD',          1734810019000),
  ('pay_020', 1735210020000, 319, 'ord_020', 'usr_paul_kr',   'AUTHORIZED', 179800,'KRW', 'CARD',          1735190020000),
  ('pay_021', 1735210021000, 320, 'ord_021', 'usr_sam_us',    'CAPTURED',   69900, 'USD', 'WALLET',        1735150021000),
  ('pay_022', 1735210022000, 321, 'ord_022', 'usr_frank_us',  'CAPTURED',   27900, 'USD', 'CARD',          1728210022000)
ON CONFLICT (entity_id_hash) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- SHIPMENTS (16개)  FedEx/DHL/UPS/USPS/EMS/SFExpress/CJ
-- ──────────────────────────────────────────────────────────────
INSERT INTO state_shipments
  (entity_id_hash, updated_event_time_ms, last_offset,
   order_id_hash, user_id_hash, status,
   carrier, destination_country,
   created_event_time_ms)
VALUES
  ('shp_001', 1735220001000, 400, 'ord_001', 'usr_alice_kr',  'DELIVERED',        'FedEx',    'KR', 1733220001000),
  ('shp_002', 1735220002000, 401, 'ord_002', 'usr_bob_us',    'IN_TRANSIT',       'UPS',      'US', 1733220002000),
  ('shp_004', 1735220004000, 402, 'ord_004', 'usr_frank_us',  'PREPARING',        'FedEx',    'US', 1734220004000),
  ('shp_005', 1735220005000, 403, 'ord_005', 'usr_grace_kr',  'DISPATCHED',       'CJ',       'KR', 1735120005000),
  ('shp_007', 1735220007000, 404, 'ord_007', 'usr_iris_fr',   'DELIVERED',        'DHL',      'FR', 1733220007000),
  ('shp_009', 1735220009000, 405, 'ord_009', 'usr_leo_br',    'RETURNED',         'DHL',      'BR', 1733920009000),
  ('shp_010', 1735220010000, 406, 'ord_010', 'usr_mia_us',    'DELIVERED',        'USPS',     'US', 1732220010000),
  ('shp_011', 1735220011000, 407, 'ord_011', 'usr_noah_in',   'IN_TRANSIT',       'EMS',      'IN', 1735120011000),
  ('shp_014', 1735220014000, 408, 'ord_014', 'usr_sam_us',    'PREPARING',        'UPS',      'US', 1735160014000),
  ('shp_015', 1735220015000, 409, 'ord_015', 'usr_alice_kr',  'DELIVERED',        'SFExpress','KR', 1730220015000),
  ('shp_016', 1735220016000, 410, 'ord_016', 'usr_bob_us',    'OUT_FOR_DELIVERY', 'FedEx',    'US', 1735180016000),
  ('shp_018', 1735220018000, 411, 'ord_018', 'usr_karen_sg',  'DELIVERED',        'DHL',      'SG', 1731220018000),
  ('shp_020', 1735220020000, 412, 'ord_020', 'usr_paul_kr',   'DISPATCHED',       'CJ',       'KR', 1735195020000),
  ('shp_021', 1735220021000, 413, 'ord_021', 'usr_sam_us',    'IN_TRANSIT',       'UPS',      'US', 1735160021000),
  ('shp_022', 1735220022000, 414, 'ord_022', 'usr_frank_us',  'DELIVERED',        'USPS',     'US', 1728220022000),
  ('shp_006', 1735220006000, 415, 'ord_006', 'usr_henry_au',  'PREPARING',        'DHL',      'AU', 1735210006000)
ON CONFLICT (entity_id_hash) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- AUDIT LOG (시드 데이터 적용 이벤트)
-- ──────────────────────────────────────────────────────────────
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
    'counts', jsonb_build_object(
      'users', 20, 'products', 14, 'orders', 22, 'payments', 22, 'shipments', 16
    ),
    'note', 'Dev e-commerce seed. DO NOT run in PROD.'
  )
);
