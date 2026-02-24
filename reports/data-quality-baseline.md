# Data Quality Baseline

This baseline compares current live DB values with CLI/UI validation rules and state semantics.

Generated on: 2026-02-24
Database: `tfsdc-postgres` / `tfsdc`

## 1) Live DB health checks

- Negative amounts / invalid code format checks: no anomalies found.
- Row counts:
  - `state_orders`: 22
  - `state_payments`: 22
  - `state_products`: 14
  - `state_users`: 20
  - `state_shipments`: 16

## 2) Distinct value inventory

- Currencies in orders/payments:
  - `AUD, BRL, EUR, JPY, KRW, MXN, SGD, USD`
- Countries:
  - `state_users.country_code`: `AU, BR, CA, CN, DE, FR, GB, IN, IT, JP, KR, MX, NL, SG, US`
  - `state_shipments.destination_country`: `AU, BR, FR, IN, KR, SG, US`
- Status sets (live):
  - orders: `CANCELLED, CREATED, DELIVERED, FULFILLING, PAID, PAYMENT_PENDING, REFUNDED, SHIPPED`
  - payments: `AUTHORIZED, CAPTURED, PENDING, REFUNDED`
  - products: `ACTIVE, DISCONTINUED`
  - shipments: `DELIVERED, DISPATCHED, IN_TRANSIT, OUT_FOR_DELIVERY, PREPARING, RETURNED`
  - users: `ACTIVE, INACTIVE`
- Product categories:
  - `Electronics, Fashion, Food, Furniture, Lifestyle, Sports`

## 3) Rule drift observed before hardening

- UI schema mismatch counts previously observed:
  - `state_orders`: 4
  - `state_payments`: 4
  - `state_products`: 14
  - `state_shipments`: 0
  - `state_users`: 0
- Root causes:
  - UI currency enum missing `SGD/BRL/MXN`
  - UI product category enum expected uppercase set, while live data used title-case business categories

## 4) Hardening actions applied in this iteration

- UI validation/normalization now aligned with live values for currency/category.
- State write API now applies server-side field normalization and validation rules.
- API list query now sanitizes `orderBy` to whitelisted columns.
- Follow-up DB-level CHECK constraints and migration are planned next.

## 5) Repro SQL snippets

Use these queries in `docker exec tfsdc-postgres psql -U postgres -d tfsdc`.

```sql
SELECT 'state_orders' AS table_name, COUNT(*) AS total_rows,
       COUNT(*) FILTER (WHERE total_amount_cents < 0) AS negative_amounts,
       COUNT(*) FILTER (WHERE item_count < 0) AS negative_item_count,
       COUNT(*) FILTER (WHERE currency_code !~ '^[A-Z]{3}$') AS bad_currency_format
FROM state_orders
UNION ALL
SELECT 'state_payments', COUNT(*),
       COUNT(*) FILTER (WHERE amount_cents < 0), 0,
       COUNT(*) FILTER (WHERE currency_code !~ '^[A-Z]{3}$')
FROM state_payments;
```
