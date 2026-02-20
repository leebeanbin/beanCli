-- =============================================================
-- 003_state_tables.sql
-- Terminal-First Streaming Data Console v1
-- e-commerce mock 도메인 state 테이블
-- (Projector가 events_raw → state_* UPSERT)
-- =============================================================

-- -----------------------------------------------
-- state_users
-- -----------------------------------------------
CREATE TABLE state_users (
  entity_id_hash          TEXT         NOT NULL,
  updated_event_time_ms   BIGINT       NOT NULL,
  last_offset             BIGINT       NOT NULL,

  -- Domain fields
  email_hash              TEXT,        -- 이메일도 HMAC 해시
  username                TEXT,
  status                  TEXT         NOT NULL DEFAULT 'ACTIVE',
  tier                    TEXT         NOT NULL DEFAULT 'STANDARD',  -- STANDARD/PREMIUM/VIP
  country_code            TEXT,
  created_event_time_ms   BIGINT,

  CONSTRAINT state_users_pkey PRIMARY KEY (entity_id_hash)
);

CREATE INDEX state_users_status_idx ON state_users (status);
CREATE INDEX state_users_tier_idx ON state_users (tier);
CREATE INDEX state_users_updated_time_idx ON state_users (updated_event_time_ms DESC);

COMMENT ON TABLE state_users IS '사용자 투영 상태. entity_id_hash = HMAC-SHA256(user_id).';

-- -----------------------------------------------
-- state_products
-- -----------------------------------------------
CREATE TABLE state_products (
  entity_id_hash          TEXT         NOT NULL,
  updated_event_time_ms   BIGINT       NOT NULL,
  last_offset             BIGINT       NOT NULL,

  -- Domain fields
  sku                     TEXT,
  name                    TEXT,
  category                TEXT,
  price_cents             BIGINT       NOT NULL DEFAULT 0,
  stock_quantity          INT          NOT NULL DEFAULT 0,
  status                  TEXT         NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE/INACTIVE/DISCONTINUED
  created_event_time_ms   BIGINT,

  CONSTRAINT state_products_pkey PRIMARY KEY (entity_id_hash)
);

CREATE INDEX state_products_status_idx ON state_products (status);
CREATE INDEX state_products_category_idx ON state_products (category);
CREATE INDEX state_products_stock_idx ON state_products (stock_quantity)
  WHERE stock_quantity = 0;  -- 품절 상품 빠른 조회

COMMENT ON TABLE state_products IS '상품 투영 상태. ProductAdjusted 이벤트로 갱신.';

-- -----------------------------------------------
-- state_orders
-- -----------------------------------------------
CREATE TABLE state_orders (
  entity_id_hash          TEXT         NOT NULL,
  updated_event_time_ms   BIGINT       NOT NULL,
  last_offset             BIGINT       NOT NULL,

  -- Domain fields
  user_id_hash            TEXT,        -- state_users 참조 (hash)
  status                  TEXT         NOT NULL DEFAULT 'CREATED',
    -- CREATED / PAYMENT_PENDING / PAID / FULFILLING / SHIPPED / DELIVERED / CANCELLED / REFUNDED
  total_amount_cents      BIGINT       NOT NULL DEFAULT 0,
  item_count              INT          NOT NULL DEFAULT 0,
  currency_code           TEXT         NOT NULL DEFAULT 'USD',
  payment_id_hash         TEXT,        -- state_payments 참조
  shipment_id_hash        TEXT,        -- state_shipments 참조
  created_event_time_ms   BIGINT,

  CONSTRAINT state_orders_pkey PRIMARY KEY (entity_id_hash)
);

CREATE INDEX state_orders_status_idx ON state_orders (status);
CREATE INDEX state_orders_user_id_hash_idx ON state_orders (user_id_hash);
CREATE INDEX state_orders_updated_time_idx ON state_orders (updated_event_time_ms DESC);
CREATE INDEX state_orders_active_idx ON state_orders (status, updated_event_time_ms DESC)
  WHERE status NOT IN ('DELIVERED', 'CANCELLED', 'REFUNDED');

COMMENT ON TABLE state_orders IS '주문 투영 상태. OrderCreated 이벤트로 초기 생성.';

-- -----------------------------------------------
-- state_payments
-- -----------------------------------------------
CREATE TABLE state_payments (
  entity_id_hash          TEXT         NOT NULL,
  updated_event_time_ms   BIGINT       NOT NULL,
  last_offset             BIGINT       NOT NULL,

  -- Domain fields
  order_id_hash           TEXT,
  user_id_hash            TEXT,
  status                  TEXT         NOT NULL DEFAULT 'PENDING',
    -- PENDING / AUTHORIZED / CAPTURED / FAILED / REFUNDED / PARTIALLY_REFUNDED
  amount_cents            BIGINT       NOT NULL DEFAULT 0,
  currency_code           TEXT         NOT NULL DEFAULT 'USD',
  payment_method          TEXT,        -- CARD / BANK_TRANSFER / WALLET
  captured_at_ms          BIGINT,
  refunded_amount_cents   BIGINT       NOT NULL DEFAULT 0,
  created_event_time_ms   BIGINT,

  CONSTRAINT state_payments_pkey PRIMARY KEY (entity_id_hash)
);

CREATE INDEX state_payments_status_idx ON state_payments (status);
CREATE INDEX state_payments_order_id_hash_idx ON state_payments (order_id_hash);
CREATE INDEX state_payments_user_id_hash_idx ON state_payments (user_id_hash);

COMMENT ON TABLE state_payments IS '결제 투영 상태. PaymentCaptured 이벤트로 갱신.';

-- -----------------------------------------------
-- state_shipments
-- -----------------------------------------------
CREATE TABLE state_shipments (
  entity_id_hash          TEXT         NOT NULL,
  updated_event_time_ms   BIGINT       NOT NULL,
  last_offset             BIGINT       NOT NULL,

  -- Domain fields
  order_id_hash           TEXT,
  user_id_hash            TEXT,
  status                  TEXT         NOT NULL DEFAULT 'PREPARING',
    -- PREPARING / DISPATCHED / IN_TRANSIT / OUT_FOR_DELIVERY / DELIVERED / FAILED / RETURNED
  carrier                 TEXT,
  tracking_number_hash    TEXT,        -- 운송장번호도 해시
  estimated_delivery_ms   BIGINT,
  actual_delivery_ms      BIGINT,
  destination_country     TEXT,
  created_event_time_ms   BIGINT,

  CONSTRAINT state_shipments_pkey PRIMARY KEY (entity_id_hash)
);

CREATE INDEX state_shipments_status_idx ON state_shipments (status);
CREATE INDEX state_shipments_order_id_hash_idx ON state_shipments (order_id_hash);
CREATE INDEX state_shipments_active_idx ON state_shipments (status, updated_event_time_ms DESC)
  WHERE status NOT IN ('DELIVERED', 'RETURNED');

COMMENT ON TABLE state_shipments IS '배송 투영 상태. ShipmentStatusChanged 이벤트로 갱신.';
