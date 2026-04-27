#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# IFL Platform — 환경변수 검증 스크립트
#
# .env.example 을 기준으로 [REQUIRED] 변수가 모두 설정되었는지 + 형식이
# 올바른지(길이, 프리픽스, URL 형태) 확인한다.
#
# 사용법:
#   ./scripts/validate-env.sh                  # .env 검증
#   ./scripts/validate-env.sh .env.staging     # 특정 파일 검증
#   ./scripts/validate-env.sh --strict         # production 전제 강화 검증
#   ./scripts/validate-env.sh --strict .env    # 옵션 + 파일 동시 지정
#   ENV_FILE=.env.production ./scripts/validate-env.sh
#
# --strict 모드 (production 배포 전 권장):
#   - DOMAIN 이 localhost / CHANGE_ME 면 실패
#   - STRIPE_SECRET_KEY 가 sk_live_ 로 시작하지 않으면 경고
#   - SENTRY_DSN 비어있으면 경고
#
# 종료 코드:
#   0 = 모든 필수 변수 설정 + 형식 통과
#   1 = 누락/형식 오류 있음
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── 인자 파싱 ────────────────────────────────────────────────────────────────
STRICT=false
ENV_FILE_ARG=""
for arg in "$@"; do
    case "$arg" in
        --strict) STRICT=true ;;
        -h|--help)
            sed -n '2,25p' "$0"
            exit 0
            ;;
        *) ENV_FILE_ARG="$arg" ;;
    esac
done

ENV_FILE="${ENV_FILE_ARG:-${ENV_FILE:-.env}}"
EXAMPLE_FILE=".env.example"

echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  IFL Platform — 환경변수 검증${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}[ERROR]${NC} 환경변수 파일이 없습니다: $ENV_FILE"
    echo ""
    echo "  다음 명령으로 생성하세요:"
    echo "    cp .env.production .env       # 프로덕션 템플릿"
    echo "    cp .env.example .env          # 개발 템플릿"
    echo "    ./scripts/generate-env.sh     # 대화형 생성"
    echo ""
    exit 1
fi

if [ ! -f "$EXAMPLE_FILE" ]; then
    echo -e "${RED}[ERROR]${NC} $EXAMPLE_FILE 파일이 없습니다."
    exit 1
fi

echo -e "검증 대상: ${GREEN}$ENV_FILE${NC}"
if $STRICT; then
    echo -e "모드     : ${YELLOW}--strict (production 전제)${NC}"
fi
echo ""

# ── env 파일 값 읽기 (last-wins, # 주석 무시) ────────────────────────────────
get_env() {
    local key="$1"
    grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d'=' -f2- || echo ""
}

is_placeholder() {
    local v="$1"
    [[ -z "$v" || "$v" == *"CHANGE_ME"* || "$v" == *"change-me"* || "$v" == *"your-"* ]]
}

# ── .env.example 에서 [REQUIRED] 변수 목록 추출 ─────────────────────────────
missing_required=()
missing_optional=()
placeholder_required=()
format_errors=()
strict_warnings=()
valid_count=0
is_required=false

