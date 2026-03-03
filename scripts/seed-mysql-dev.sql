-- ============================================================
-- seed-mysql-dev.sql
-- beanCLI 개발용 MySQL 시드 데이터
-- DB: bean_dev
-- Run: mysql -h 127.0.0.1 -P 3306 -u root -p < scripts/seed-mysql-dev.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS bean_dev
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bean_dev;

-- ── users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  username        VARCHAR(50)      NOT NULL UNIQUE,
  email           VARCHAR(100)     NOT NULL UNIQUE,
  role            ENUM('DBA','MANAGER','ANALYST') NOT NULL DEFAULT 'ANALYST',
  balance_cents   INT              NOT NULL DEFAULT 0,
  is_active       TINYINT(1)       NOT NULL DEFAULT 1,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- ── products ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  sku             VARCHAR(20)      NOT NULL UNIQUE,
  name            VARCHAR(100)     NOT NULL,
  category        VARCHAR(40)      NOT NULL,
  price_cents     INT UNSIGNED     NOT NULL,
  stock           INT              NOT NULL DEFAULT 0,
  is_active       TINYINT(1)       NOT NULL DEFAULT 1,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_category (category),
  INDEX idx_active   (is_active)
) ENGINE=InnoDB;

-- ── orders ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED     NOT NULL,
  status          ENUM('PENDING','CONFIRMED','SHIPPED','DELIVERED','CANCELLED')
                                   NOT NULL DEFAULT 'PENDING',
  total_cents     INT UNSIGNED     NOT NULL DEFAULT 0,
  item_count      SMALLINT         NOT NULL DEFAULT 1,
  note            VARCHAR(255)     NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_id (user_id),
  INDEX idx_status  (status)
) ENGINE=InnoDB;

-- ── order_items ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_items (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  order_id        INT UNSIGNED     NOT NULL,
  product_id      INT UNSIGNED     NOT NULL,
  quantity        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  unit_price_cents INT UNSIGNED    NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_order_id   (order_id),
  INDEX idx_product_id (product_id)
) ENGINE=InnoDB;

-- ── payments ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  order_id        INT UNSIGNED     NOT NULL,
  amount_cents    INT UNSIGNED     NOT NULL,
  method          ENUM('card','bank_transfer','crypto','paypal') NOT NULL,
  status          ENUM('PENDING','COMPLETED','FAILED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  tx_ref          VARCHAR(64)      NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_order_id (order_id),
  INDEX idx_status   (status)
) ENGINE=InnoDB;

-- ── shipments ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shipments (
  id              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  order_id        INT UNSIGNED     NOT NULL,
  carrier         VARCHAR(30)      NOT NULL,
  tracking_number VARCHAR(64)      NULL,
  status          ENUM('PREPARING','DISPATCHED','IN_TRANSIT','DELIVERED','RETURNED')
                                   NOT NULL DEFAULT 'PREPARING',
  shipped_at      DATETIME         NULL,
  delivered_at    DATETIME         NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_order_id (order_id)
) ENGINE=InnoDB;

-- ── audit_log ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  actor           VARCHAR(50)      NOT NULL,
  action          VARCHAR(50)      NOT NULL,
  resource        VARCHAR(60)      NOT NULL,
  result          ENUM('OK','FAIL') NOT NULL DEFAULT 'OK',
  details         JSON             NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_actor      (actor),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Truncate in FK-safe order
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE audit_log;
TRUNCATE TABLE shipments;
TRUNCATE TABLE payments;
TRUNCATE TABLE order_items;
TRUNCATE TABLE orders;
TRUNCATE TABLE products;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;

-- ── users (20 rows) ───────────────────────────────────────────────────────────

