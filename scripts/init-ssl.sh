#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# IFL Platform — Let's Encrypt SSL 인증서 발급 + 자동 갱신 설정
#
# 사용법:
#   DOMAIN=ifl-platform.com EMAIL=admin@ifl-platform.com ./scripts/init-ssl.sh
#
# 옵션:
#   SLACK_WEBHOOK_URL=https://hooks.slack.com/... (갱신 실패 알림)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

DOMAIN=${DOMAIN:?'DOMAIN 환경변수를 설정하세요 (예: ifl-platform.com)'}
EMAIL=${EMAIL:?'EMAIL 환경변수를 설정하세요 (예: admin@ifl-platform.com)'}
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[SSL]${NC} $*"; }
warn()  { echo -e "${YELLOW}[SSL]${NC} $*"; }
error() { echo -e "${RED}[SSL]${NC} $*" >&2; }

# ── 알림 함수 ────────────────────────────────────────────────────────────────
notify_failure() {
    local message="$1"
    error "$message"

    # Slack 웹훅 알림
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -sf -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-type: application/json' \
            -d "{\"text\":\"🚨 [IFL SSL] $message\nDomain: $DOMAIN\nServer: $(hostname)\"}" \
            > /dev/null 2>&1 || warn "Slack 알림 전송 실패"
    fi

    # 이메일 알림 (mail 커맨드 사용 가능한 경우)
    if command -v mail &> /dev/null && [ -n "$EMAIL" ]; then
        echo "$message" | mail -s "[IFL SSL] 인증서 갱신 실패 - $DOMAIN" "$EMAIL" 2>/dev/null || true
    fi
}

# ── 인증서 만료일 확인 ────────────────────────────────────────────────────────
check_cert_expiry() {
    local cert_path="./certbot/conf/live/$DOMAIN/fullchain.pem"
    if [ -f "$cert_path" ]; then
        local expiry_date
        expiry_date=$(openssl x509 -enddate -noout -in "$cert_path" 2>/dev/null | cut -d= -f2)
        local expiry_epoch
        expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || date -jf "%b %d %T %Y %Z" "$expiry_date" +%s 2>/dev/null)
        local now_epoch
        now_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
        echo "$days_left"
    else
        echo "-1"
    fi
}

# ── certbot 옵션 파일 다운로드 ────────────────────────────────────────────────
download_certbot_configs() {
    log "certbot 설정 파일 다운로드 중..."
    mkdir -p ./certbot/conf

    if [ ! -f ./certbot/conf/options-ssl-nginx.conf ]; then
        curl -sS https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
            > ./certbot/conf/options-ssl-nginx.conf
    fi

    if [ ! -f ./certbot/conf/ssl-dhparams.pem ]; then
        curl -sS https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem \
            > ./certbot/conf/ssl-dhparams.pem
    fi
}

# ── 더미 인증서 생성 → 실제 발급 ─────────────────────────────────────────────
issue_certificate() {
    log "=== IFL SSL 인증서 발급 ==="
    log "도메인: $DOMAIN, api.$DOMAIN"
    log "이메일: $EMAIL"

    download_certbot_configs

    # 더미 인증서로 nginx 시작
    mkdir -p ./certbot/conf/live/$DOMAIN
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout ./certbot/conf/live/$DOMAIN/privkey.pem \
        -out ./certbot/conf/live/$DOMAIN/fullchain.pem \
        -subj "/CN=localhost" 2>/dev/null

    log "nginx 시작 (더미 인증서)..."
    docker compose -f docker-compose.prod.yml up -d nginx
    sleep 5

    # 더미 인증서 삭제 → 실제 발급
    rm -rf ./certbot/conf/live/$DOMAIN
    rm -rf ./certbot/conf/archive/$DOMAIN
    rm -f ./certbot/conf/renewal/$DOMAIN.conf

    log "Let's Encrypt 인증서 발급 중..."
    if ! docker compose -f docker-compose.prod.yml run --rm certbot certonly \
        --webroot -w /var/www/certbot \
        --email "$EMAIL" --agree-tos --no-eff-email \
        --rsa-key-size 4096 \
        -d "$DOMAIN" -d "api.$DOMAIN"; then
        notify_failure "SSL 인증서 발급 실패"
        exit 1
    fi

    # nginx 재시작
    docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
    log "SSL 인증서 발급 완료 ✓"
}

# ── 자동 갱신 cron 등록 ──────────────────────────────────────────────────────
setup_renewal_cron() {
    log "자동 갱신 cron 등록 중..."

    local renew_script="$PROJECT_DIR/scripts/renew-ssl.sh"

    # 갱신 스크립트 생성
    cat > "$renew_script" << 'RENEW_EOF'
#!/bin/bash
# IFL Platform — SSL 인증서 자동 갱신 스크립트 (cron에서 실행)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# .env에서 SLACK_WEBHOOK_URL 로드
if [ -f .env ]; then
    SLACK_WEBHOOK_URL=$(grep "^NOTIFICATION_WEBHOOK_URL=" .env | cut -d'=' -f2- || echo "")
fi

DOMAIN=$(grep "^DOMAIN=" .env | cut -d'=' -f2- || echo "")
EMAIL=$(grep "^SSL_EMAIL=" .env | cut -d'=' -f2- || echo "")

LOG_FILE="$PROJECT_DIR/logs/ssl-renewal.log"
mkdir -p "$PROJECT_DIR/logs"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

log "SSL 인증서 갱신 시도..."

# certbot renew 실행
if docker compose -f docker-compose.prod.yml run --rm certbot renew --quiet 2>> "$LOG_FILE"; then
    log "인증서 갱신 성공"
    docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload 2>> "$LOG_FILE" || true
else
    log "ERROR: 인증서 갱신 실패"
    # 실패 알림
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        curl -sf -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-type: application/json' \
            -d "{\"text\":\"🚨 [IFL SSL] 인증서 자동 갱신 실패\nDomain: ${DOMAIN:-unknown}\nServer: $(hostname)\nTime: $(date)\"}" \
            > /dev/null 2>&1 || true
    fi
    if command -v mail &> /dev/null && [ -n "${EMAIL:-}" ]; then
        echo "SSL 인증서 자동 갱신에 실패했습니다. 수동으로 확인해주세요." | \
            mail -s "[IFL SSL] 인증서 갱신 실패 - ${DOMAIN:-unknown}" "$EMAIL" 2>/dev/null || true
    fi
    exit 1
fi
RENEW_EOF

    chmod +x "$renew_script"

    # cron 등록 (매일 오전 3시, 오후 3시 — 하루 2회)
    local cron_entry="0 3,15 * * * $renew_script"

    # 기존 IFL SSL cron 제거 후 등록
    (crontab -l 2>/dev/null | grep -v "renew-ssl.sh" || true; echo "$cron_entry") | crontab -

    log "자동 갱신 cron 등록 완료 (매일 03:00, 15:00)"
    log "갱신 스크립트: $renew_script"
}

# ── 메인 ──────────────────────────────────────────────────────────────────────
main() {
    issue_certificate
    setup_renewal_cron

    log ""
    log "=== SSL 설정 완료 ==="
    log "  인증서 위치: ./certbot/conf/live/$DOMAIN/"
    log "  자동 갱신: cron (매일 2회) + docker certbot 서비스 (12시간마다)"
    log "  실패 알림: ${SLACK_WEBHOOK_URL:+Slack 활성화}${SLACK_WEBHOOK_URL:-미설정 (SLACK_WEBHOOK_URL)}"
}

main "$@"