while IFS= read -r line; do
    if [[ "$line" =~ \[REQUIRED\] ]]; then is_required=true;  continue; fi
    if [[ "$line" =~ \[OPTIONAL\] ]]; then is_required=false; continue; fi
    if [[ "$line" =~ ^#\ ── ]]; then is_required=false; continue; fi
    [[ -z "$line" || "$line" =~ ^# ]] && continue

    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]]; then
        var_name="${BASH_REMATCH[1]}"
        actual_value="$(get_env "$var_name")"

        if is_placeholder "$actual_value"; then
            if $is_required; then
                placeholder_required+=("$var_name")
            fi
            continue
        fi

        if [ -z "$actual_value" ]; then
            if $is_required; then
                missing_required+=("$var_name")
            else
                missing_optional+=("$var_name")
            fi
        else
            valid_count=$((valid_count + 1))
        fi
    fi
done < "$EXAMPLE_FILE"

# ── 형식 검증 ────────────────────────────────────────────────────────────────
# 빈 값/플레이스홀더는 위에서 이미 잡혔으므로 여기선 "값이 있는데 형식이 틀린 경우"만 검증.

check_format() {
    local key="$1" pattern="$2" hint="$3"
    local v
    v="$(get_env "$key")"
    [ -z "$v" ] && return 0
    is_placeholder "$v" && return 0
    if ! [[ "$v" =~ $pattern ]]; then
        format_errors+=("$key: $hint (현재값: ${v:0:20}...)")
    fi
}

check_min_length() {
    local key="$1" min="$2" hint="$3"
    local v
    v="$(get_env "$key")"
    [ -z "$v" ] && return 0
    is_placeholder "$v" && return 0
    if [ "${#v}" -lt "$min" ]; then
        format_errors+=("$key: $hint (현재 길이=${#v}, 최소=${min})")
    fi
}

# JWT 비밀키: HS256 으로 충분히 강해야 함
check_min_length "JWT_SECRET_KEY" 32 \
    "최소 32자 이상이어야 합니다 (openssl rand -hex 32 권장)"

# DB 비밀번호: 약한 값 방지
check_min_length "POSTGRES_PASSWORD" 16 \
    "최소 16자 이상 권장 (openssl rand -base64 24)"

# Anthropic Claude API
check_format "ANTHROPIC_API_KEY" '^sk-ant-[A-Za-z0-9_-]+$' \
    "sk-ant- 로 시작해야 합니다"

# OpenAI (임베딩)
check_format "OPENAI_API_KEY" '^sk-[A-Za-z0-9_-]+$' \
    "sk- 로 시작해야 합니다"

# Stripe secret key
check_format "STRIPE_SECRET_KEY" '^sk_(test|live)_[A-Za-z0-9]+$' \
    "sk_test_ 또는 sk_live_ 로 시작해야 합니다"

# Stripe webhook secret
check_format "STRIPE_WEBHOOK_SECRET" '^whsec_[A-Za-z0-9]+$' \
    "whsec_ 로 시작해야 합니다 (Stripe Dashboard > Webhooks 에서 복사)"

# Stripe Price IDs (선택, 있으면 형식만 확인)
check_format "STRIPE_PRICE_BASIC" '^price_[A-Za-z0-9]+$' "price_ 로 시작해야 합니다"
check_format "STRIPE_PRICE_PRO"   '^price_[A-Za-z0-9]+$' "price_ 로 시작해야 합니다"

# HeyGen / ElevenLabs / DeepL — 단순 길이 체크 (프리픽스 규약 없음)
check_min_length "HEYGEN_API_KEY" 20 \
    "HeyGen API 키가 너무 짧습니다 (대시보드에서 복사한 게 맞는지 확인)"
check_min_length "ELEVENLABS_API_KEY" 20 \
    "ElevenLabs API 키가 너무 짧습니다"

# DeepL: 무료 키는 :fx 로 끝남. 둘 다 허용.
check_format "DEEPL_API_KEY" '^[A-Za-z0-9-]+(:fx)?$' \
    "DeepL API 키 형식이 올바르지 않습니다"

# Sentry DSN
check_format "SENTRY_DSN" '^https://[A-Za-z0-9]+@[A-Za-z0-9.-]+/[0-9]+$' \
    "https://<key>@<host>/<project_id> 형식이어야 합니다"
check_format "NEXT_PUBLIC_SENTRY_DSN" '^https://[A-Za-z0-9]+@[A-Za-z0-9.-]+/[0-9]+$' \
    "https://<key>@<host>/<project_id> 형식이어야 합니다"

# AWS
check_format "AWS_ACCESS_KEY_ID" '^(AKIA|ASIA)[A-Z0-9]{16}$' \
    "AKIA/ASIA 로 시작하는 20자 IAM 액세스 키여야 합니다"
check_min_length "AWS_SECRET_ACCESS_KEY" 30 \
    "AWS Secret 은 보통 40자입니다 (잘못 복사된 듯)"
check_format "S3_BUCKET" '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$' \
    "S3 버킷명 규칙(소문자/숫자/-/.)을 따라야 합니다"

# Google OAuth client id
check_format "GOOGLE_OAUTH_CLIENT_ID" '\.apps\.googleusercontent\.com$' \
    "*.apps.googleusercontent.com 으로 끝나야 합니다"

# URL 형태 변수
check_format "GOOGLE_OAUTH_REDIRECT_URI" '^https?://' \
    "http(s):// 로 시작하는 URL 이어야 합니다"
check_format "FRONTEND_URL"              '^https?://' "http(s):// URL 이어야 합니다"
check_format "NEXT_PUBLIC_API_URL"       '^https?://' "http(s):// URL 이어야 합니다"
check_format "HEYGEN_CALLBACK_URL"       '^https?://' "http(s):// URL 이어야 합니다"
check_format "DATABASE_URL"      '^postgresql\+asyncpg://' \
    "postgresql+asyncpg:// 로 시작해야 합니다 (async driver)"
check_format "DATABASE_URL_SYNC" '^postgresql://' \
    "postgresql:// 로 시작해야 합니다 (sync driver, alembic 용)"
check_format "REDIS_URL"            '^redis(s)?://' "redis:// 로 시작해야 합니다"
check_format "CELERY_BROKER_URL"    '^redis(s)?://' "redis:// 로 시작해야 합니다"
check_format "CELERY_RESULT_BACKEND" '^redis(s)?://' "redis:// 로 시작해야 합니다"

# ── strict 모드 (production 전제) ────────────────────────────────────────────
if $STRICT; then
    # ENVIRONMENT 가 production 이어야 함
    env_v="$(get_env ENVIRONMENT)"
    if [ "$env_v" != "production" ]; then
        strict_warnings+=("ENVIRONMENT=$env_v — production 배포라면 'production' 이어야 합니다")
    fi

    # DOMAIN: localhost / placeholder 금지
    domain_v="$(get_env DOMAIN)"
    if [ -z "$domain_v" ] || [ "$domain_v" = "localhost" ] || is_placeholder "$domain_v"; then
        format_errors+=("DOMAIN: production 에서는 실제 도메인이어야 합니다 (현재: '$domain_v')")
    fi

    # SSL_EMAIL: Let's Encrypt 갱신 알림용
    email_v="$(get_env SSL_EMAIL)"
    if [ -z "$email_v" ] || is_placeholder "$email_v"; then
        format_errors+=("SSL_EMAIL: Let's Encrypt 갱신 알림용 이메일이 필요합니다")
    elif ! [[ "$email_v" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
        format_errors+=("SSL_EMAIL: 이메일 형식이 올바르지 않습니다 ($email_v)")
    fi

    # Stripe live key 권장
    sk="$(get_env STRIPE_SECRET_KEY)"
    if [[ "$sk" == sk_test_* ]]; then
        strict_warnings+=("STRIPE_SECRET_KEY: 테스트 키(sk_test_) 사용 중 — production 은 sk_live_ 권장")
    fi

    # JWT_SECRET_KEY: 64자 이상이면 더 안전
    jwt="$(get_env JWT_SECRET_KEY)"
    if [ -n "$jwt" ] && ! is_placeholder "$jwt" && [ "${#jwt}" -lt 64 ]; then
        strict_warnings+=("JWT_SECRET_KEY: 64자 이상 권장 (현재 ${#jwt}자)")
    fi

    # FRONTEND_URL / NEXT_PUBLIC_API_URL: https 강제
    for k in FRONTEND_URL NEXT_PUBLIC_API_URL HEYGEN_CALLBACK_URL GOOGLE_OAUTH_REDIRECT_URI; do
        v="$(get_env "$k")"
        if [ -n "$v" ] && ! is_placeholder "$v" && [[ "$v" != https://* ]]; then
            format_errors+=("$k: production 에서는 https:// 여야 합니다 (현재: $v)")
        fi
    done

    # Sentry DSN 권장
    if [ -z "$(get_env SENTRY_DSN)" ] || is_placeholder "$(get_env SENTRY_DSN)"; then
        strict_warnings+=("SENTRY_DSN: production 에러 추적을 위해 설정 권장")
    fi
fi

# ── 결과 출력 ────────────────────────────────────────────────────────────────
echo -e "${GREEN}✓ 설정된 변수: ${valid_count}개${NC}"

if [ ${#missing_optional[@]} -gt 0 ]; then
    echo -e "${YELLOW}△ 선택 변수 미설정: ${#missing_optional[@]}개${NC}"
    for v in "${missing_optional[@]}"; do
        echo -e "    ${YELLOW}-${NC} $v"
    done
fi
echo ""

if [ ${#strict_warnings[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠ 권고사항 (--strict):${NC}"
    for w in "${strict_warnings[@]}"; do
        echo -e "    ${YELLOW}-${NC} $w"
    done
    echo ""
fi

fail=false

if [ ${#placeholder_required[@]} -gt 0 ]; then
    echo -e "${RED}✗ 플레이스홀더(CHANGE_ME 등) 미교체: ${#placeholder_required[@]}개${NC}"
    for v in "${placeholder_required[@]}"; do
        echo -e "    ${RED}✗${NC} $v"
    done
    echo ""
    fail=true
fi

if [ ${#missing_required[@]} -gt 0 ]; then
    echo -e "${RED}✗ 필수 변수 미설정: ${#missing_required[@]}개${NC}"
    for v in "${missing_required[@]}"; do
        echo -e "    ${RED}✗${NC} $v"
    done
    echo ""
    fail=true
fi

if [ ${#format_errors[@]} -gt 0 ]; then
    echo -e "${RED}✗ 형식 오류: ${#format_errors[@]}개${NC}"
    for e in "${format_errors[@]}"; do
        echo -e "    ${RED}✗${NC} $e"
    done
    echo ""
    fail=true
fi

if $fail; then
    echo -e "${RED}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  검증 실패 — 위 항목을 수정한 뒤 다시 실행하세요${NC}"
    echo -e "${RED}══════════════════════════════════════════════════════════════${NC}"
    echo "  파일: $ENV_FILE"
    exit 1
fi

echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ 환경변수 검증 통과${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
exit 0
