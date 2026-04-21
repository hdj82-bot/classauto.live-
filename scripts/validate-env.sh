#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# IFL Platform — 환경변수 검증 스크립트
#
# .env.example을 기준으로 필수 변수가 모두 설정되었는지 확인합니다.
# .env.example에서 "# [REQUIRED]" 주석이 있는 변수는 필수, 없으면 선택입니다.
#
# 사용법:
#   ./scripts/validate-env.sh              # .env 파일 검증
#   ./scripts/validate-env.sh .env.staging # 특정 파일 검증
#   ENV_FILE=.env.production ./scripts/validate-env.sh
#
# 종료 코드:
#   0 = 모든 필수 변수 설정됨
#   1 = 누락된 필수 변수 있음
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ENV_FILE="${1:-${ENV_FILE:-.env}}"
EXAMPLE_FILE=".env.example"

echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  IFL Platform — 환경변수 검증${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""

# ── .env 파일 존재 확인 ──────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}[ERROR]${NC} 환경변수 파일이 없습니다: $ENV_FILE"
    echo ""
    echo "  다음 명령으로 생성하세요:"
    echo "    cp .env.example .env"
    echo "    # 또는"
    echo "    ./scripts/generate-env.sh"
    echo ""
    exit 1
fi

if [ ! -f "$EXAMPLE_FILE" ]; then
    echo -e "${RED}[ERROR]${NC} $EXAMPLE_FILE 파일이 없습니다."
    exit 1
fi

echo -e "검증 대상: ${GREEN}$ENV_FILE${NC}"
echo ""

# ── .env.example에서 필수/선택 변수 파싱 ─────────────────────────────────────
missing_required=()
missing_optional=()
placeholder_vars=()
valid_count=0
is_required=false

while IFS= read -r line; do
    # [REQUIRED] 주석 감지
    if [[ "$line" =~ \[REQUIRED\] ]]; then
        is_required=true
        continue
    fi

    # [OPTIONAL] 주석 감지
    if [[ "$line" =~ \[OPTIONAL\] ]]; then
        is_required=false
        continue
    fi

    # 섹션 헤더(# ──) 발견 시 required 상태 리셋
    if [[ "$line" =~ ^#\ ── ]]; then
        is_required=false
        continue
    fi

    # 빈 줄이나 주석은 건너뛰기
    if [[ -z "$line" || "$line" =~ ^# ]]; then
        continue
    fi

    # VAR=VALUE 형태 파싱
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]]; then
        var_name="${BASH_REMATCH[1]}"

        # .env에서 값 읽기
        actual_value=$(grep "^${var_name}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- || echo "")

        # 플레이스홀더 체크
        if [[ "$actual_value" == *"CHANGE_ME"* || "$actual_value" == *"change-me"* || "$actual_value" == *"your-"* ]]; then
            placeholder_vars+=("$var_name")
            if [ "$is_required" = true ]; then
                missing_required+=("$var_name (플레이스홀더 값)")
            fi
            continue
        fi

        # 값이 비어있는 경우
        if [ -z "$actual_value" ]; then
            if [ "$is_required" = true ]; then
                missing_required+=("$var_name")
            else
                missing_optional+=("$var_name")
            fi
        else
            valid_count=$((valid_count + 1))
        fi
    fi
done < "$EXAMPLE_FILE"

# ── 결과 출력 ────────────────────────────────────────────────────────────────
echo -e "${GREEN}✓ 설정된 변수: ${valid_count}개${NC}"

if [ ${#missing_optional[@]} -gt 0 ]; then
    echo -e "${YELLOW}△ 선택 변수 미설정: ${#missing_optional[@]}개${NC}"
    for v in "${missing_optional[@]}"; do
        echo -e "    ${YELLOW}-${NC} $v"
    done
fi

echo ""

if [ ${#placeholder_vars[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠ 플레이스홀더 값 감지:${NC}"
    for v in "${placeholder_vars[@]}"; do
        echo -e "    ${YELLOW}-${NC} $v"
    done
    echo ""
fi

if [ ${#missing_required[@]} -gt 0 ]; then
    echo -e "${RED}✗ 필수 변수 미설정: ${#missing_required[@]}개${NC}"
    echo -e "${RED}──────────────────────────────────────────────────────────${NC}"
    for v in "${missing_required[@]}"; do
        echo -e "    ${RED}✗${NC} $v"
    done
    echo ""
    echo -e "${RED}위 필수 변수를 설정한 후 다시 시도하세요.${NC}"
    echo -e "  파일: $ENV_FILE"
    echo ""
    exit 1
fi

echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ 환경변수 검증 통과${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo ""
exit 0
