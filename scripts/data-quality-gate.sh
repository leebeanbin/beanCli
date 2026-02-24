#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${TFSDC_PG_CONTAINER:-tfsdc-postgres}"
DB_USER="${TFSDC_PG_USER:-postgres}"
DB_NAME="${TFSDC_PG_DB:-tfsdc}"

read -r FAIL_COUNT <<<"$(docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -tA -v ON_ERROR_STOP=1 -c "
WITH dq AS (
  SELECT
    (
      COUNT(*) FILTER (WHERE total_amount_cents < 0)
      + COUNT(*) FILTER (WHERE item_count < 0)
      + COUNT(*) FILTER (WHERE currency_code !~ '^[A-Z]{3}$')
    ) AS violations
  FROM state_orders
  UNION ALL
  SELECT
    (
      COUNT(*) FILTER (WHERE amount_cents < 0)
      + COUNT(*) FILTER (WHERE currency_code !~ '^[A-Z]{3}$')
    )
  FROM state_payments
  UNION ALL
  SELECT
    (
      COUNT(*) FILTER (WHERE price_cents < 0)
      + COUNT(*) FILTER (WHERE stock_quantity < 0)
    )
  FROM state_products
  UNION ALL
  SELECT COUNT(*) FILTER (WHERE country_code !~ '^[A-Z]{2}$')
  FROM state_users
  UNION ALL
  SELECT COUNT(*) FILTER (WHERE destination_country !~ '^[A-Z]{2}$')
  FROM state_shipments
),
orphans AS (
  SELECT COUNT(*) AS violations
  FROM state_orders o
  WHERE o.user_id_hash IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM state_users u WHERE u.entity_id_hash = o.user_id_hash)
  UNION ALL
  SELECT COUNT(*)
  FROM state_orders o
  WHERE o.payment_id_hash IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM state_payments p WHERE p.entity_id_hash = o.payment_id_hash)
  UNION ALL
  SELECT COUNT(*)
  FROM state_orders o
  WHERE o.shipment_id_hash IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM state_shipments s WHERE s.entity_id_hash = o.shipment_id_hash)
  UNION ALL
  SELECT COUNT(*)
  FROM state_payments p
  WHERE p.order_id_hash IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM state_orders o WHERE o.entity_id_hash = p.order_id_hash)
  UNION ALL
  SELECT COUNT(*)
  FROM state_payments p
  WHERE p.user_id_hash IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM state_users u WHERE u.entity_id_hash = p.user_id_hash)
  UNION ALL
  SELECT COUNT(*)
  FROM state_shipments s
  WHERE s.order_id_hash IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM state_orders o WHERE o.entity_id_hash = s.order_id_hash)
  UNION ALL
  SELECT COUNT(*)
  FROM state_shipments s
  WHERE s.user_id_hash IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM state_users u WHERE u.entity_id_hash = s.user_id_hash)
)
SELECT COALESCE((SELECT SUM(violations) FROM dq), 0)
     + COALESCE((SELECT SUM(violations) FROM orphans), 0);
")"

if [[ "${FAIL_COUNT}" != "0" ]]; then
  echo "Data quality gate failed: ${FAIL_COUNT} violations detected."
  exit 1
fi

echo "Data quality gate passed: no violations detected."
