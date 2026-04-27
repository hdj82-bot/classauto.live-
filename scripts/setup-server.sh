#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# IFL Platform — 서버 초기 설정 스크립트 (Ubuntu 22.04/24.04)
#
# 1회성. 깨끗한 Ubuntu 머신을 받은 직후 root/sudo 로 한 번만 실행한다.
# 이후 배포/업데이트는 ./scripts/deploy.sh 를 사용.
#
# 사용법:
#   sudo ./scripts/setup-server.sh
#
# 환경변수 오버라이드(선택):
#   INSTALL_DIR=/opt/ifl-platform     # 설치 경로
#   REPO_URL=https://github.com/...   # git clone 대상 (기본: 이 스크립트가 속한 repo 추정)
#   TIMEZONE=Asia/Seoul               # 시스템 타임존 (기본: UTC 유지)
#   SWAP_SIZE_GB=2                    # swap 파일 크기. 0 이면 swap 생성 생략
#   GHCR_USER=hdj82-bot               # GHCR 로그인 시 사용자명
#   GHCR_TOKEN=ghp_xxx                # GHCR Personal Access Token (read:packages)
#                                       비어 있으면 docker login 단계 스킵
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()   { echo -e "${GREEN}[SETUP]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# 루트 권한 확인
if [ "$(id -u)" -ne 0 ]; then
    error "root 권한이 필요합니다. sudo 로 실행하세요."
fi

INSTALL_DIR="${INSTALL_DIR:-/opt/ifl-platform}"
REPO_URL="${REPO_URL:-https://github.com/hdj82-bot/classauto.live-.git}"
TIMEZONE="${TIMEZONE:-}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"
GHCR_USER="${GHCR_USER:-}"
GHCR_TOKEN="${GHCR_TOKEN:-}"

TOTAL_STEPS=10

log "=== IFL Platform 서버 초기 설정 ==="
log "설치 경로: $INSTALL_DIR"
log "Repo URL : $REPO_URL"

# ── 1. 시스템 패키지 업데이트 ─────────────────────────────────────────────
log "1/${TOTAL_STEPS} 시스템 패키지 업데이트..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. 필수 패키지 설치 ──────────────────────────────────────────────────
log "2/${TOTAL_STEPS} 필수 패키지 설치..."
apt-get install -y -qq \
    curl wget git ufw fail2ban unattended-upgrades \
    apt-transport-https ca-certificates gnupg lsb-release \
    chrony jq openssl ssl-cert tzdata

# 타임존 (옵션)
if [ -n "$TIMEZONE" ]; then
    log "타임존 설정: $TIMEZONE"
    timedatectl set-timezone "$TIMEZONE" || warn "타임존 변경 실패 (무시하고 계속)"
fi

# 시간 동기화 (Let's Encrypt / JWT exp / S3 signature 모두 시각 정확도 의존)
log "시간 동기화 활성화 (chrony)..."
systemctl enable chrony >/dev/null 2>&1 || true
systemctl start chrony  >/dev/null 2>&1 || true
timedatectl set-ntp true 2>/dev/null || true

# ── 3. Swap 생성 ─────────────────────────────────────────────────────────
log "3/${TOTAL_STEPS} Swap 설정..."
if [ "$SWAP_SIZE_GB" -gt 0 ]; then
    if swapon --show=NAME --noheadings | grep -q .; then
        log "이미 swap 활성화됨 — 생략"
        swapon --show
    else
        SWAP_FILE="/swapfile"
        log "${SWAP_SIZE_GB}GB swap 파일 생성: $SWAP_FILE"
        fallocate -l "${SWAP_SIZE_GB}G" "$SWAP_FILE" || \
            dd if=/dev/zero of="$SWAP_FILE" bs=1M count=$((SWAP_SIZE_GB * 1024))
        chmod 600 "$SWAP_FILE"
        mkswap "$SWAP_FILE" >/dev/null
        swapon "$SWAP_FILE"
        if ! grep -q "^${SWAP_FILE}" /etc/fstab; then
            echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
        fi
        # Redis 가 fork 시 메모리 부족으로 실패하지 않도록 권장 설정
        sysctl -w vm.overcommit_memory=1 >/dev/null
        if ! grep -q "^vm.overcommit_memory" /etc/sysctl.conf; then
            echo "vm.overcommit_memory=1" >> /etc/sysctl.conf
        fi
        log "Swap 활성화 완료"
    fi
else
    info "SWAP_SIZE_GB=0 — swap 생성 생략"
fi

# ── 4. Docker 설치 ───────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
    log "4/${TOTAL_STEPS} Docker 이미 설치됨: $(docker --version)"
else
    log "4/${TOTAL_STEPS} Docker 설치 중..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log "Docker 설치 완료: $(docker --version)"
fi

# Docker Compose v2 확인 (compose 플러그인은 docker-ce 와 함께 설치됨)
if ! docker compose version &>/dev/null; then
    error "Docker Compose v2 가 필요합니다. 'docker compose version' 이 동작해야 합니다."
fi
log "Docker Compose: $(docker compose version --short)"

# 비root 사용자에게 docker 그룹 권한 (있을 경우)
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    if ! id -nG "$SUDO_USER" | grep -qw docker; then
        usermod -aG docker "$SUDO_USER"
        warn "$SUDO_USER 를 docker 그룹에 추가했습니다. 다시 로그인해야 적용됩니다."
    fi
fi

# ── 5. 방화벽 설정 ───────────────────────────────────────────────────────
log "5/${TOTAL_STEPS} 방화벽(UFW) 설정..."
# 주의: Docker 는 기본적으로 UFW 를 우회한다. docker-compose.prod.yml 에서
# backend/frontend 는 ports 매핑 없이 nginx 컨테이너 뒤에만 노출된다.
# nginx 만 80/443 을 매핑하므로 그 외 포트는 UFW 로 차단 가능.
ufw --force reset >/dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log "UFW 활성화 완료 (SSH, HTTP, HTTPS 허용)"

# ── 6. fail2ban 설정 (sshd jail) ─────────────────────────────────────────
log "6/${TOTAL_STEPS} fail2ban 설정..."
JAIL_LOCAL="/etc/fail2ban/jail.local"
if [ ! -f "$JAIL_LOCAL" ]; then
    cat > "$JAIL_LOCAL" <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
backend = systemd
EOF
    log "fail2ban jail.local 생성 (sshd 활성화)"
fi
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban

# ── 7. 자동 보안 업데이트 ────────────────────────────────────────────────
log "7/${TOTAL_STEPS} unattended-upgrades 활성화..."
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
log "자동 보안 업데이트 활성화"

# ── 8. 프로젝트 클론 ─────────────────────────────────────────────────────
log "8/${TOTAL_STEPS} 프로젝트 클론..."
if [ -d "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR/.git" ]; then
    warn "$INSTALL_DIR 이미 존재 → git pull"
    git -C "$INSTALL_DIR" pull --ff-only origin main
elif [ -d "$INSTALL_DIR" ]; then
    error "$INSTALL_DIR 이 존재하지만 git repo 가 아닙니다. 수동 정리 후 다시 실행하세요."
else
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

# 스크립트 실행 권한
chmod +x "$INSTALL_DIR/scripts/"*.sh

# ── 9. GHCR 로그인 (선택) ────────────────────────────────────────────────
log "9/${TOTAL_STEPS} GHCR 로그인 확인..."
if [ -n "$GHCR_TOKEN" ] && [ -n "$GHCR_USER" ]; then
    echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
    log "GHCR 로그인 완료 ($GHCR_USER)"
elif [ -f /root/.docker/config.json ] && grep -q "ghcr.io" /root/.docker/config.json; then
    log "GHCR 자격증명이 이미 등록되어 있습니다."
else
    warn "GHCR 자격증명 없음 (private 패키지일 경우 pull 실패)."
    warn "  GHCR 패키지가 private 이라면 다음을 1회 실행:"
    warn "    echo \"\$GHCR_TOKEN\" | docker login ghcr.io -u <github-user> --password-stdin"
    warn "  (PAT 권한: read:packages)"
fi

# ── 10. 환경변수 파일 준비 ───────────────────────────────────────────────
log "10/${TOTAL_STEPS} 환경변수 파일 설정..."
if [ ! -f "$INSTALL_DIR/.env" ]; then
    cp "$INSTALL_DIR/.env.production" "$INSTALL_DIR/.env"
    log ".env 파일을 .env.production 템플릿으로 생성했습니다."
else
    log ".env 파일이 이미 존재합니다 — 덮어쓰지 않음."
fi

PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo '확인불가')

