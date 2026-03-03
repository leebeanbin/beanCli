#!/usr/bin/env bash
# ============================================================
# seed-redis-dev.sh
# beanCLI 개발용 Redis 시드 데이터
#
# Stores:
#   - users:*         HASH  — user profile fields
#   - products:*      HASH  — product fields
#   - orders:*        HASH  — order fields
#   - users:index     SORTED SET  — user IDs by created_at epoch
#   - products:index  SORTED SET  — product IDs by price_cents
#   - orders:index    SORTED SET  — order IDs by created_at epoch
#   - orders:by_user:<user_id>  SET  — order IDs per user
#   - stats           HASH  — aggregate counters
#   - config          HASH  — app configuration
#
# Run: bash scripts/seed-redis-dev.sh [redis-cli args]
# Example: bash scripts/seed-redis-dev.sh -h localhost -p 6379
#
# ============================================================

set -euo pipefail

# All extra args passed through to redis-cli (host, port, auth, etc.)
REDIS_ARGS=("$@")
R() { redis-cli "${REDIS_ARGS[@]}" "$@" > /dev/null; }
NOW=$(date +%s)

echo "Flushing existing bean_dev keys..."
# Flush only our namespaced keys (safer than FLUSHDB in shared Redis)
KEYS=$(redis-cli "${REDIS_ARGS[@]}" KEYS 'users:*' 'products:*' 'orders:*' 'order_items:*' 'payments:*' 'shipments:*' 'audit_log:*' 'stats' 'config' 2>/dev/null | tr '\n' ' ')
if [[ -n "$KEYS" ]]; then
  # shellcheck disable=SC2086
  redis-cli "${REDIS_ARGS[@]}" DEL $KEYS > /dev/null
fi

echo "Seeding Redis..."

# Helper: days-ago timestamp
days_ago() { echo $(( NOW - $1 * 86400 )); }

# ── users (HASH) ──────────────────────────────────────────────────────────────

seed_user() {
  local id=$1 username=$2 email=$3 role=$4 balance=$5 is_active=$6 created=$7
  redis-cli "${REDIS_ARGS[@]}" HSET "users:${id}" \
    id "$id" username "$username" email "$email" role "$role" \
    balance_cents "$balance" is_active "$is_active" \
    created_at "$created" updated_at "$NOW" > /dev/null
  redis-cli "${REDIS_ARGS[@]}" ZADD "users:index" "$created" "$id" > /dev/null
}

seed_user  1 alice    alice@bean.dev   DBA      125000 1 "$(days_ago 90)"
seed_user  2 bob      bob@bean.dev     MANAGER   89000 1 "$(days_ago 85)"
seed_user  3 carol    carol@bean.dev   ANALYST   45000 1 "$(days_ago 80)"
seed_user  4 dave     dave@bean.dev    ANALYST   67000 1 "$(days_ago 75)"
seed_user  5 eve      eve@bean.dev     MANAGER  210000 1 "$(days_ago 70)"
seed_user  6 frank    frank@bean.dev   ANALYST   31000 0 "$(days_ago 65)"
seed_user  7 grace    grace@bean.dev   DBA      175000 1 "$(days_ago 60)"
seed_user  8 heidi    heidi@bean.dev   ANALYST   52000 1 "$(days_ago 55)"
seed_user  9 ivan     ivan@bean.dev    ANALYST   18000 0 "$(days_ago 50)"
seed_user 10 judy     judy@bean.dev    MANAGER  143000 1 "$(days_ago 45)"
seed_user 11 ken      ken@bean.dev     ANALYST   29000 1 "$(days_ago 40)"
seed_user 12 lara     lara@bean.dev    ANALYST   74000 1 "$(days_ago 35)"
seed_user 13 mallory  mallory@bean.dev ANALYST   11000 0 "$(days_ago 30)"
seed_user 14 nick     nick@bean.dev    ANALYST   88000 1 "$(days_ago 25)"
seed_user 15 olivia   olivia@bean.dev  MANAGER  196000 1 "$(days_ago 20)"
seed_user 16 peter    peter@bean.dev   ANALYST   43000 1 "$(days_ago 18)"
seed_user 17 quinn    quinn@bean.dev   ANALYST   60000 1 "$(days_ago 15)"
seed_user 18 rose     rose@bean.dev    DBA      230000 1 "$(days_ago 12)"
seed_user 19 sam      sam@bean.dev     ANALYST   37000 1 "$(days_ago 8)"
seed_user 20 tina     tina@bean.dev    ANALYST   55000 1 "$(days_ago 5)"

echo "  → 20 users"

# ── products (HASH) ───────────────────────────────────────────────────────────

