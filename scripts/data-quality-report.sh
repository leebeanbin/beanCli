#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${TFSDC_PG_CONTAINER:-tfsdc-postgres}"
DB_USER="${TFSDC_PG_USER:-postgres}"
DB_NAME="${TFSDC_PG_DB:-tfsdc}"

echo "== Data Quality Report =="
echo "container=${CONTAINER} db=${DB_NAME}"
echo

docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "
SELECT 'state_orders' AS table_name, COUNT(*) AS total_rows,
       COUNT(*) FILTER (WHERE total_amount_cents < 0) AS negative_amounts,
       COUNT(*) FILTER (WHERE item_count < 0) AS negative_item_count,
       COUNT(*) FILTER (WHERE currency_code !~ '^[A-Z]{3}$') AS bad_currency_format
FROM state_orders
UNION ALL
SELECT 'state_payments', COUNT(*),
       COUNT(*) FILTER (WHERE amount_cents < 0), 0,
       COUNT(*) FILTER (WHERE currency_code !~ '^[A-Z]{3}$')
FROM state_payments
UNION ALL
SELECT 'state_products', COUNT(*),
       COUNT(*) FILTER (WHERE price_cents < 0),
       COUNT(*) FILTER (WHERE stock_quantity < 0), 0
FROM state_products
UNION ALL
SELECT 'state_users', COUNT(*), 0, 0,
       COUNT(*) FILTER (WHERE country_code !~ '^[A-Z]{2}$')
FROM state_users
UNION ALL
SELECT 'state_shipments', COUNT(*), 0, 0,
       COUNT(*) FILTER (WHERE destination_country !~ '^[A-Z]{2}$')
FROM state_shipments;
"

echo
docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "
SELECT 'orders.currency_code' AS field, string_agg(DISTINCT currency_code, ', ' ORDER BY currency_code) AS values
FROM state_orders
UNION ALL
SELECT 'payments.currency_code', string_agg(DISTINCT currency_code, ', ' ORDER BY currency_code)
FROM state_payments
UNION ALL
SELECT 'users.country_code', string_agg(DISTINCT country_code, ', ' ORDER BY country_code)
FROM state_users
UNION ALL
SELECT 'shipments.destination_country', string_agg(DISTINCT destination_country, ', ' ORDER BY destination_country)
FROM state_shipments;
"

echo
docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "
SELECT string_agg(DISTINCT category, ', ' ORDER BY category) AS product_categories
FROM state_products;
"

echo
docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "
SELECT 'orders.user_id_hash -> users' AS relation,
       COUNT(*) FILTER (
         WHERE o.user_id_hash IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM state_users u WHERE u.entity_id_hash = o.user_id_hash)
       ) AS orphan_count
FROM state_orders o
UNION ALL
SELECT 'orders.payment_id_hash -> payments',
       COUNT(*) FILTER (
         WHERE o.payment_id_hash IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM state_payments p WHERE p.entity_id_hash = o.payment_id_hash)
       )
FROM state_orders o
UNION ALL
SELECT 'orders.shipment_id_hash -> shipments',
       COUNT(*) FILTER (
         WHERE o.shipment_id_hash IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM state_shipments s WHERE s.entity_id_hash = o.shipment_id_hash)
       )
FROM state_orders o
UNION ALL
SELECT 'payments.order_id_hash -> orders',
       COUNT(*) FILTER (
         WHERE p.order_id_hash IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM state_orders o WHERE o.entity_id_hash = p.order_id_hash)
       )
FROM state_payments p
UNION ALL
SELECT 'payments.user_id_hash -> users',
       COUNT(*) FILTER (
         WHERE p.user_id_hash IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM state_users u WHERE u.entity_id_hash = p.user_id_hash)
       )
FROM state_payments p
UNION ALL
SELECT 'shipments.order_id_hash -> orders',
       COUNT(*) FILTER (
         WHERE s.order_id_hash IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM state_orders o WHERE o.entity_id_hash = s.order_id_hash)
       )
FROM state_shipments s
UNION ALL
SELECT 'shipments.user_id_hash -> users',
       COUNT(*) FILTER (
         WHERE s.user_id_hash IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM state_users u WHERE u.entity_id_hash = s.user_id_hash)
       )
FROM state_shipments s;
"
