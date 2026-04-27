#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# IFL Platform — 프로덕션 배포 스크립트
#
# 사용법:
#   # 최초 배포
#   DOMAIN=ifl-platform.com EMAIL=admin@ifl-platform.com ./scripts/deploy.sh init
#
#   # 업데이트 배포
#   ./scripts/deploy.sh update
#
#   # 상태 확인
#   ./scripts/deploy.sh status
#
#   # 롤백
#   ./scripts/deploy.sh rollback
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── SSL 인증서 만료 체크 ──────────────────────────────────────────────────
check_ssl_expiry() {
    local domain="${DOMAIN:-}"
    if [ -z "$domain" ] && [ -f .env ]; then
        domain=$(grep "^DOMAIN=" .env | cut -d'=' -f2- || echo "")
    fi
    if [ -z "$domain" ]; then
        return 0
    fi

    local cert_path="./certbot/conf/live/$domain/fullchain.pem"
    if [ ! -f "$cert_path" ]; then
        warn "SSL 인증서 파일을 찾을 수 없습니다: $cert_path"
        return 0
    fi

    local expiry_date
    expiry_date=$(openssl x509 -enddate -noout -in "$cert_path" 2>/dev/null | cut -d= -f2)
    if [ -z "$expiry_date" ]; then
        warn "SSL 인증서 만료일을 확인할 수 없습니다"
        return 0
    fi

    local expiry_epoch
    expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || date -jf "%b %d %T %Y %Z" "$expiry_date" +%s 2>/dev/null || echo "0")
    local now_epoch
    now_epoch=$(date +%s)
    local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

    if [ "$days_left" -le 0 ]; then
        error "⚠️  SSL 인증서가 만료되었습니다! 즉시 갱신하세요:"
        error "   docker compose -f docker-compose.prod.yml run --rm certbot renew"
        exit 1
    elif [ "$days_left" -le 7 ]; then
        warn "⚠️  SSL 인증서가 ${days_left}일 후 만료됩니다. 갱신을 확인하세요."
    elif [ "$days_left" -le 30 ]; then
        log "SSL 인증서 만료까지 ${days_left}일 남음"
    else
        log "SSL 인증서 유효 (만료까지 ${days_left}일)"
    fi
}

# ── 환경변수 검증 ─────────────────────────────────────────────────────────
validate_env() {
    log "환경변수 검증 중..."
    if [ ! -f .env ]; then
        error ".env 파일이 없습니다. .env.production을 복사하세요:"
        error "  cp .env.production .env && vi .env"
        exit 1
    fi

    local required_vars=(
        "DATABASE_URL" "JWT_SECRET_KEY" "POSTGRES_PASSWORD"
        "GOOGLE_OAUTH_CLIENT_ID" "GOOGLE_OAUTH_CLIENT_SECRET"
        "ANTHROPIC_API_KEY" "AWS_ACCESS_KEY_ID" "AWS_SECRET_ACCESS_KEY"
        "S3_BUCKET" "HEYGEN_API_KEY" "ELEVENLABS_API_KEY"
        "STRIPE_SECRET_KEY" "STRIPE_WEBHOOK_SECRET"
    )

    local missing=()
    for var in "${required_vars[@]}"; do
        val=$(grep "^${var}=" .env | cut -d'=' -f2-)
        if [ -z "$val" ] || [[ "$val" == *"CHANGE_ME"* ]]; then
            missing+=("$var")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        error "다음 환경변수가 설정되지 않았습니다:"
        for v in "${missing[@]}"; do
            error "  - $v"
        done
        exit 1
    fi

    log "환경변수 검증 완료 ✓"
}

# ── 최초 배포 ─────────────────────────────────────────────────────────────
cmd_init() {
    log "=== IFL Platform 최초 배포 ==="

    validate_env

    DOMAIN=${DOMAIN:?'DOMAIN 환경변수를 설정하세요'}
    EMAIL=${EMAIL:?'EMAIL 환경변수를 설정하세요'}

    # 1. Docker 이미지 빌드
    log "Docker 이미지 빌드 중..."
    docker compose -f "$COMPOSE_FILE" build

    # 2. DB + Redis 먼저 시작
    log "DB, Redis 시작 중..."
    docker compose -f "$COMPOSE_FILE" up -d db redis
    sleep 10

    # 3. DB 마이그레이션
    log "DB 마이그레이션 실행 중..."
    docker compose -f "$COMPOSE_FILE" run --rm backend alembic upgrade head

    # 4. SSL 인증서 발급
    log "SSL 인증서 발급 중..."
    DOMAIN="$DOMAIN" EMAIL="$EMAIL" ./scripts/init-ssl.sh

    # 5. 전체 서비스 시작
    log "전체 서비스 시작 중..."
    docker compose -f "$COMPOSE_FILE" up -d

    # 6. SSL 인증서 만료 체크
    check_ssl_expiry

    # 7. 헬스체크
    sleep 15
    cmd_status

    log "=== 배포 완료 ==="
    log "프론트엔드: https://$DOMAIN"
    log "백엔드 API: https://api.$DOMAIN"
    log "Swagger UI: https://api.$DOMAIN/docs"
}