INSERT INTO users (username, email, role, balance_cents, is_active, created_at) VALUES
  ('alice',    'alice@example.com',    'DBA',      250000, 1, NOW() - INTERVAL 90 DAY),
  ('bob',      'bob@example.com',      'MANAGER',  180000, 1, NOW() - INTERVAL 85 DAY),
  ('charlie',  'charlie@example.com',  'ANALYST',   95000, 1, NOW() - INTERVAL 80 DAY),
  ('diana',    'diana@example.com',    'ANALYST',  125000, 1, NOW() - INTERVAL 75 DAY),
  ('evan',     'evan@example.com',     'MANAGER',  210000, 1, NOW() - INTERVAL 70 DAY),
  ('fiona',    'fiona@example.com',    'ANALYST',   73000, 1, NOW() - INTERVAL 65 DAY),
  ('grace',    'grace@example.com',    'ANALYST',   41000, 1, NOW() - INTERVAL 60 DAY),
  ('henry',    'henry@example.com',    'ANALYST',  310000, 1, NOW() - INTERVAL 55 DAY),
  ('iris',     'iris@example.com',     'MANAGER',  198000, 1, NOW() - INTERVAL 50 DAY),
  ('jack',     'jack@example.com',     'ANALYST',   56000, 1, NOW() - INTERVAL 45 DAY),
  ('kate',     'kate@example.com',     'ANALYST',   88000, 1, NOW() - INTERVAL 40 DAY),
  ('liam',     'liam@example.com',     'ANALYST',  150000, 1, NOW() - INTERVAL 35 DAY),
  ('mia',      'mia@example.com',      'ANALYST',   33000, 1, NOW() - INTERVAL 30 DAY),
  ('noah',     'noah@example.com',     'DBA',      420000, 1, NOW() - INTERVAL 25 DAY),
  ('olivia',   'olivia@example.com',   'ANALYST',   67000, 1, NOW() - INTERVAL 20 DAY),
  ('peter',    'peter@example.com',    'ANALYST',   99000, 0, NOW() - INTERVAL 15 DAY),
  ('quinn',    'quinn@example.com',    'ANALYST',   22000, 1, NOW() - INTERVAL 10 DAY),
  ('rachel',   'rachel@example.com',   'MANAGER',  340000, 1, NOW() - INTERVAL  7 DAY),
  ('steve',    'steve@example.com',    'ANALYST',   15000, 1, NOW() - INTERVAL  3 DAY),
  ('tina',     'tina@example.com',     'ANALYST',   78000, 1, NOW() - INTERVAL  1 DAY);

-- ── products (15 rows) ────────────────────────────────────────────────────────

INSERT INTO products (sku, name, category, price_cents, stock, is_active) VALUES
  ('SKU-0001', 'MacBook Pro 14"',        'electronics',  299900, 12, 1),
  ('SKU-0002', 'AirPods Pro 2',          'electronics',   24900, 48, 1),
  ('SKU-0003', 'iPhone 16',              'electronics',  119900, 30, 1),
  ('SKU-0004', 'iPad Air 5',             'electronics',   79900, 22, 1),
  ('SKU-0005', 'Apple Watch Ultra',      'electronics',   99900,  8, 1),
  ('SKU-0006', 'Kindle Paperwhite',      'books',         13900, 65, 1),
  ('SKU-0007', 'Mechanical Keyboard TKL','electronics',    9900, 40, 1),
  ('SKU-0008', 'USB-C 10-Port Hub',      'electronics',    4900, 73, 1),
  ('SKU-0009', 'Standing Desk Mat',      'furniture',      3900, 55, 1),
  ('SKU-0010', 'Webcam HD 4K',           'electronics',    7900, 27, 1),
  ('SKU-0011', 'Noise-Cancel Headset',   'electronics',   19900, 18, 1),
  ('SKU-0012', 'Ergonomic Chair',        'furniture',     49900,  5, 1),
  ('SKU-0013', 'LED Desk Lamp',          'furniture',      2900, 90, 1),
  ('SKU-0014', 'TypeScript Deep Dive',   'books',          4500, 120, 1),
  ('SKU-0015', 'Wireless Charger 15W',   'electronics',    2900,  0, 0);

-- ── orders (30 rows) ──────────────────────────────────────────────────────────

