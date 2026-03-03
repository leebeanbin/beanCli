-- ============================================================
-- seed-pg-dev.sql
-- beanCLI 개발용 PostgreSQL 시드 데이터
-- DB: bean_dev
-- Run: psql -h localhost -U postgres -c "CREATE DATABASE bean_dev;" && \
--      psql -h localhost -U postgres -d bean_dev -f scripts/seed-pg-dev.sql
-- ============================================================

-- Drop and recreate for clean slate
DROP TABLE IF EXISTS audit_log   CASCADE;
DROP TABLE IF EXISTS shipments   CASCADE;
DROP TABLE IF EXISTS payments    CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders      CASCADE;
DROP TABLE IF EXISTS products    CASCADE;
DROP TABLE IF EXISTS users       CASCADE;

-- ── users ─────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id              SERIAL          PRIMARY KEY,
  username        VARCHAR(50)     NOT NULL UNIQUE,
  email           VARCHAR(100)    NOT NULL UNIQUE,
  role            VARCHAR(20)     NOT NULL DEFAULT 'ANALYST'
                    CHECK (role IN ('DBA','MANAGER','ANALYST')),
  balance_cents   INTEGER         NOT NULL DEFAULT 0,
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ── products ──────────────────────────────────────────────────────────────────

CREATE TABLE products (
  id              SERIAL          PRIMARY KEY,
  sku             VARCHAR(20)     NOT NULL UNIQUE,
  name            VARCHAR(100)    NOT NULL,
  category        VARCHAR(40)     NOT NULL,
  price_cents     INTEGER         NOT NULL CHECK (price_cents >= 0),
  stock           INTEGER         NOT NULL DEFAULT 0,
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_category ON products (category);
CREATE INDEX idx_products_active   ON products (is_active);

-- ── orders ────────────────────────────────────────────────────────────────────

CREATE TABLE orders (
  id              SERIAL          PRIMARY KEY,
  user_id         INTEGER         NOT NULL REFERENCES users(id),
  status          VARCHAR(20)     NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','CONFIRMED','SHIPPED','DELIVERED','CANCELLED')),
  total_cents     INTEGER         NOT NULL DEFAULT 0,
  item_count      SMALLINT        NOT NULL DEFAULT 1,
  note            VARCHAR(255),
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders (user_id);
CREATE INDEX idx_orders_status  ON orders (status);

-- ── order_items ───────────────────────────────────────────────────────────────

CREATE TABLE order_items (
  id              SERIAL          PRIMARY KEY,
  order_id        INTEGER         NOT NULL REFERENCES orders(id),
  product_id      INTEGER         NOT NULL REFERENCES products(id),
  quantity        SMALLINT        NOT NULL DEFAULT 1,
  unit_price_cents INTEGER        NOT NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

-- ── payments ──────────────────────────────────────────────────────────────────

CREATE TABLE payments (
  id              SERIAL          PRIMARY KEY,
  order_id        INTEGER         NOT NULL REFERENCES orders(id),
  method          VARCHAR(20)     NOT NULL CHECK (method IN ('CARD','BANK_TRANSFER','WALLET','CASH')),
  status          VARCHAR(20)     NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','COMPLETED','FAILED','REFUNDED')),
  amount_cents    INTEGER         NOT NULL,
  transaction_id  VARCHAR(64)     UNIQUE,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order_id ON payments (order_id);
CREATE INDEX idx_payments_status   ON payments (status);

-- ── shipments ─────────────────────────────────────────────────────────────────

CREATE TABLE shipments (
  id              SERIAL          PRIMARY KEY,
  order_id        INTEGER         NOT NULL REFERENCES orders(id),
  carrier         VARCHAR(40)     NOT NULL,
  tracking_no     VARCHAR(40)     NOT NULL UNIQUE,
  status          VARCHAR(20)     NOT NULL DEFAULT 'PREPARING'
                    CHECK (status IN ('PREPARING','IN_TRANSIT','DELIVERED','RETURNED')),
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shipments_order_id ON shipments (order_id);

-- ── audit_log ─────────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id              SERIAL          PRIMARY KEY,
  actor           VARCHAR(50)     NOT NULL,
  action          VARCHAR(50)     NOT NULL,
  target_table    VARCHAR(50)     NOT NULL,
  target_id       INTEGER,
  detail          TEXT,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ── Seed data ─────────────────────────────────────────────────────────────────

INSERT INTO users (username, email, role, balance_cents, is_active) VALUES
  ('alice',    'alice@bean.dev',   'DBA',      125000, TRUE),
  ('bob',      'bob@bean.dev',     'MANAGER',   89000, TRUE),
  ('carol',    'carol@bean.dev',   'ANALYST',   45000, TRUE),
  ('dave',     'dave@bean.dev',    'ANALYST',   67000, TRUE),
  ('eve',      'eve@bean.dev',     'MANAGER',  210000, TRUE),
  ('frank',    'frank@bean.dev',   'ANALYST',   31000, FALSE),
  ('grace',    'grace@bean.dev',   'DBA',      175000, TRUE),
  ('heidi',    'heidi@bean.dev',   'ANALYST',   52000, TRUE),
  ('ivan',     'ivan@bean.dev',    'ANALYST',   18000, FALSE),
  ('judy',     'judy@bean.dev',    'MANAGER',  143000, TRUE),
  ('ken',      'ken@bean.dev',     'ANALYST',   29000, TRUE),
  ('lara',     'lara@bean.dev',    'ANALYST',   74000, TRUE),
  ('mallory',  'mallory@bean.dev', 'ANALYST',   11000, FALSE),
  ('nick',     'nick@bean.dev',    'ANALYST',   88000, TRUE),
  ('olivia',   'olivia@bean.dev',  'MANAGER',  196000, TRUE),
  ('peter',    'peter@bean.dev',   'ANALYST',   43000, TRUE),
  ('quinn',    'quinn@bean.dev',   'ANALYST',   60000, TRUE),
  ('rose',     'rose@bean.dev',    'DBA',      230000, TRUE),
  ('sam',      'sam@bean.dev',     'ANALYST',   37000, TRUE),
  ('tina',     'tina@bean.dev',    'ANALYST',   55000, TRUE);

INSERT INTO products (sku, name, category, price_cents, stock, is_active) VALUES
  ('BEAN-001', 'Mechanical Keyboard TKL',    'peripherals',  12900, 142, TRUE),
  ('BEAN-002', 'USB-C Hub 7-Port',           'accessories',   4500,  89, TRUE),
  ('BEAN-003', 'IPS Monitor 27"',            'displays',     42000,  23, TRUE),
  ('BEAN-004', 'Wireless Mouse Pro',         'peripherals',   6800, 201, TRUE),
  ('BEAN-005', 'Webcam 4K',                  'peripherals',  15900,  55, TRUE),
  ('BEAN-006', 'NVMe SSD 1TB',               'storage',      11900, 178, TRUE),
  ('BEAN-007', 'RAM 32GB DDR5',              'memory',       18500,  67, TRUE),
  ('BEAN-008', 'USB-C Cable 2m',             'accessories',    900, 500, TRUE),
  ('BEAN-009', 'Laptop Stand Aluminium',     'accessories',   3200, 112, TRUE),
  ('BEAN-010', 'Headphones ANC',             'audio',        22000,  44, TRUE),
  ('BEAN-011', 'Microphone USB Cardioid',    'audio',         9900,  36, TRUE),
  ('BEAN-012', 'Desk Pad XL',               'accessories',   2500, 320, TRUE),
  ('BEAN-013', 'PCIe Wi-Fi 6E Card',        'networking',    4800,  71, TRUE),
  ('BEAN-014', 'Thunderbolt 4 Dock',        'accessories',  34500,   8, FALSE),
  ('BEAN-015', 'Ergonomic Chair Support',   'furniture',    12000,  15, TRUE);

INSERT INTO orders (user_id, status, total_cents, item_count, note) VALUES
  (1, 'DELIVERED', 12900,  1, NULL),
  (2, 'DELIVERED', 51500,  3, 'Priority delivery'),
  (3, 'SHIPPED',   22000,  1, NULL),
  (4, 'CONFIRMED',  9400,  2, NULL),
  (5, 'DELIVERED', 47700,  4, 'Gift wrap'),
  (6, 'CANCELLED',  6800,  1, 'Out of stock'),
  (7, 'DELIVERED', 30400,  2, NULL),
  (8, 'PENDING',   15900,  1, NULL),
  (9, 'SHIPPED',   11900,  1, NULL),
  (10,'DELIVERED', 44500,  3, NULL),
  (1, 'CONFIRMED', 18500,  1, 'Urgent'),
  (2, 'SHIPPED',    3200,  1, NULL),
  (3, 'DELIVERED', 22900,  2, NULL),
  (11,'PENDING',    4500,  1, NULL),
  (12,'CONFIRMED', 37000,  2, NULL),
  (13,'CANCELLED', 12000,  1, NULL),
  (14,'DELIVERED', 19800,  2, NULL),
  (15,'SHIPPED',    9900,  1, NULL),
  (16,'DELIVERED', 57400,  5, NULL),
  (17,'PENDING',    2500,  1, NULL),
  (18,'CONFIRMED', 35300,  3, NULL),
  (19,'DELIVERED', 44000,  2, NULL),
  (20,'SHIPPED',    6800,  1, NULL),
  (5, 'DELIVERED', 22000,  1, NULL),
  (7, 'CONFIRMED',  4800,  1, NULL),
  (10,'PENDING',   11900,  1, NULL),
  (1, 'DELIVERED', 25200,  2, NULL),
  (3, 'CANCELLED',  9900,  1, 'Damaged on arrival'),
  (15,'DELIVERED', 42000,  1, NULL),
  (8, 'CONFIRMED', 18500,  1, NULL);

INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES
  (1,  1, 1, 12900),
  (2,  3, 1, 42000), (2,  2, 1,  4500), (2,  8, 5,    900),
  (3,  5, 1, 22000),
  (4,  2, 1,  4500), (4,  9, 1,  3200),
  (5,  10,1, 22000), (5,  4, 1,  6800), (5,  9, 1,  3200), (5, 11,1,  9900),
  (6,  4, 1,  6800),
  (7,  1, 1, 12900), (7, 12, 1,  2500),
  (8,  5, 1, 15900),
  (9,  6, 1, 11900),
  (10, 7, 1, 18500), (10, 2, 1,  4500), (10,12, 2,  2500),
  (11, 7, 1, 18500),
  (12, 9, 1,  3200),
  (13, 1, 1, 12900), (13, 8,10,    900),
  (14, 2, 1,  4500),
  (15, 3, 1, 42000),
  (17, 4, 2,  6800), (17,11, 1,  9900),
  (18,11, 1,  9900),
  (22, 5, 1, 22000),
  (25,13, 1,  4800),
  (26, 6, 1, 11900),
  (29, 3, 1, 42000);

INSERT INTO payments (order_id, method, status, amount_cents, transaction_id) VALUES
  (1,  'CARD',          'COMPLETED', 12900, 'txn_pg_001'),
  (2,  'CARD',          'COMPLETED', 51500, 'txn_pg_002'),
  (3,  'WALLET',        'COMPLETED', 22000, 'txn_pg_003'),
  (4,  'BANK_TRANSFER', 'PENDING',    9400, NULL),
  (5,  'CARD',          'COMPLETED', 47700, 'txn_pg_005'),
  (6,  'CARD',          'REFUNDED',   6800, 'txn_pg_006'),
  (7,  'WALLET',        'COMPLETED', 30400, 'txn_pg_007'),
  (8,  'CASH',          'PENDING',   15900, NULL),
  (9,  'CARD',          'COMPLETED', 11900, 'txn_pg_009'),
  (10, 'CARD',          'COMPLETED', 44500, 'txn_pg_010'),
  (11, 'BANK_TRANSFER', 'PENDING',   18500, NULL),
  (12, 'CARD',          'COMPLETED',  3200, 'txn_pg_012'),
  (13, 'WALLET',        'COMPLETED', 22900, 'txn_pg_013'),
  (14, 'CARD',          'PENDING',    4500, NULL),
  (15, 'CARD',          'COMPLETED', 37000, 'txn_pg_015'),
  (16, 'CARD',          'REFUNDED',  12000, 'txn_pg_016'),
  (17, 'CARD',          'COMPLETED', 19800, 'txn_pg_017'),
  (18, 'WALLET',        'COMPLETED',  9900, 'txn_pg_018'),
  (19, 'CARD',          'COMPLETED', 57400, 'txn_pg_019'),
  (22, 'CARD',          'COMPLETED', 22000, 'txn_pg_022'),
  (24, 'CARD',          'COMPLETED', 22000, 'txn_pg_024'),
  (27, 'BANK_TRANSFER', 'COMPLETED', 25200, 'txn_pg_027'),
  (29, 'CARD',          'COMPLETED', 42000, 'txn_pg_029'),
  (30, 'CARD',          'PENDING',   18500, NULL);

INSERT INTO shipments (order_id, carrier, tracking_no, status, shipped_at, delivered_at) VALUES
  (1,  'FedEx',  'FX-PG-100001', 'DELIVERED', NOW() - INTERVAL '10 days', NOW() - INTERVAL '7 days'),
  (2,  'UPS',    'UP-PG-100002', 'DELIVERED', NOW() - INTERVAL '12 days', NOW() - INTERVAL '9 days'),
  (3,  'DHL',    'DH-PG-100003', 'IN_TRANSIT', NOW() - INTERVAL '2 days', NULL),
  (5,  'FedEx',  'FX-PG-100005', 'DELIVERED', NOW() - INTERVAL '8 days', NOW() - INTERVAL '5 days'),
  (7,  'UPS',    'UP-PG-100007', 'DELIVERED', NOW() - INTERVAL '6 days', NOW() - INTERVAL '3 days'),
  (9,  'DHL',    'DH-PG-100009', 'IN_TRANSIT', NOW() - INTERVAL '1 day',  NULL),
  (10, 'FedEx',  'FX-PG-100010', 'DELIVERED', NOW() - INTERVAL '9 days', NOW() - INTERVAL '6 days'),
  (12, 'UPS',    'UP-PG-100012', 'IN_TRANSIT', NOW() - INTERVAL '3 days', NULL),
  (13, 'FedEx',  'FX-PG-100013', 'DELIVERED', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days'),
  (15, 'DHL',    'DH-PG-100015', 'DELIVERED', NOW() - INTERVAL '7 days', NOW() - INTERVAL '4 days'),
  (17, 'UPS',    'UP-PG-100017', 'DELIVERED', NOW() - INTERVAL '4 days', NOW() - INTERVAL '1 day'),
  (18, 'FedEx',  'FX-PG-100018', 'IN_TRANSIT', NOW() - INTERVAL '2 days', NULL),
  (19, 'UPS',    'UP-PG-100019', 'DELIVERED', NOW() - INTERVAL '11 days', NOW() - INTERVAL '8 days'),
  (22, 'DHL',    'DH-PG-100022', 'DELIVERED', NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day'),
  (23, 'FedEx',  'FX-PG-100023', 'IN_TRANSIT', NOW() - INTERVAL '1 day',  NULL),
  (24, 'UPS',    'UP-PG-100024', 'DELIVERED', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days'),
  (29, 'FedEx',  'FX-PG-100029', 'DELIVERED', NOW() - INTERVAL '6 days', NOW() - INTERVAL '3 days');

INSERT INTO audit_log (actor, action, target_table, target_id, detail) VALUES
  ('alice',  'UPDATE', 'users',    3, 'role changed to MANAGER'),
  ('grace',  'DELETE', 'products', 14, 'discontinued product removed'),
  ('bob',    'INSERT', 'orders',   30, 'manual order creation'),
  ('alice',  'UPDATE', 'orders',    6, 'status → CANCELLED'),
  ('rose',   'UPDATE', 'users',    13, 'account deactivated'),
  ('alice',  'DROP',   'audit_log', NULL, 'monthly archive rotation'),
  ('bob',    'UPDATE', 'products',  1, 'price adjustment +5%'),
  ('grace',  'INSERT', 'users',    NULL, 'bulk import 5 new accounts'),
  ('alice',  'UPDATE', 'shipments', 3, 'tracking number corrected'),
  ('rose',   'UPDATE', 'payments',  16, 'refund processed');

\echo ''
\echo '✅ PostgreSQL bean_dev seed complete'
\echo '   Tables: users(20), products(15), orders(30), order_items(31), payments(24), shipments(17), audit_log(10)'