log ""
log "=========================================================================="
log "  서버 셋업 완료"
log "=========================================================================="
log ""
log "다음 단계 (이 순서대로):"
log ""
log "  ${CYAN}1.${NC} DNS A 레코드 등록 (도메인 → ${PUBLIC_IP})"
log "       예) classauto.live  → ${PUBLIC_IP}"
log "           api.classauto.live → ${PUBLIC_IP}"
log ""
log "  ${CYAN}2.${NC} GHCR 패키지가 private 이라면 docker login 1회"
log "       echo \"\$GHCR_TOKEN\" | docker login ghcr.io -u <user> --password-stdin"
log ""
log "  ${CYAN}3.${NC} .env 편집 — CHANGE_ME 모두 실제 값으로 교체"
log "       vi $INSTALL_DIR/.env"
log ""
log "  ${CYAN}4.${NC} 환경변수 검증 (필수 — 형식 오류까지 잡아냄)"
log "       cd $INSTALL_DIR && ./scripts/validate-env.sh --strict"
log ""
log "  ${CYAN}5.${NC} 최초 배포 (SSL 인증서 발급 포함)"
log "       cd $INSTALL_DIR && \\"
log "         DOMAIN=your-domain.com EMAIL=admin@your-domain.com \\"
log "         ./scripts/deploy.sh init"
log ""
log "  ${CYAN}6.${NC} 배포 직후 스모크 테스트"
log "       ./scripts/smoke-test.sh your-domain.com"
log ""