INSERT INTO orders (user_id, status, total_cents, item_count, created_at) VALUES
  (1,  'DELIVERED',  29900,  1, NOW() - INTERVAL 88 DAY),
  (2,  'DELIVERED',  24900,  1, NOW() - INTERVAL 84 DAY),
  (3,  'DELIVERED',   9900,  1, NOW() - INTERVAL 79 DAY),
  (4,  'SHIPPED',    49900,  2, NOW() - INTERVAL 72 DAY),
  (5,  'DELIVERED', 299900,  1, NOW() - INTERVAL 68 DAY),
  (6,  'DELIVERED',  19900,  1, NOW() - INTERVAL 62 DAY),
  (7,  'CONFIRMED',  13900,  1, NOW() - INTERVAL 57 DAY),
  (8,  'DELIVERED', 129800,  2, NOW() - INTERVAL 52 DAY),
  (9,  'DELIVERED',  24900,  1, NOW() - INTERVAL 47 DAY),
  (10, 'SHIPPED',    99900,  1, NOW() - INTERVAL 43 DAY),
  (11, 'DELIVERED',   7900,  1, NOW() - INTERVAL 38 DAY),
  (12, 'CANCELLED',  29900,  1, NOW() - INTERVAL 33 DAY),
  (13, 'DELIVERED',   9800,  2, NOW() - INTERVAL 29 DAY),
  (14, 'CONFIRMED', 159800,  2, NOW() - INTERVAL 24 DAY),
  (15, 'DELIVERED',  49900,  1, NOW() - INTERVAL 20 DAY),
  (1,  'SHIPPED',    79900,  1, NOW() - INTERVAL 17 DAY),
  (2,  'PENDING',   119900,  1, NOW() - INTERVAL 14 DAY),
  (3,  'DELIVERED',   8700,  3, NOW() - INTERVAL 11 DAY),
  (4,  'CONFIRMED',  19900,  1, NOW() -  INTERVAL 9 DAY),
  (5,  'PENDING',    99900,  1, NOW() -  INTERVAL 7 DAY),
  (6,  'DELIVERED',  24900,  1, NOW() -  INTERVAL 6 DAY),
  (7,  'SHIPPED',    19800,  2, NOW() -  INTERVAL 5 DAY),
  (8,  'DELIVERED',   9900,  1, NOW() -  INTERVAL 4 DAY),
  (9,  'CONFIRMED',  29900,  1, NOW() -  INTERVAL 3 DAY),
  (10, 'PENDING',    13900,  1, NOW() -  INTERVAL 2 DAY),
  (11, 'DELIVERED',  79900,  1, NOW() -  INTERVAL 2 DAY),
  (12, 'CANCELLED',  24900,  1, NOW() -  INTERVAL 1 DAY),
  (13, 'PENDING',    99900,  1, NOW() -  INTERVAL 1 DAY),
  (14, 'CONFIRMED',  15800,  2, NOW()),
  (15, 'PENDING',    49900,  1, NOW());

-- ── order_items ───────────────────────────────────────────────────────────────

INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES
  (1,  14, 1, 29900),
  (2,   2, 1, 24900),
  (3,   7, 1,  9900),
  (4,  12, 1, 49900),
  (5,   1, 1,299900),
  (6,  11, 1, 19900),
  (7,   6, 1, 13900),
  (8,   3, 1,119900), (8,  2, 1, 9900),
  (9,   2, 1, 24900),
  (10,  5, 1, 99900),
  (11, 10, 1,  7900),
  (12, 14, 1, 29900),
  (13,  8, 2,  4900),
  (14,  4, 2, 79900),
  (15, 12, 1, 49900),
  (16,  4, 1, 79900),
  (17,  3, 1,119900),
  (18, 13, 3,  2900),
  (19, 11, 1, 19900),
  (20,  5, 1, 99900),
  (21,  2, 1, 24900),
  (22,  7, 2,  9900),
  (23,  7, 1,  9900),
  (24, 14, 1, 29900),
  (25,  6, 1, 13900),
  (26,  4, 1, 79900),
  (27,  2, 1, 24900),
  (28,  5, 1, 99900),
  (29, 10, 2,  7900),
  (30, 12, 1, 49900);

-- ── payments ──────────────────────────────────────────────────────────────────

