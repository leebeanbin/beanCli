-- ============================================================
-- seed-sqlite-dev.sql
-- beanCLI 개발용 SQLite 시드 데이터
-- DB file: ~/.config/beanCli/bean_dev.db (or any .db path)
-- Run: sqlite3 ~/.config/beanCli/bean_dev.db < scripts/seed-sqlite-dev.sql
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Drop existing tables ──────────────────────────────────────────────────────

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;

-- ── users ─────────────────────────────────────────────────────────────────────
-- SQLite: no ENUM → CHECK constraint; INTEGER PRIMARY KEY = rowid alias

CREATE TABLE users (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  username        TEXT     NOT NULL UNIQUE,
  email           TEXT     NOT NULL UNIQUE,
  role            TEXT     NOT NULL DEFAULT 'ANALYST'
                    CHECK (role IN ('DBA','MANAGER','ANALYST')),
  balance_cents   INTEGER  NOT NULL DEFAULT 0,
  is_active       INTEGER  NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at      TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ── products ──────────────────────────────────────────────────────────────────

CREATE TABLE products (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  sku             TEXT     NOT NULL UNIQUE,
  name            TEXT     NOT NULL,
  category        TEXT     NOT NULL,
  price_cents     INTEGER  NOT NULL CHECK (price_cents >= 0),
  stock           INTEGER  NOT NULL DEFAULT 0,
  is_active       INTEGER  NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_products_category ON products (category);
CREATE INDEX idx_products_active   ON products (is_active);

-- ── orders ────────────────────────────────────────────────────────────────────

CREATE TABLE orders (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER  NOT NULL REFERENCES users(id),
  status          TEXT     NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','CONFIRMED','SHIPPED','DELIVERED','CANCELLED')),
  total_cents     INTEGER  NOT NULL DEFAULT 0,
  item_count      INTEGER  NOT NULL DEFAULT 1,
  note            TEXT,
  created_at      TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at      TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_orders_user_id ON orders (user_id);
CREATE INDEX idx_orders_status  ON orders (status);

-- ── order_items ───────────────────────────────────────────────────────────────

CREATE TABLE order_items (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER  NOT NULL REFERENCES orders(id),
  product_id      INTEGER  NOT NULL REFERENCES products(id),
  quantity        INTEGER  NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  created_at      TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

-- ── payments ──────────────────────────────────────────────────────────────────

CREATE TABLE payments (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER  NOT NULL REFERENCES orders(id),
  method          TEXT     NOT NULL CHECK (method IN ('CARD','BANK_TRANSFER','WALLET','CASH')),
  status          TEXT     NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','COMPLETED','FAILED','REFUNDED')),
  amount_cents    INTEGER  NOT NULL,
  transaction_id  TEXT     UNIQUE,
  created_at      TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_payments_order_id ON payments (order_id);
CREATE INDEX idx_payments_status   ON payments (status);

-- ── shipments ─────────────────────────────────────────────────────────────────

CREATE TABLE shipments (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER  NOT NULL REFERENCES orders(id),
  carrier         TEXT     NOT NULL,
  tracking_no     TEXT     NOT NULL UNIQUE,
  status          TEXT     NOT NULL DEFAULT 'PREPARING'
                    CHECK (status IN ('PREPARING','IN_TRANSIT','DELIVERED','RETURNED')),
  shipped_at      TEXT,
  delivered_at    TEXT,
  created_at      TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX idx_shipments_order_id ON shipments (order_id);

-- ── audit_log ─────────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id              INTEGER  PRIMARY KEY AUTOINCREMENT,
  actor           TEXT     NOT NULL,
  action          TEXT     NOT NULL,
  target_table    TEXT     NOT NULL,
  target_id       INTEGER,
  detail          TEXT,
  created_at      TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ── Seed data ─────────────────────────────────────────────────────────────────

INSERT INTO users (username, email, role, balance_cents, is_active) VALUES
  ('alice',    'alice@bean.dev',   'DBA',      125000, 1),
  ('bob',      'bob@bean.dev',     'MANAGER',   89000, 1),
  ('carol',    'carol@bean.dev',   'ANALYST',   45000, 1),
  ('dave',     'dave@bean.dev',    'ANALYST',   67000, 1),
  ('eve',      'eve@bean.dev',     'MANAGER',  210000, 1),
  ('frank',    'frank@bean.dev',   'ANALYST',   31000, 0),
  ('grace',    'grace@bean.dev',   'DBA',      175000, 1),
  ('heidi',    'heidi@bean.dev',   'ANALYST',   52000, 1),
  ('ivan',     'ivan@bean.dev',    'ANALYST',   18000, 0),
  ('judy',     'judy@bean.dev',    'MANAGER',  143000, 1),
  ('ken',      'ken@bean.dev',     'ANALYST',   29000, 1),
  ('lara',     'lara@bean.dev',    'ANALYST',   74000, 1),
  ('mallory',  'mallory@bean.dev', 'ANALYST',   11000, 0),
  ('nick',     'nick@bean.dev',    'ANALYST',   88000, 1),
  ('olivia',   'olivia@bean.dev',  'MANAGER',  196000, 1),
  ('peter',    'peter@bean.dev',   'ANALYST',   43000, 1),
  ('quinn',    'quinn@bean.dev',   'ANALYST',   60000, 1),
  ('rose',     'rose@bean.dev',    'DBA',      230000, 1),
  ('sam',      'sam@bean.dev',     'ANALYST',   37000, 1),
  ('tina',     'tina@bean.dev',    'ANALYST',   55000, 1);

INSERT INTO products (sku, name, category, price_cents, stock, is_active) VALUES
  ('BEAN-001', 'Mechanical Keyboard TKL',  'peripherals',  12900, 142, 1),
  ('BEAN-002', 'USB-C Hub 7-Port',         'accessories',   4500,  89, 1),
  ('BEAN-003', 'IPS Monitor 27"',          'displays',     42000,  23, 1),
  ('BEAN-004', 'Wireless Mouse Pro',       'peripherals',   6800, 201, 1),
  ('BEAN-005', 'Webcam 4K',               'peripherals',  15900,  55, 1),
  ('BEAN-006', 'NVMe SSD 1TB',            'storage',      11900, 178, 1),
  ('BEAN-007', 'RAM 32GB DDR5',           'memory',       18500,  67, 1),
  ('BEAN-008', 'USB-C Cable 2m',          'accessories',    900, 500, 1),
  ('BEAN-009', 'Laptop Stand Aluminium',  'accessories',   3200, 112, 1),
  ('BEAN-010', 'Headphones ANC',          'audio',        22000,  44, 1),
  ('BEAN-011', 'Microphone USB Cardioid', 'audio',         9900,  36, 1),
  ('BEAN-012', 'Desk Pad XL',            'accessories',   2500, 320, 1),
  ('BEAN-013', 'PCIe Wi-Fi 6E Card',     'networking',    4800,  71, 1),
  ('BEAN-014', 'Thunderbolt 4 Dock',     'accessories',  34500,   8, 0),
  ('BEAN-015', 'Ergonomic Chair Support','furniture',    12000,  15, 1);

INSERT INTO orders (user_id, status, total_cents, item_count, note) VALUES
  (1,  'DELIVERED', 12900,  1, NULL),
  (2,  'DELIVERED', 51500,  3, 'Priority delivery'),
  (3,  'SHIPPED',   22000,  1, NULL),
  (4,  'CONFIRMED',  9400,  2, NULL),
  (5,  'DELIVERED', 47700,  4, 'Gift wrap'),
  (6,  'CANCELLED',  6800,  1, 'Out of stock'),
  (7,  'DELIVERED', 30400,  2, NULL),
  (8,  'PENDING',   15900,  1, NULL),
  (9,  'SHIPPED',   11900,  1, NULL),
  (10, 'DELIVERED', 44500,  3, NULL),
  (1,  'CONFIRMED', 18500,  1, 'Urgent'),
  (2,  'SHIPPED',    3200,  1, NULL),
  (3,  'DELIVERED', 22900,  2, NULL),
  (11, 'PENDING',    4500,  1, NULL),
  (12, 'CONFIRMED', 37000,  2, NULL),
  (13, 'CANCELLED', 12000,  1, NULL),
  (14, 'DELIVERED', 19800,  2, NULL),
  (15, 'SHIPPED',    9900,  1, NULL),
  (16, 'DELIVERED', 57400,  5, NULL),
  (17, 'PENDING',    2500,  1, NULL),
  (18, 'CONFIRMED', 35300,  3, NULL),
  (19, 'DELIVERED', 44000,  2, NULL),
  (20, 'SHIPPED',    6800,  1, NULL),
  (5,  'DELIVERED', 22000,  1, NULL),
  (7,  'CONFIRMED',  4800,  1, NULL),
  (10, 'PENDING',   11900,  1, NULL),
  (1,  'DELIVERED', 25200,  2, NULL),
  (3,  'CANCELLED',  9900,  1, 'Damaged on arrival'),
  (15, 'DELIVERED', 42000,  1, NULL),
  (8,  'CONFIRMED', 18500,  1, NULL);

INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES
  (1,  1, 1, 12900),
  (2,  3, 1, 42000), (2,  2, 1,  4500), (2,  8, 5,    900),
  (3,  5, 1, 22000),
  (4,  2, 1,  4500), (4,  9, 1,  3200),
  (5, 10, 1, 22000), (5,  4, 1,  6800), (5,  9, 1,  3200), (5, 11, 1,  9900),
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
  (22, 5, 1, 22000),
  (25,13, 1,  4800),
  (26, 6, 1, 11900),
  (29, 3, 1, 42000);

INSERT INTO payments (order_id, method, status, amount_cents, transaction_id) VALUES
  (1,  'CARD',          'COMPLETED', 12900, 'txn_sq_001'),
  (2,  'CARD',          'COMPLETED', 51500, 'txn_sq_002'),
  (3,  'WALLET',        'COMPLETED', 22000, 'txn_sq_003'),
  (4,  'BANK_TRANSFER', 'PENDING',    9400, NULL),
  (5,  'CARD',          'COMPLETED', 47700, 'txn_sq_005'),
  (6,  'CARD',          'REFUNDED',   6800, 'txn_sq_006'),
  (7,  'WALLET',        'COMPLETED', 30400, 'txn_sq_007'),
  (8,  'CASH',          'PENDING',   15900, NULL),
  (9,  'CARD',          'COMPLETED', 11900, 'txn_sq_009'),
  (10, 'CARD',          'COMPLETED', 44500, 'txn_sq_010'),
  (11, 'BANK_TRANSFER', 'PENDING',   18500, NULL),
  (12, 'CARD',          'COMPLETED',  3200, 'txn_sq_012'),
  (13, 'WALLET',        'COMPLETED', 22900, 'txn_sq_013'),
  (14, 'CARD',          'PENDING',    4500, NULL),
  (17, 'CARD',          'COMPLETED', 19800, 'txn_sq_017'),
  (22, 'CARD',          'COMPLETED', 22000, 'txn_sq_022'),
  (24, 'CARD',          'COMPLETED', 22000, 'txn_sq_024'),
  (27, 'BANK_TRANSFER', 'COMPLETED', 25200, 'txn_sq_027'),
  (29, 'CARD',          'COMPLETED', 42000, 'txn_sq_029'),
  (30, 'CARD',          'PENDING',   18500, NULL);

INSERT INTO shipments (order_id, carrier, tracking_no, status, shipped_at, delivered_at) VALUES
  (1,  'FedEx', 'FX-SQ-100001', 'DELIVERED',  '2026-02-10T09:00:00Z', '2026-02-13T14:00:00Z'),
  (2,  'UPS',   'UP-SQ-100002', 'DELIVERED',  '2026-02-08T10:00:00Z', '2026-02-11T16:00:00Z'),
  (3,  'DHL',   'DH-SQ-100003', 'IN_TRANSIT', '2026-02-24T11:00:00Z', NULL),
  (5,  'FedEx', 'FX-SQ-100005', 'DELIVERED',  '2026-02-12T08:00:00Z', '2026-02-15T12:00:00Z'),
  (7,  'UPS',   'UP-SQ-100007', 'DELIVERED',  '2026-02-14T09:00:00Z', '2026-02-17T15:00:00Z'),
  (9,  'DHL',   'DH-SQ-100009', 'IN_TRANSIT', '2026-02-25T10:00:00Z', NULL),
  (10, 'FedEx', 'FX-SQ-100010', 'DELIVERED',  '2026-02-11T07:00:00Z', '2026-02-14T13:00:00Z'),
  (12, 'UPS',   'UP-SQ-100012', 'IN_TRANSIT', '2026-02-23T09:00:00Z', NULL),
  (13, 'FedEx', 'FX-SQ-100013', 'DELIVERED',  '2026-02-15T11:00:00Z', '2026-02-18T14:00:00Z'),
  (17, 'UPS',   'UP-SQ-100017', 'DELIVERED',  '2026-02-16T08:00:00Z', '2026-02-19T15:00:00Z'),
  (22, 'DHL',   'DH-SQ-100022', 'DELIVERED',  '2026-02-21T09:00:00Z', '2026-02-23T16:00:00Z'),
  (29, 'FedEx', 'FX-SQ-100029', 'DELIVERED',  '2026-02-14T10:00:00Z', '2026-02-17T12:00:00Z');

INSERT INTO audit_log (actor, action, target_table, target_id, detail) VALUES
  ('alice',  'UPDATE', 'users',    3,    'role changed to MANAGER'),
  ('grace',  'DELETE', 'products', 14,   'discontinued product removed'),
  ('bob',    'INSERT', 'orders',   30,   'manual order creation'),
  ('alice',  'UPDATE', 'orders',   6,    'status → CANCELLED'),
  ('rose',   'UPDATE', 'users',    13,   'account deactivated'),
  ('alice',  'DROP',   'audit_log', NULL,'monthly archive rotation'),
  ('bob',    'UPDATE', 'products', 1,    'price adjustment +5%'),
  ('grace',  'INSERT', 'users',    NULL, 'bulk import 5 new accounts'),
  ('alice',  'UPDATE', 'shipments',3,    'tracking number corrected'),
  ('rose',   'UPDATE', 'payments', 16,   'refund processed');

SELECT 'users:     ' || COUNT(*) FROM users;
SELECT 'products:  ' || COUNT(*) FROM products;
SELECT 'orders:    ' || COUNT(*) FROM orders;
SELECT 'order_items:' || COUNT(*) FROM order_items;
SELECT 'payments:  ' || COUNT(*) FROM payments;
SELECT 'shipments: ' || COUNT(*) FROM shipments;
SELECT 'audit_log: ' || COUNT(*) FROM audit_log;