# ── 헬스체크 대기 ─────────────────────────────────────────────────────────
# 컨테이너가 healthy 가 될 때까지 polling. 인자: <container_id> [timeout_sec=120]
wait_healthy() {
    local cid="$1"
    local timeout="${2:-120}"
    local elapsed=0
    local status
    while [ "$elapsed" -lt "$timeout" ]; do
        status=$(docker inspect --format='{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "missing")
        case "$status" in
            healthy)   return 0 ;;
            unhealthy) error "컨테이너 unhealthy ($cid)"; return 1 ;;
            missing)   error "컨테이너 사라짐 ($cid)"; return 1 ;;
        esac
        sleep 2
        elapsed=$((elapsed + 2))
    done
    error "컨테이너 healthy 도달 실패 ${timeout}s 초과 ($cid status=$status)"
    return 1
}

# ── 스케일 가능한 서비스 rolling restart ────────────────────────────────────
# 인자: <service_name> (compose service)
# 동작: 새 컨테이너 1개 추가 → healthy 대기 → 기존 컨테이너 graceful stop
rolling_restart_scaled() {
    local service="$1"
    log "${service}: rolling restart 시작..."

    local old_id
    old_id=$(docker compose -f "$COMPOSE_FILE" ps -q "$service" | head -n 1)
    if [ -z "$old_id" ]; then
        warn "${service}: 기존 컨테이너 없음 — 일반 up 으로 시작."
        docker compose -f "$COMPOSE_FILE" up -d --no-deps "$service"
        return 0
    fi

    # 새 컨테이너 추가 (기존은 그대로 유지)
    log "${service}: 새 컨테이너 1대 추가 (scale=2, --no-recreate 로 기존 보존)..."
    docker compose -f "$COMPOSE_FILE" up -d --no-deps --no-recreate \
        --scale "${service}=2" "$service"

    # 새 컨테이너 ID = 현재 ps 결과 중 old_id 가 아닌 것
    local new_id
    new_id=$(docker compose -f "$COMPOSE_FILE" ps -q "$service" | grep -v "^${old_id}$" | head -n 1)
    if [ -z "$new_id" ]; then
        error "${service}: 새 컨테이너를 찾지 못했습니다."
        return 1
    fi

    log "${service}: 새 컨테이너(${new_id:0:12}) healthy 대기..."
    if ! wait_healthy "$new_id" 120; then
        error "${service}: 새 컨테이너가 healthy 도달 실패 → 회수하고 기존 유지."
        docker stop -t 10 "$new_id" >/dev/null 2>&1 || true
        docker rm -f "$new_id"  >/dev/null 2>&1 || true
        return 1
    fi

    # 기존 컨테이너 graceful stop (compose 의 stop_grace_period 만큼 SIGTERM 대기)
    log "${service}: 기존 컨테이너(${old_id:0:12}) graceful stop..."
    docker stop -t 35 "$old_id" >/dev/null
    docker rm "$old_id"        >/dev/null
    log "${service}: rolling 완료 — 신규 ${new_id:0:12} 단독 운영."
}

