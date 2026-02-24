#!/usr/bin/env bash
set -e

MAX_WAIT=60
ELAPSED=0

echo "⏳ Waiting for PostgreSQL..."
until docker exec tfsdc-postgres pg_isready -U postgres > /dev/null 2>&1; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "❌ PostgreSQL did not start within ${MAX_WAIT}s"
    exit 1
  fi
done
echo "✅ PostgreSQL is ready"

echo "⏳ Waiting for Kafka..."
ELAPSED=0
until docker exec tfsdc-kafka kafka-broker-api-versions --bootstrap-server localhost:29092 > /dev/null 2>&1; do
  sleep 3
  ELAPSED=$((ELAPSED + 3))
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "❌ Kafka did not start within ${MAX_WAIT}s"
    exit 1
  fi
done

# kafka-broker-api-versions 는 포트는 열렸지만 리더 선출 완료는 보장 안 함.
# KAFKA_ADVERTISED_LISTENERS 가 외부 포트(19092)를 가리키므로
# 컨테이너 내부에서 kafka-topics 로 메타데이터를 조회하면 리다이렉트 후 연결 실패함.
# → 대신 고정 대기로 리더 선출 완료를 기다림.
echo "⏳ Waiting for Kafka leader election (5s)..."
sleep 5
echo "✅ Kafka is ready"

echo "✅ All services are healthy"
