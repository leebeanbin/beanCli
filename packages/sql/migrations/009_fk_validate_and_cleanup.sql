-- =============================================================
-- 009_fk_validate_and_cleanup.sql
-- Stage 2 FK rollout: cleanup orphan refs and validate constraints
-- =============================================================

-- 1) Cleanup orphan references safely (set nullable refs to NULL)
UPDATE state_orders o
SET user_id_hash = NULL
WHERE user_id_hash IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM state_users u WHERE u.entity_id_hash = o.user_id_hash
  );

UPDATE state_orders o
SET payment_id_hash = NULL
WHERE payment_id_hash IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM state_payments p WHERE p.entity_id_hash = o.payment_id_hash
  );

UPDATE state_orders o
SET shipment_id_hash = NULL
WHERE shipment_id_hash IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM state_shipments s WHERE s.entity_id_hash = o.shipment_id_hash
  );

UPDATE state_payments p
SET order_id_hash = NULL
WHERE order_id_hash IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM state_orders o WHERE o.entity_id_hash = p.order_id_hash
  );

UPDATE state_payments p
SET user_id_hash = NULL
WHERE user_id_hash IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM state_users u WHERE u.entity_id_hash = p.user_id_hash
  );

UPDATE state_shipments s
SET order_id_hash = NULL
WHERE order_id_hash IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM state_orders o WHERE o.entity_id_hash = s.order_id_hash
  );

UPDATE state_shipments s
SET user_id_hash = NULL
WHERE user_id_hash IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM state_users u WHERE u.entity_id_hash = s.user_id_hash
  );

-- 2) Validate staged constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_orders_user' AND NOT convalidated) THEN
    ALTER TABLE state_orders VALIDATE CONSTRAINT fk_state_orders_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_orders_payment' AND NOT convalidated) THEN
    ALTER TABLE state_orders VALIDATE CONSTRAINT fk_state_orders_payment;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_orders_shipment' AND NOT convalidated) THEN
    ALTER TABLE state_orders VALIDATE CONSTRAINT fk_state_orders_shipment;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_payments_order' AND NOT convalidated) THEN
    ALTER TABLE state_payments VALIDATE CONSTRAINT fk_state_payments_order;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_payments_user' AND NOT convalidated) THEN
    ALTER TABLE state_payments VALIDATE CONSTRAINT fk_state_payments_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_shipments_order' AND NOT convalidated) THEN
    ALTER TABLE state_shipments VALIDATE CONSTRAINT fk_state_shipments_order;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_state_shipments_user' AND NOT convalidated) THEN
    ALTER TABLE state_shipments VALIDATE CONSTRAINT fk_state_shipments_user;
  END IF;
END $$;
