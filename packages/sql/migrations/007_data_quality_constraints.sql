-- =============================================================
-- 007_data_quality_constraints.sql
-- Data integrity hardening for state tables
-- =============================================================

-- Normalize existing values first
UPDATE state_users
SET
  status = UPPER(TRIM(status)),
  tier = UPPER(TRIM(tier)),
  country_code = CASE WHEN country_code IS NULL THEN NULL ELSE UPPER(TRIM(country_code)) END;

UPDATE state_orders
SET
  status = UPPER(TRIM(status)),
  currency_code = UPPER(TRIM(currency_code));

UPDATE state_payments
SET
  status = UPPER(TRIM(status)),
  currency_code = UPPER(TRIM(currency_code)),
  payment_method = CASE WHEN payment_method IS NULL THEN NULL ELSE UPPER(TRIM(payment_method)) END;

UPDATE state_shipments
SET
  status = UPPER(TRIM(status)),
  destination_country = CASE WHEN destination_country IS NULL THEN NULL ELSE UPPER(TRIM(destination_country)) END;

UPDATE state_products
SET
  status = UPPER(TRIM(status)),
  category = CASE
    WHEN category IS NULL THEN NULL
    WHEN LOWER(TRIM(category)) = 'electronics' THEN 'Electronics'
    WHEN LOWER(TRIM(category)) = 'fashion' THEN 'Fashion'
    WHEN LOWER(TRIM(category)) = 'food' THEN 'Food'
    WHEN LOWER(TRIM(category)) = 'furniture' THEN 'Furniture'
    WHEN LOWER(TRIM(category)) = 'lifestyle' THEN 'Lifestyle'
    WHEN LOWER(TRIM(category)) = 'sports' THEN 'Sports'
    ELSE INITCAP(TRIM(category))
  END;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_users_status_chk') THEN
    ALTER TABLE state_users
      ADD CONSTRAINT state_users_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_users_tier_chk') THEN
    ALTER TABLE state_users
      ADD CONSTRAINT state_users_tier_chk CHECK (tier IN ('STANDARD', 'PREMIUM', 'VIP'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_users_country_code_chk') THEN
    ALTER TABLE state_users
      ADD CONSTRAINT state_users_country_code_chk CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_products_status_chk') THEN
    ALTER TABLE state_products
      ADD CONSTRAINT state_products_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_products_price_nonneg_chk') THEN
    ALTER TABLE state_products
      ADD CONSTRAINT state_products_price_nonneg_chk CHECK (price_cents >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_products_stock_nonneg_chk') THEN
    ALTER TABLE state_products
      ADD CONSTRAINT state_products_stock_nonneg_chk CHECK (stock_quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_products_category_chk') THEN
    ALTER TABLE state_products
      ADD CONSTRAINT state_products_category_chk CHECK (
        category IS NULL OR category IN ('Electronics', 'Fashion', 'Food', 'Furniture', 'Lifestyle', 'Sports')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_orders_status_chk') THEN
    ALTER TABLE state_orders
      ADD CONSTRAINT state_orders_status_chk CHECK (
        status IN ('CREATED', 'PAYMENT_PENDING', 'PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_orders_amount_nonneg_chk') THEN
    ALTER TABLE state_orders
      ADD CONSTRAINT state_orders_amount_nonneg_chk CHECK (total_amount_cents >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_orders_item_count_nonneg_chk') THEN
    ALTER TABLE state_orders
      ADD CONSTRAINT state_orders_item_count_nonneg_chk CHECK (item_count >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_orders_currency_code_chk') THEN
    ALTER TABLE state_orders
      ADD CONSTRAINT state_orders_currency_code_chk CHECK (currency_code ~ '^[A-Z]{3}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_payments_status_chk') THEN
    ALTER TABLE state_payments
      ADD CONSTRAINT state_payments_status_chk CHECK (
        status IN ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_payments_amount_nonneg_chk') THEN
    ALTER TABLE state_payments
      ADD CONSTRAINT state_payments_amount_nonneg_chk CHECK (amount_cents >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_payments_refunded_nonneg_chk') THEN
    ALTER TABLE state_payments
      ADD CONSTRAINT state_payments_refunded_nonneg_chk CHECK (refunded_amount_cents >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_payments_refunded_lte_amount_chk') THEN
    ALTER TABLE state_payments
      ADD CONSTRAINT state_payments_refunded_lte_amount_chk CHECK (refunded_amount_cents <= amount_cents);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_payments_currency_code_chk') THEN
    ALTER TABLE state_payments
      ADD CONSTRAINT state_payments_currency_code_chk CHECK (currency_code ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_payments_method_chk') THEN
    ALTER TABLE state_payments
      ADD CONSTRAINT state_payments_method_chk CHECK (payment_method IS NULL OR payment_method IN ('CARD', 'BANK_TRANSFER', 'WALLET'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_shipments_status_chk') THEN
    ALTER TABLE state_shipments
      ADD CONSTRAINT state_shipments_status_chk CHECK (
        status IN ('PREPARING', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_shipments_destination_country_chk') THEN
    ALTER TABLE state_shipments
      ADD CONSTRAINT state_shipments_destination_country_chk CHECK (
        destination_country IS NULL OR destination_country ~ '^[A-Z]{2}$'
      );
  END IF;
END $$;