INSERT INTO payments (order_id, amount_cents, method, status, tx_ref, created_at) VALUES
  (1,   29900, 'card',          'COMPLETED', 'TXN-10001', NOW() - INTERVAL 88 DAY),
  (2,   24900, 'paypal',        'COMPLETED', 'TXN-10002', NOW() - INTERVAL 84 DAY),
  (3,    9900, 'card',          'COMPLETED', 'TXN-10003', NOW() - INTERVAL 79 DAY),
  (4,   49900, 'bank_transfer', 'COMPLETED', 'TXN-10004', NOW() - INTERVAL 72 DAY),
  (5,  299900, 'card',          'COMPLETED', 'TXN-10005', NOW() - INTERVAL 68 DAY),
  (6,   19900, 'card',          'COMPLETED', 'TXN-10006', NOW() - INTERVAL 62 DAY),
  (7,   13900, 'paypal',        'COMPLETED', 'TXN-10007', NOW() - INTERVAL 57 DAY),
  (8,  129800, 'card',          'COMPLETED', 'TXN-10008', NOW() - INTERVAL 52 DAY),
  (9,   24900, 'card',          'COMPLETED', 'TXN-10009', NOW() - INTERVAL 47 DAY),
  (10,  99900, 'bank_transfer', 'COMPLETED', 'TXN-10010', NOW() - INTERVAL 43 DAY),
  (11,   7900, 'card',          'COMPLETED', 'TXN-10011', NOW() - INTERVAL 38 DAY),
  (12,  29900, 'card',          'REFUNDED',  'TXN-10012', NOW() - INTERVAL 33 DAY),
  (13,   9800, 'paypal',        'COMPLETED', 'TXN-10013', NOW() - INTERVAL 29 DAY),  -- 2×4900
  (14, 159800, 'bank_transfer', 'COMPLETED', 'TXN-10014', NOW() - INTERVAL 24 DAY),  -- 2×79900
  (15,  49900, 'card',          'COMPLETED', 'TXN-10015', NOW() - INTERVAL 20 DAY),
  (16,  79900, 'card',          'COMPLETED', 'TXN-10016', NOW() - INTERVAL 17 DAY),
  (17, 119900, 'card',          'PENDING',   NULL,        NOW() - INTERVAL 14 DAY),
  (18,   8700, 'paypal',        'COMPLETED', 'TXN-10018', NOW() - INTERVAL 11 DAY),  -- 3×2900
  (19,  19900, 'card',          'PENDING',   NULL,        NOW() -  INTERVAL 9 DAY),
  (20,  99900, 'crypto',        'PENDING',   NULL,        NOW() -  INTERVAL 7 DAY),
  (21,  24900, 'card',          'COMPLETED', 'TXN-10021', NOW() -  INTERVAL 6 DAY),
  (22,  19800, 'bank_transfer', 'COMPLETED', 'TXN-10022', NOW() -  INTERVAL 5 DAY),
  (23,   9900, 'card',          'COMPLETED', 'TXN-10023', NOW() -  INTERVAL 4 DAY),
  (24,  29900, 'paypal',        'PENDING',   NULL,        NOW() -  INTERVAL 3 DAY),
  (26,  79900, 'card',          'COMPLETED', 'TXN-10026', NOW() -  INTERVAL 2 DAY),
  (27,  24900, 'card',          'FAILED',    NULL,        NOW() -  INTERVAL 1 DAY);

-- ── shipments ─────────────────────────────────────────────────────────────────

