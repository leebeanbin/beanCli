-- =============================================================
-- 008_fk_stage1_not_valid.sql
-- Stage 1 FK rollout (safe mode): add NOT VALID foreign keys
-- =============================================================

-- Supporting indexes for FK columns
CREATE INDEX IF NOT EXISTS state_orders_user_id_hash_fk_idx ON state_orders (user_id_hash);
CREATE INDEX IF NOT EXISTS state_orders_payment_id_hash_fk_idx ON state_orders (payment_id_hash);
CREATE INDEX IF NOT EXISTS state_orders_shipment_id_hash_fk_idx ON state_orders (shipment_id_hash);
CREATE INDEX IF NOT EXISTS state_payments_order_id_hash_fk_idx ON state_payments (order_id_hash);
CREATE INDEX IF NOT EXISTS state_payments_user_id_hash_fk_idx ON state_payments (user_id_hash);
CREATE INDEX IF NOT EXISTS state_shipments_order_id_hash_fk_idx ON state_shipments (order_id_hash);
CREATE INDEX IF NOT EXISTS state_shipments_user_id_hash_fk_idx ON state_shipments (user_id_hash);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_orders_user') THEN
    ALTER TABLE state_orders
      ADD CONSTRAINT fk_state_orders_user
      FOREIGN KEY (user_id_hash)
      REFERENCES state_users(entity_id_hash)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_orders_payment') THEN
    ALTER TABLE state_orders
      ADD CONSTRAINT fk_state_orders_payment
      FOREIGN KEY (payment_id_hash)
      REFERENCES state_payments(entity_id_hash)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_orders_shipment') THEN
    ALTER TABLE state_orders
      ADD CONSTRAINT fk_state_orders_shipment
      FOREIGN KEY (shipment_id_hash)
      REFERENCES state_shipments(entity_id_hash)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_payments_order') THEN
    ALTER TABLE state_payments
      ADD CONSTRAINT fk_state_payments_order
      FOREIGN KEY (order_id_hash)
      REFERENCES state_orders(entity_id_hash)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_payments_user') THEN
    ALTER TABLE state_payments
      ADD CONSTRAINT fk_state_payments_user
      FOREIGN KEY (user_id_hash)
      REFERENCES state_users(entity_id_hash)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_shipments_order') THEN
    ALTER TABLE state_shipments
      ADD CONSTRAINT fk_state_shipments_order
      FOREIGN KEY (order_id_hash)
      REFERENCES state_orders(entity_id_hash)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_shipments_user') THEN
    ALTER TABLE state_shipments
      ADD CONSTRAINT fk_state_shipments_user
      FOREIGN KEY (user_id_hash)
      REFERENCES state_users(entity_id_hash)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE
      NOT VALID;
  END IF;
END $$;