seed_product() {
  local id=$1 sku=$2 name=$3 category=$4 price=$5 stock=$6 is_active=$7
  redis-cli "${REDIS_ARGS[@]}" HSET "products:${id}" \
    id "$id" sku "$sku" name "$name" category "$category" \
    price_cents "$price" stock "$stock" is_active "$is_active" \
    created_at "$(days_ago 60)" > /dev/null
  redis-cli "${REDIS_ARGS[@]}" ZADD "products:index"    "$price"  "$id" > /dev/null
  redis-cli "${REDIS_ARGS[@]}" SADD "products:category:${category}" "$id" > /dev/null
}

seed_product  1 BEAN-001 "Mechanical Keyboard TKL"  peripherals  12900 142 1
seed_product  2 BEAN-002 "USB-C Hub 7-Port"         accessories   4500  89 1
seed_product  3 BEAN-003 "IPS Monitor 27in"         displays     42000  23 1
seed_product  4 BEAN-004 "Wireless Mouse Pro"       peripherals   6800 201 1
seed_product  5 BEAN-005 "Webcam 4K"                peripherals  15900  55 1
seed_product  6 BEAN-006 "NVMe SSD 1TB"             storage      11900 178 1
seed_product  7 BEAN-007 "RAM 32GB DDR5"            memory       18500  67 1
seed_product  8 BEAN-008 "USB-C Cable 2m"           accessories    900 500 1
seed_product  9 BEAN-009 "Laptop Stand Aluminium"   accessories   3200 112 1
seed_product 10 BEAN-010 "Headphones ANC"           audio        22000  44 1
seed_product 11 BEAN-011 "Microphone USB Cardioid"  audio         9900  36 1
seed_product 12 BEAN-012 "Desk Pad XL"              accessories   2500 320 1
seed_product 13 BEAN-013 "PCIe Wi-Fi 6E Card"       networking    4800  71 1
seed_product 14 BEAN-014 "Thunderbolt 4 Dock"       accessories  34500   8 0
seed_product 15 BEAN-015 "Ergonomic Chair Support"  furniture    12000  15 1

echo "  → 15 products"

# ── orders (HASH + user index) ────────────────────────────────────────────────

seed_order() {
  local id=$1 user_id=$2 status=$3 total=$4 item_count=$5 note=$6 created=$7
  redis-cli "${REDIS_ARGS[@]}" HSET "orders:${id}" \
    id "$id" user_id "$user_id" status "$status" \
    total_cents "$total" item_count "$item_count" note "$note" \
    created_at "$created" updated_at "$NOW" > /dev/null
  redis-cli "${REDIS_ARGS[@]}" ZADD "orders:index"             "$created" "$id" > /dev/null
  redis-cli "${REDIS_ARGS[@]}" SADD "orders:by_user:${user_id}" "$id" > /dev/null
  redis-cli "${REDIS_ARGS[@]}" SADD "orders:by_status:${status}" "$id" > /dev/null
}

seed_order  1  1 DELIVERED  12900 1 ""                 "$(days_ago 20)"
seed_order  2  2 DELIVERED  51500 3 "Priority delivery" "$(days_ago 19)"
seed_order  3  3 SHIPPED    22000 1 ""                 "$(days_ago 18)"
seed_order  4  4 CONFIRMED   9400 2 ""                 "$(days_ago 17)"
seed_order  5  5 DELIVERED  47700 4 "Gift wrap"        "$(days_ago 16)"
seed_order  6  6 CANCELLED   6800 1 "Out of stock"     "$(days_ago 15)"
seed_order  7  7 DELIVERED  30400 2 ""                 "$(days_ago 14)"
seed_order  8  8 PENDING    15900 1 ""                 "$(days_ago 13)"
seed_order  9  9 SHIPPED    11900 1 ""                 "$(days_ago 12)"
seed_order 10 10 DELIVERED  44500 3 ""                 "$(days_ago 11)"
seed_order 11  1 CONFIRMED  18500 1 "Urgent"           "$(days_ago 10)"
seed_order 12  2 SHIPPED     3200 1 ""                 "$(days_ago 9)"
seed_order 13  3 DELIVERED  22900 2 ""                 "$(days_ago 8)"
seed_order 14 11 PENDING     4500 1 ""                 "$(days_ago 7)"
seed_order 15 12 CONFIRMED  37000 2 ""                 "$(days_ago 6)"
seed_order 16 13 CANCELLED  12000 1 ""                 "$(days_ago 5)"
seed_order 17 14 DELIVERED  19800 2 ""                 "$(days_ago 4)"
seed_order 18 15 SHIPPED     9900 1 ""                 "$(days_ago 4)"
seed_order 19 16 DELIVERED  57400 5 ""                 "$(days_ago 3)"
seed_order 20 17 PENDING     2500 1 ""                 "$(days_ago 3)"
seed_order 21 18 CONFIRMED  35300 3 ""                 "$(days_ago 2)"
seed_order 22 19 DELIVERED  44000 2 ""                 "$(days_ago 2)"
seed_order 23 20 SHIPPED     6800 1 ""                 "$(days_ago 1)"
seed_order 24  5 DELIVERED  22000 1 ""                 "$(days_ago 1)"
seed_order 25  7 CONFIRMED   4800 1 ""                 "$(days_ago 1)"
seed_order 26 10 PENDING    11900 1 ""                 "$NOW"
seed_order 27  1 DELIVERED  25200 2 ""                 "$NOW"
seed_order 28  3 CANCELLED   9900 1 "Damaged on arrival" "$NOW"
seed_order 29 15 DELIVERED  42000 1 ""                 "$NOW"
seed_order 30  8 CONFIRMED  18500 1 ""                 "$NOW"

