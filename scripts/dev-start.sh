#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# .env 파일 확인
if [ ! -f .env ]; then
  echo "  .env not found, copying from .env.example..."
  cp .env.example .env
fi

# 환경변수 로드
set -a
source .env
set +a

APP_PORT="${APP_PORT:-3100}"
WEB_PORT=3000
SIDECAR_PORT="${BEANLLM_PORT:-3200}"

# ── 이전 실행에서 살아남은 고아 프로세스 정리 ─────────────────────
echo "  Clearing ports ${APP_PORT}, ${WEB_PORT}, ${SIDECAR_PORT}..."
for PORT in "$APP_PORT" "$WEB_PORT" "$SIDECAR_PORT"; do
  PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "   Killing stale process(es) on :${PORT} -> PIDs: $PIDS"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
done

# ── Docker 데몬 실행 여부 확인 → 꺼져 있으면 자동 시작 ─────────
if ! docker info > /dev/null 2>&1; then
  echo ""
  echo "  Docker daemon is not running — attempting to start Docker Desktop..."
  open -a Docker 2>/dev/null || true

  echo "  Waiting for Docker to be ready (up to 60s)..."
  WAIT=0
  until docker info > /dev/null 2>&1; do
    sleep 2
    WAIT=$((WAIT + 2))
    printf "  · %ds elapsed\r" "$WAIT"
    if [ "$WAIT" -ge 60 ]; then
      echo ""
      echo "  ✗ Docker did not start within 60s."
      echo ""
      echo "  Please start Docker Desktop manually, then run:"
      echo "    pnpm dev:all"
      echo ""
      echo "  Or use without Docker:"
      echo "    pnpm dev:web        → Web console only (port 3000)"
      echo "    beancli --mock      → TUI mock mode"
      echo ""
      exit 1
    fi
  done
  echo ""
  echo "  ✓ Docker is ready."
fi

echo "  Starting Docker infrastructure..."
docker compose up -d

echo ""
bash scripts/wait-for-services.sh

echo ""
echo "  Running database migrations..."
pnpm db:migrate

# ── beanllm AI Sidecar (FastAPI + SSE Streaming) ─────────────
BEANLLM_PATH="${BEANLLM_PATH:-../beanllm}"
SIDECAR_SCRIPT="$SCRIPT_DIR/ai-sidecar.py"

if [ -f "$SIDECAR_SCRIPT" ] && command -v python3 &> /dev/null; then
  # Ensure FastAPI deps are available
  if ! python3 -c "import fastapi, uvicorn" 2>/dev/null; then
    echo "  Installing FastAPI deps for AI sidecar..."
    python3 -m pip install fastapi uvicorn --quiet 2>/dev/null || true
  fi

  echo ""
  echo "  Starting beanllm AI sidecar (FastAPI) on :${SIDECAR_PORT}..."
  BEANLLM_PATH="$BEANLLM_PATH" BEANLLM_PORT="$SIDECAR_PORT" \
    python3 "$SIDECAR_SCRIPT" &
  SIDECAR_PID=$!
  echo "   Sidecar PID: $SIDECAR_PID"
else
  echo ""
  echo "  AI sidecar skipped (python3 or ai-sidecar.py not found)"
  SIDECAR_PID=""
fi

echo ""
echo "  Starting application services..."
echo "   API Server  -> http://localhost:${APP_PORT}"
echo "   Web Console -> http://localhost:${WEB_PORT}"
echo "   AI Sidecar  -> http://localhost:${SIDECAR_PORT}"
echo "   Kafka UI    -> http://localhost:${KAFKA_UI_PORT:-18080}"
echo "   WebSocket   -> ws://localhost:${APP_PORT}/ws"
echo ""
echo "   TUI (CLI)   -> run in a separate terminal: pnpm dev:cli"
echo ""
echo "   Press Ctrl+C to stop all services"
echo ""

# ── Ctrl+C 시 전체 프로세스 트리 종료 ────────────────────────────
_cleanup() {
  echo ""
  echo "  Stopping all services..."
  if [ -n "${SIDECAR_PID:-}" ]; then
    kill "$SIDECAR_PID" 2>/dev/null || true
  fi
  if [ -n "${TURBO_PID:-}" ]; then
    kill -- -"$TURBO_PID" 2>/dev/null || true
    sleep 1
    for PORT in "$APP_PORT" "$WEB_PORT"; do
      PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
      if [ -n "$PIDS" ]; then
        echo "$PIDS" | xargs kill -9 2>/dev/null || true
      fi
    done
  fi
  exit 0
}
trap _cleanup INT TERM

set -m
./node_modules/.bin/turbo run dev --filter='./apps/*' --filter='!@tfsdc/cli' &
TURBO_PID=$!
wait $TURBO_PID