INSERT INTO shipments (order_id, carrier, tracking_number, status, shipped_at, delivered_at, created_at) VALUES
  (1,  'FedEx', 'FDX-100001', 'DELIVERED', NOW()-INTERVAL 87 DAY, NOW()-INTERVAL 84 DAY, NOW()-INTERVAL 88 DAY),
  (2,  'UPS',   'UPS-100002', 'DELIVERED', NOW()-INTERVAL 83 DAY, NOW()-INTERVAL 80 DAY, NOW()-INTERVAL 84 DAY),
  (3,  'DHL',   'DHL-100003', 'DELIVERED', NOW()-INTERVAL 78 DAY, NOW()-INTERVAL 75 DAY, NOW()-INTERVAL 79 DAY),
  (4,  'FedEx', 'FDX-100004', 'IN_TRANSIT',NOW()-INTERVAL 70 DAY, NULL,                  NOW()-INTERVAL 72 DAY),
  (5,  'UPS',   'UPS-100005', 'DELIVERED', NOW()-INTERVAL 66 DAY, NOW()-INTERVAL 62 DAY, NOW()-INTERVAL 68 DAY),
  (6,  'CJ',    'CJ-100006',  'DELIVERED', NOW()-INTERVAL 61 DAY, NOW()-INTERVAL 58 DAY, NOW()-INTERVAL 62 DAY),
  (7,  'DHL',   'DHL-100007', 'DISPATCHED',NOW()-INTERVAL 56 DAY, NULL,                  NOW()-INTERVAL 57 DAY),
  (8,  'FedEx', 'FDX-100008', 'DELIVERED', NOW()-INTERVAL 50 DAY, NOW()-INTERVAL 47 DAY, NOW()-INTERVAL 52 DAY),
  (9,  'UPS',   'UPS-100009', 'DELIVERED', NOW()-INTERVAL 45 DAY, NOW()-INTERVAL 42 DAY, NOW()-INTERVAL 47 DAY),
  (10, 'USPS',  'USP-100010', 'IN_TRANSIT',NOW()-INTERVAL 41 DAY, NULL,                  NOW()-INTERVAL 43 DAY),
  (11, 'CJ',    'CJ-100011',  'DELIVERED', NOW()-INTERVAL 37 DAY, NOW()-INTERVAL 34 DAY, NOW()-INTERVAL 38 DAY),
  (13, 'DHL',   'DHL-100013', 'DELIVERED', NOW()-INTERVAL 28 DAY, NOW()-INTERVAL 25 DAY, NOW()-INTERVAL 29 DAY),
  (14, 'FedEx', 'FDX-100014', 'PREPARING', NULL,                  NULL,                  NOW()-INTERVAL 24 DAY),
  (15, 'UPS',   'UPS-100015', 'DELIVERED', NOW()-INTERVAL 19 DAY, NOW()-INTERVAL 16 DAY, NOW()-INTERVAL 20 DAY),
  (16, 'DHL',   'DHL-100016', 'IN_TRANSIT',NOW()-INTERVAL 15 DAY, NULL,                  NOW()-INTERVAL 17 DAY),
  (21, 'FedEx', 'FDX-100021', 'DELIVERED', NOW()-INTERVAL  5 DAY, NOW()-INTERVAL  3 DAY, NOW()-INTERVAL  6 DAY),
  (22, 'CJ',    'CJ-100022',  'IN_TRANSIT',NOW()-INTERVAL  4 DAY, NULL,                  NOW()-INTERVAL  5 DAY),
  (23, 'UPS',   'UPS-100023', 'DELIVERED', NOW()-INTERVAL  3 DAY, NOW()-INTERVAL  1 DAY, NOW()-INTERVAL  4 DAY),
  (26, 'DHL',   'DHL-100026', 'DELIVERED', NOW()-INTERVAL  1 DAY, NOW(),                 NOW()-INTERVAL  2 DAY);

-- ── audit_log (10 rows) ───────────────────────────────────────────────────────

INSERT INTO audit_log (actor, action, resource, result, details, created_at) VALUES
  ('alice',  'login',          'auth',       'OK',   '{"ip":"127.0.0.1"}',                         NOW()-INTERVAL 2 DAY),
  ('alice',  'query.execute',  'users',      'OK',   '{"rows":20,"duration_ms":4}',                NOW()-INTERVAL 2 DAY),
  ('bob',    'login',          'auth',       'OK',   '{"ip":"10.0.0.2"}',                          NOW()-INTERVAL 1 DAY),
  ('bob',    'record.update',  'orders',     'OK',   '{"id":12,"field":"status","val":"CANCELLED"}', NOW()-INTERVAL 1 DAY),
  ('charlie','login',          'auth',       'FAIL', '{"ip":"10.0.0.5","reason":"wrong_password"}',NOW()-INTERVAL 1 DAY),
  ('charlie','login',          'auth',       'OK',   '{"ip":"10.0.0.5"}',                          NOW()-INTERVAL 1 DAY),
  ('diana',  'query.execute',  'products',   'OK',   '{"rows":15,"duration_ms":2}',                NOW()-INTERVAL 6 HOUR),
  ('noah',   'record.delete',  'users',      'OK',   '{"id":16}',                                  NOW()-INTERVAL 3 HOUR),
  ('alice',  'table.read',     'shipments',  'OK',   '{"rows":19}',                                NOW()-INTERVAL 1 HOUR),
  ('bob',    'query.execute',  'audit_log',  'OK',   '{"rows":9,"duration_ms":3}',                 NOW());

-- ── 결과 확인 ──────────────────────────────────────────────────────────────────

SELECT '=== bean_dev seed complete ===' AS '';
SELECT
  table_name   AS `table`,
  table_rows   AS `~rows`
FROM information_schema.tables
WHERE table_schema = 'bean_dev'
ORDER BY table_name;