echo "  → 30 orders"

# ── payments (HASH) ───────────────────────────────────────────────────────────

seed_payment() {
  local id=$1 order_id=$2 method=$3 status=$4 amount=$5 txn_id=$6
  redis-cli "${REDIS_ARGS[@]}" HSET "payments:${id}" \
    id "$id" order_id "$order_id" method "$method" status "$status" \
    amount_cents "$amount" transaction_id "$txn_id" \
    created_at "$(days_ago $(( 20 - id + 1 < 0 ? 0 : 20 - id + 1 )))" > /dev/null
  redis-cli "${REDIS_ARGS[@]}" SET "payments:txn:${txn_id}" "$id" > /dev/null 2>&1 || true
}

seed_payment  1  1 CARD          COMPLETED 12900 txn_rd_001
seed_payment  2  2 CARD          COMPLETED 51500 txn_rd_002
seed_payment  3  3 WALLET        COMPLETED 22000 txn_rd_003
seed_payment  4  4 BANK_TRANSFER PENDING    9400 ""
seed_payment  5  5 CARD          COMPLETED 47700 txn_rd_005
seed_payment  6  6 CARD          REFUNDED   6800 txn_rd_006
seed_payment  7  7 WALLET        COMPLETED 30400 txn_rd_007
seed_payment  8  8 CASH          PENDING   15900 ""
seed_payment  9  9 CARD          COMPLETED 11900 txn_rd_009
seed_payment 10 10 CARD          COMPLETED 44500 txn_rd_010
seed_payment 11 11 BANK_TRANSFER PENDING   18500 ""
seed_payment 12 12 CARD          COMPLETED  3200 txn_rd_012
seed_payment 13 13 WALLET        COMPLETED 22900 txn_rd_013
seed_payment 14 14 CARD          PENDING    4500 ""
seed_payment 15 15 CARD          COMPLETED 37000 txn_rd_015
seed_payment 16 16 CARD          REFUNDED  12000 txn_rd_016
seed_payment 17 17 CARD          COMPLETED 19800 txn_rd_017
seed_payment 18 22 CARD          COMPLETED 44000 txn_rd_022
seed_payment 19 24 CARD          COMPLETED 22000 txn_rd_024
seed_payment 20 29 CARD          COMPLETED 42000 txn_rd_029

echo "  → 20 payments"

# ── shipments (HASH) ──────────────────────────────────────────────────────────

seed_shipment() {
  local id=$1 order_id=$2 carrier=$3 tracking_no=$4 status=$5 shipped_days=$6 delivered_days=$7
  local shipped_at delivered_at
  shipped_at="$(days_ago $shipped_days)"
  delivered_at=$( [[ "$delivered_days" == "-" ]] && echo "" || echo "$(days_ago $delivered_days)" )
  redis-cli "${REDIS_ARGS[@]}" HSET "shipments:${id}" \
    id "$id" order_id "$order_id" carrier "$carrier" tracking_no "$tracking_no" \
    status "$status" shipped_at "$shipped_at" delivered_at "$delivered_at" \
    created_at "$(days_ago $(( shipped_days + 1 )))" > /dev/null
}

