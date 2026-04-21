#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Interactive Flipped Learning - 부하 테스트 실행 스크립트
#
# 사용법:
#   ./run.sh                     # Web UI 모드 (http://localhost:8089)
#   ./run.sh --headless          # Headless 모드 (CLI 출력)
#   ./run.sh --docker            # Docker Compose (master + 4 workers)
#   ./run.sh --docker --headless # Docker headless
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 기본값
TARGET_HOST="${TARGET_HOST:-http://localhost:8000}"
USERS="${USERS:-100}"
SPAWN_RATE="${SPAWN_RATE:-10}"
RUN_TIME="${RUN_TIME:-5m}"
HEADLESS=false
USE_DOCKER=false

# 인자 파싱
for arg in "$@"; do
  case "$arg" in
    --headless) HEADLESS=true ;;
    --docker)   USE_DOCKER=true ;;
    --users=*)  USERS="${arg#*=}" ;;
    --rate=*)   SPAWN_RATE="${arg#*=}" ;;
    --time=*)   RUN_TIME="${arg#*=}" ;;
    --host=*)   TARGET_HOST="${arg#*=}" ;;
    *)          echo "Unknown option: $arg"; exit 1 ;;
  esac
done

export TARGET_HOST

echo "============================================"
echo " Locust 부하 테스트"
echo "--------------------------------------------"
echo " Target:     ${TARGET_HOST}"
echo " Users:      ${USERS}"
echo " Spawn rate: ${SPAWN_RATE}/s"
echo " Duration:   ${RUN_TIME}"
echo " Mode:       $(${HEADLESS} && echo 'Headless' || echo 'Web UI')"
echo " Runner:     $(${USE_DOCKER} && echo 'Docker (master + 4 workers)' || echo 'Local')"
echo "============================================"

# ── Docker 모드 ──────────────────────────────────────────────────────────────
if $USE_DOCKER; then
  cd "$SCRIPT_DIR"

  if $HEADLESS; then
    docker compose -f docker-compose.loadtest.yml up -d
    sleep 3
    # master 컨테이너에 headless 실행 명령 전달
    docker exec locust-master locust \
      -f /mnt/locust/locustfile.py \
      --master \
      --headless \
      --users "$USERS" \
      --spawn-rate "$SPAWN_RATE" \
      --run-time "$RUN_TIME" \
      --host "$TARGET_HOST" \
      --csv /mnt/locust/results \
      --html /mnt/locust/report.html
    docker compose -f docker-compose.loadtest.yml down
  else
    echo "Web UI: http://localhost:8089"
    docker compose -f docker-compose.loadtest.yml up --scale locust-worker=4
  fi
  exit 0
fi

# ── 로컬 모드 ────────────────────────────────────────────────────────────────
cd "$SCRIPT_DIR"

if ! command -v locust &>/dev/null; then
  echo "locust 가 설치되어 있지 않습니다. pip install -r requirements.txt 실행 후 재시도하세요."
  exit 1
fi

COMMON_ARGS=(
  -f locustfile.py
  --host "$TARGET_HOST"
)

if $HEADLESS; then
  locust "${COMMON_ARGS[@]}" \
    --headless \
    --users "$USERS" \
    --spawn-rate "$SPAWN_RATE" \
    --run-time "$RUN_TIME" \
    --csv results \
    --html report.html
else
  echo "Web UI: http://localhost:8089"
  locust "${COMMON_ARGS[@]}"
fi
