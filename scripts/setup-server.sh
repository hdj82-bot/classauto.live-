#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# IFL Platform — 서버 초기 설정 스크립트 (Ubuntu 22.04/24.04)
#
# 사용법 (root 또는 sudo 권한):
#   curl -sSL https://raw.githubusercontent.com/hdj82-bot/Interactive-flipped-learning/main/scripts/setup-server.sh | bash
#
# 또는 수동:
#   chmod +x scripts/setup-server.sh
#   sudo ./scripts/setup-server.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[SETUP]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# 루트 권한 확인
if [ "$(id -u)" -ne 0 ]; then
    error "root 권한이 필요합니다. sudo로 실행하세요."
fi

INSTALL_DIR="/opt/ifl-platform"
REPO_URL="https://github.com/hdj82-bot/Interactive-flipped-learning.git"

log "=== IFL Platform 서버 초기 설정 ==="
log "설치 경로: $INSTALL_DIR"

# ── 1. 시스템 패키지 업데이트 ─────────────────────────────────────────────
log "1/7 시스템 패키지 업데이트..."
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. 필수 패키지 설치 ──────────────────────────────────────────────────
log "2/7 필수 패키지 설치..."
apt-get install -y -qq \
    curl wget git ufw fail2ban \
    apt-transport-https ca-certificates gnupg lsb-release

# ── 3. Docker 설치 ───────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
    log "3/7 Docker 이미 설치됨: $(docker --version)"
else
    log "3/7 Docker 설치 중..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log "Docker 설치 완료: $(docker --version)"
fi

# Docker Compose 확인 (v2는 docker compose로 내장)
if ! docker compose version &>/dev/null; then
    error "Docker Compose v2가 필요합니다. Docker를 최신 버전으로 업데이트하세요."
fi
log "Docker Compose: $(docker compose version --short)"

# ── 4. 방화벽 설정 ───────────────────────────────────────────────────────
log "4/7 방화벽(UFW) 설정..."
ufw --force reset >/dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log "UFW 활성화 완료 (SSH, HTTP, HTTPS 허용)"

# ── 5. fail2ban 설정 ─────────────────────────────────────────────────────
log "5/7 fail2ban 설정..."
systemctl enable fail2ban
systemctl start fail2ban

# ── 6. 프로젝트 클론 ─────────────────────────────────────────────────────
log "6/7 프로젝트 클론..."
if [ -d "$INSTALL_DIR" ]; then
    warn "$INSTALL_DIR 이미 존재. git pull 실행..."
    cd "$INSTALL_DIR"
    git pull origin main
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# ── 7. 환경변수 파일 생성 ────────────────────────────────────────────────
log "7/7 환경변수 파일 설정..."
if [ ! -f "$INSTALL_DIR/.env" ]; then
    cp "$INSTALL_DIR/.env.production" "$INSTALL_DIR/.env"
    log ".env 파일이 생성되었습니다."
    warn ""
    warn "┌─────────────────────────────────────────────────────────────┐"
    warn "│  중요: .env 파일의 CHANGE_ME 값을 모두 수정하세요!          │"
    warn "│                                                             │"
    warn "│  vi $INSTALL_DIR/.env                                       │"
    warn "│                                                             │"
    warn "│  필수 설정:                                                  │"
    warn "│    - POSTGRES_PASSWORD (DB 비밀번호)                        │"
    warn "│    - JWT_SECRET_KEY (openssl rand -hex 32 로 생성)          │"
    warn "│    - GOOGLE_OAUTH_CLIENT_ID/SECRET                          │"
    warn "│    - ANTHROPIC_API_KEY                                      │"
    warn "│    - AWS_ACCESS_KEY_ID/SECRET                                │"
    warn "│    - S3_BUCKET                                               │"
    warn "│    - HEYGEN_API_KEY                                          │"
    warn "│    - ELEVENLABS_API_KEY                                      │"
    warn "│    - STRIPE_SECRET_KEY/WEBHOOK_SECRET                        │"
    warn "│    - DOMAIN (실제 도메인)                                    │"
    warn "│                                                             │"
    warn "│  설정 완료 후:                                              │"
    warn "│    DOMAIN=your-domain.com EMAIL=you@email.com \\             │"
    warn "│      ./scripts/deploy.sh init                               │"
    warn "└─────────────────────────────────────────────────────────────┘"
    warn ""
else
    log ".env 파일이 이미 존재합니다."
fi

# 스크립트 실행 권한
chmod +x "$INSTALL_DIR/scripts/"*.sh

log ""
log "=== 서버 설정 완료 ==="
log ""
log "다음 단계:"
log "  1. .env 파일 편집:  vi $INSTALL_DIR/.env"
log "  2. DNS 설정:  A 레코드 → 이 서버 IP ($(curl -s ifconfig.me 2>/dev/null || echo '확인불가'))"
log "  3. 배포 실행:  cd $INSTALL_DIR && DOMAIN=your-domain.com EMAIL=admin@your-domain.com ./scripts/deploy.sh init"