seed_shipment  1  1 FedEx FX-RD-100001 DELIVERED  18 15
seed_shipment  2  2 UPS   UP-RD-100002 DELIVERED  17 14
seed_shipment  3  3 DHL   DH-RD-100003 IN_TRANSIT  2 -
seed_shipment  4  5 FedEx FX-RD-100005 DELIVERED  14 11
seed_shipment  5  7 UPS   UP-RD-100007 DELIVERED  12  9
seed_shipment  6  9 DHL   DH-RD-100009 IN_TRANSIT  1 -
seed_shipment  7 10 FedEx FX-RD-100010 DELIVERED   9  6
seed_shipment  8 12 UPS   UP-RD-100012 IN_TRANSIT  3 -
seed_shipment  9 13 FedEx FX-RD-100013 DELIVERED   6  3
seed_shipment 10 17 UPS   UP-RD-100017 DELIVERED   3  1
seed_shipment 11 22 DHL   DH-RD-100022 DELIVERED   2  0
seed_shipment 12 29 FedEx FX-RD-100029 DELIVERED   5  2

echo "  → 12 shipments"

# ── audit_log (LIST + HASH) ───────────────────────────────────────────────────

seed_audit() {
  local id=$1 actor=$2 action=$3 target=$4 target_id=$5 detail=$6 created=$7
  redis-cli "${REDIS_ARGS[@]}" HSET "audit_log:${id}" \
    id "$id" actor "$actor" action "$action" target_collection "$target" \
    target_id "$target_id" detail "$detail" created_at "$created" > /dev/null
  redis-cli "${REDIS_ARGS[@]}" LPUSH "audit_log:list" "$id" > /dev/null
}

seed_audit  1 alice  UPDATE users       3   "role changed to MANAGER"      "$(days_ago 10)"
seed_audit  2 grace  DELETE products   14   "discontinued product removed"  "$(days_ago 8)"
seed_audit  3 bob    INSERT orders     30   "manual order creation"         "$(days_ago 6)"
seed_audit  4 alice  UPDATE orders      6   "status changed to CANCELLED"   "$(days_ago 5)"
seed_audit  5 rose   UPDATE users      13   "account deactivated"           "$(days_ago 4)"
seed_audit  6 alice  DROP   audit_log  ""   "monthly archive rotation"      "$(days_ago 3)"
seed_audit  7 bob    UPDATE products    1   "price adjustment +5%"          "$(days_ago 2)"
seed_audit  8 grace  INSERT users      ""   "bulk import 5 new accounts"    "$(days_ago 1)"
seed_audit  9 alice  UPDATE shipments   3   "tracking number corrected"     "$(days_ago 1)"
seed_audit 10 rose   UPDATE payments   16   "refund processed"              "$NOW"

echo "  → 10 audit_log entries"

# ── Aggregate stats (HASH) ───────────────────────────────────────────────────

redis-cli "${REDIS_ARGS[@]}" HSET stats \
  total_users        20 \
  active_users       17 \
  total_products     15 \
  active_products    14 \
  total_orders       30 \
  orders_delivered   12 \
  orders_pending      5 \
  orders_shipped      5 \
  orders_confirmed    5 \
  orders_cancelled    3 \
  total_revenue_cents 568900 \
  total_payments     20 \
  completed_payments 14 \
  pending_payments    5 \
  refunded_payments   2 \
  total_shipments    12 \
  last_seeded_at "$NOW" > /dev/null

echo "  → stats hash"

# ── App config (HASH) ─────────────────────────────────────────────────────────

redis-cli "${REDIS_ARGS[@]}" HSET config \
  app_name          "beanCLI" \
  version           "0.1.3" \
  env               "development" \
  max_query_rows    10000 \
  query_timeout_ms  30000 \
  default_page_size 50 > /dev/null

echo "  → config hash"

# ── Set TTL on session-like keys ──────────────────────────────────────────────
# (no TTL on main data — persistent store)

echo ""
echo "✅ Redis bean_dev seed complete"
echo ""
echo "Key overview:"
redis-cli "${REDIS_ARGS[@]}" KEYS 'users:*'    | wc -l | xargs echo "  users:*       ="
redis-cli "${REDIS_ARGS[@]}" KEYS 'products:*' | wc -l | xargs echo "  products:*    ="
redis-cli "${REDIS_ARGS[@]}" KEYS 'orders:*'   | wc -l | xargs echo "  orders:*      ="
redis-cli "${REDIS_ARGS[@]}" KEYS 'payments:*' | wc -l | xargs echo "  payments:*    ="
redis-cli "${REDIS_ARGS[@]}" KEYS 'shipments:*'| wc -l | xargs echo "  shipments:*   ="
redis-cli "${REDIS_ARGS[@]}" KEYS 'audit_log:*'| wc -l | xargs echo "  audit_log:*   ="
echo ""
echo "Try: redis-cli HGETALL users:1"
echo "     redis-cli ZRANGE orders:index 0 -1 WITHSCORES"
