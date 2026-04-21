#!/bin/sh
# ══════════════════════════════════════════════════════════════════════════════
# IFL Platform — Docker 컨테이너 entrypoint
# 서비스 시작 전 필수 환경변수를 검증합니다.
# ══════════════════════════════════════════════════════════════════════════════
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "[entrypoint] 환경변수 검증 중..."

REQUIRED_VARS="DATABASE_URL JWT_SECRET_KEY POSTGRES_PASSWORD GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET ANTHROPIC_API_KEY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY S3_BUCKET HEYGEN_API_KEY ELEVENLABS_API_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET"

missing=""
for var in $REQUIRED_VARS; do
    val=$(eval echo "\${$var:-}")
    if [ -z "$val" ] || echo "$val" | grep -q "CHANGE_ME\|change-me"; then
        missing="$missing $var"
    fi
done

if [ -n "$missing" ]; then
    echo -e "${RED}[entrypoint] 필수 환경변수 미설정:${NC}"
    for v in $missing; do
        echo "  - $v"
    done
    # development 환경에서는 경고만 출력하고 계속 진행
    if [ "${ENVIRONMENT:-development}" = "production" ]; then
        echo -e "${RED}[entrypoint] 프로덕션 환경에서는 모든 필수 변수가 필요합니다. 종료합니다.${NC}"
        exit 1
    else
        echo "[entrypoint] 개발 환경 — 경고만 출력하고 계속 진행합니다."
    fi
else
    echo -e "${GREEN}[entrypoint] 환경변수 검증 통과 ✓${NC}"
fi

# 실제 명령 실행
exec "$@"
