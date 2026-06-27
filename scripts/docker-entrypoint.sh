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

# 필수 환경변수 — backend/app/core/config.py 의 _REQUIRED_IN_PROD 와 일치시킨다(H5).
# 1단계(베타 무료 배포)는 결제 비활성 → STRIPE_* 는 미설정이 정상이므로 제외한다
# (종전엔 STRIPE_SECRET_KEY·STRIPE_WEBHOOK_SECRET 미설정으로 배포가 hard-fail 했다).
# config 의 prod 필수키(HEYGEN_WEBHOOK_SECRET·OPENAI_API_KEY 포함)에 더해, 자체호스팅
# docker compose 운영에 필요한 인프라 변수(DB·JWT·POSTGRES·OAuth·TTS)를 함께 검증한다.
REQUIRED_VARS="DATABASE_URL JWT_SECRET_KEY POSTGRES_PASSWORD GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET ANTHROPIC_API_KEY OPENAI_API_KEY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY S3_BUCKET HEYGEN_API_KEY HEYGEN_WEBHOOK_SECRET ELEVENLABS_API_KEY"

missing=""
for var in $REQUIRED_VARS; do
    val=$(eval echo "\${$var:-}")
    # 플레이스홀더 마커 통일(L5) — config.py _PLACEHOLDER_MARKERS 와 동일 집합
    # (CHANGE_ME·CHANGE-ME·CHANGEME·YOUR_·YOUR-·PLACEHOLDER), 대소문자 무시.
    if [ -z "$val" ] || echo "$val" | grep -qiE 'CHANGE[_-]?ME|YOUR[_-]|PLACEHOLDER'; then
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
