#!/usr/bin/env bash
# dev-quit.sh — 모든 BeanCLI 개발 프로세스 완전 종료

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# .env에서 포트 읽기 (없으면 기본값)
if [ -f .env ]; then
  set -a; source .env; set +a
fi
APP_PORT="${APP_PORT:-3100}"
WEB_PORT=3000
SIDECAR_PORT="${BEANLLM_PORT:-3200}"

echo "  Stopping BeanCLI services..."
echo ""

# ── 1. 포트 점유 프로세스 종료 ────────────────────────────────
PORTS=("$APP_PORT" "$WEB_PORT" "$SIDECAR_PORT")
PORT_NAMES=("API" "Web" "Sidecar")

for i in "${!PORTS[@]}"; do
  PORT="${PORTS[$i]}"
  NAME="${PORT_NAMES[$i]}"
  PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "   ✓ Killing ${NAME} (port ${PORT}) — PID: $PIDS"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
  else
    echo "   · ${NAME} (port ${PORT}) — not running"
  fi
done

# ── 2. turbo / tsx / node 고아 프로세스 (beanCli 경로 포함) ──
echo ""
ORPHANS=$(pgrep -f "beanCli|tfsdc|turbo run dev|tsx.*index-ink" 2>/dev/null || true)
if [ -n "$ORPHANS" ]; then
  echo "   ✓ Killing orphan processes: $ORPHANS"
  echo "$ORPHANS" | xargs kill -9 2>/dev/null || true
else
  echo "   · No orphan node/turbo processes found"
fi

# ── 3. Docker 컨테이너 중단 ────────────────────────────────────
echo ""
if docker info > /dev/null 2>&1; then
  # 이 프로젝트 compose 파일의 컨테이너만 내림
  if docker compose ps -q 2>/dev/null | grep -q .; then
    echo "   ✓ Stopping Docker containers..."
    docker compose down
  else
    echo "   · Docker containers — already stopped"
  fi
else
  echo "   · Docker daemon not running — skipping"
fi

echo ""
echo "  ✓ All BeanCLI services stopped."
echo ""