# ── 업데이트 배포 (무중단 rolling) ─────────────────────────────────────────
cmd_update() {
    log "=== IFL Platform 무중단 업데이트 배포 ==="

    validate_env
    check_ssl_expiry

    # 롤백용으로 현재 backend 이미지 SHA 저장
    local old_backend_id
    old_backend_id=$(docker compose -f "$COMPOSE_FILE" ps -q backend | head -n 1)
    if [ -n "$old_backend_id" ]; then
        docker inspect --format='{{.Image}}' "$old_backend_id" > /tmp/ifl_rollback_image 2>/dev/null || true
    fi

    # 1. 최신 코드 pull (compose 파일 / 스크립트 자체 갱신 반영)
    log "최신 코드 Pull..."
    git pull origin main

    # 2. CI 가 GHCR 로 push 한 새 이미지 pull (서비스는 아직 교체 안 함)
    log "GHCR 에서 최신 이미지 Pull..."
    docker compose -f "$COMPOSE_FILE" pull backend worker beat frontend

    # 3. 마이그레이션 직전 DB 백업
    log "마이그레이션 전 DB 백업 생성 중..."
    if ! "$SCRIPT_DIR/backup.sh" backup; then
        error "DB 백업 실패 — 마이그레이션을 중단합니다."
        error "backup.sh 를 수동 점검한 뒤 다시 시도하세요."
        exit 1
    fi

    # 4. DB 마이그레이션 (one-shot 컨테이너에서 새 이미지로)
    log "DB 마이그레이션 확인 중..."
    docker compose -f "$COMPOSE_FILE" run --rm backend alembic upgrade head

    # 5. backend rolling (새 인스턴스 healthy 후 기존 제거)
    if ! rolling_restart_scaled backend; then
        error "backend rolling 실패 — 배포 중단."
        exit 1
    fi

    # 6. frontend rolling
    if ! rolling_restart_scaled frontend; then
        error "frontend rolling 실패 — 배포 중단."
        exit 1
    fi

    # 7. worker graceful 재시작
    #    Celery acks_late=True 가정. SIGTERM 후 stop_grace_period(60s) 동안
    #    진행 중 태스크를 ack 하고 종료한다. 만약 시간 내 ack 되지 못하더라도
    #    메시지가 broker 에 남아 있어 새 worker 가 재처리한다.
    log "worker graceful 재시작 (SIGTERM 후 최대 60초 대기)..."
    docker compose -f "$COMPOSE_FILE" stop -t 60 worker
    docker compose -f "$COMPOSE_FILE" up -d --no-deps worker

    # 8. beat 단순 재시작 (단일 인스턴스, 동시 실행 금지)
    log "beat 재시작..."
    docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate beat

    # 9. nginx reload (upstream 컨테이너 IP 갱신)
    docker compose -f "$COMPOSE_FILE" exec nginx nginx -s reload 2>/dev/null || true

    # 10. 헬스체크
    sleep 5
    cmd_status

    log "=== 업데이트 완료 ==="
}

# ── 롤백 ──────────────────────────────────────────────────────────────────
cmd_rollback() {
    log "=== 롤백 실행 ==="
    warn "직전 커밋으로 롤백합니다."

    git checkout HEAD~1

    docker compose -f "$COMPOSE_FILE" build
    docker compose -f "$COMPOSE_FILE" up -d --no-deps backend worker beat frontend
    docker compose -f "$COMPOSE_FILE" exec nginx nginx -s reload 2>/dev/null || true

    sleep 10
    cmd_status

    log "=== 롤백 완료 ==="
    warn ""
    warn "┌─────────────────────────────────────────────────────────────┐"
    warn "│  주의: DB 스키마는 자동으로 되돌려지지 않습니다.            │"
    warn "│                                                             │"
    warn "│  직전 배포에서 파괴적 마이그레이션이 실행되었다면 코드와    │"
    warn "│  스키마가 어긋날 수 있습니다. 최신 백업에서 복원하려면:     │"
    warn "│                                                             │"
    warn "│    ./scripts/backup.sh list                                 │"
    warn "│    ./scripts/backup.sh restore <파일>                       │"
    warn "│                                                             │"
    warn "│  또는 alembic downgrade 로 한 단계 되돌리세요:              │"
    warn "│    docker compose -f $COMPOSE_FILE run --rm \\              │"
    warn "│      backend alembic downgrade -1                           │"
    warn "└─────────────────────────────────────────────────────────────┘"
    warn ""
    warn "문제가 해결되면 git checkout main 으로 복귀하세요."
}

# ── 상태 확인 ─────────────────────────────────────────────────────────────
cmd_status() {
    log "=== 서비스 상태 확인 ==="

    echo ""
    docker compose -f "$COMPOSE_FILE" ps
    echo ""

    # 헬스체크
    local health_url="http://localhost:8000/health"
    if curl -sf "$health_url" > /dev/null 2>&1; then
        local health=$(curl -sf "$health_url")
        log "헬스체크: $health"
    else
        warn "백엔드 헬스체크 실패 (아직 시작 중일 수 있습니다)"
    fi
}

# ── 로그 조회 ─────────────────────────────────────────────────────────────
cmd_logs() {
    local service="${1:-}"
    if [ -n "$service" ]; then
        docker compose -f "$COMPOSE_FILE" logs -f --tail=100 "$service"
    else
        docker compose -f "$COMPOSE_FILE" logs -f --tail=50
    fi
}

# ── 메인 ──────────────────────────────────────────────────────────────────
case "${1:-help}" in
    init)     cmd_init ;;
    update)   cmd_update ;;
    rollback) cmd_rollback ;;
    status)   cmd_status ;;
    logs)     cmd_logs "${2:-}" ;;
    help|*)
        echo "사용법: $0 {init|update|rollback|status|logs [service]}"
        echo ""
        echo "  init      최초 배포 (SSL 포함)"
        echo "  update    업데이트 배포"
        echo "  rollback  직전 버전으로 롤백"
        echo "  status    서비스 상태 확인"
        echo "  logs      로그 조회 (예: $0 logs backend)"
        ;;
esac
