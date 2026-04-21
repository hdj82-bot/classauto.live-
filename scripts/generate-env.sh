#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# IFL Platform — 대화형 .env 파일 생성 헬퍼
#
# .env.example을 기반으로 대화형으로 환경변수를 설정합니다.
#
# 사용법:
#   ./scripts/generate-env.sh              # .env 생성
#   ./scripts/generate-env.sh .env.staging # 특정 파일 생성
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
BOLD='\033[1m'
NC='\033[0m'

OUTPUT_FILE="${1:-.env}"
EXAMPLE_FILE=".env.example"

if [ ! -f "$EXAMPLE_FILE" ]; then
    echo -e "${RED}[ERROR]${NC} $EXAMPLE_FILE 파일이 없습니다."
    exit 1
fi

# 기존 파일 백업
if [ -f "$OUTPUT_FILE" ]; then
    echo -e "${YELLOW}⚠ 기존 $OUTPUT_FILE 파일이 있습니다.${NC}"
    read -p "덮어쓰시겠습니까? (기존 파일은 .env.bak으로 백업) [y/N] " confirm
    if [[ "$confirm" != [yY] ]]; then
        echo "취소되었습니다."
        exit 0
    fi
    cp "$OUTPUT_FILE" "${OUTPUT_FILE}.bak"
    echo -e "${GREEN}백업 완료: ${OUTPUT_FILE}.bak${NC}"
fi

echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  IFL Platform — 환경변수 설정${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}[REQUIRED]${NC} = 필수 입력"
echo -e "  ${YELLOW}[OPTIONAL]${NC} = Enter로 건너뛰기 가능 (기본값 사용)"
echo ""
echo -e "──────────────────────────────────────────────────────────────"
echo ""

# ── 환경 선택 ────────────────────────────────────────────────────────────────
echo -e "${BOLD}배포 환경을 선택하세요:${NC}"
echo "  1) development (로컬 개발)"
echo "  2) staging (스테이징)"
echo "  3) production (프로덕션)"
read -p "선택 [1]: " env_choice
case "${env_choice:-1}" in
    2) ENVIRONMENT="staging" ;;
    3) ENVIRONMENT="production" ;;
    *) ENVIRONMENT="development" ;;
esac
echo ""

# ── .env.example 파싱 및 대화형 입력 ─────────────────────────────────────────
output_content=""
current_section=""
is_required=false

while IFS= read -r line; do
    # [REQUIRED] / [OPTIONAL] 태그
    if [[ "$line" =~ \[REQUIRED\] ]]; then
        is_required=true
        output_content+="$line"$'\n'
        continue
    fi
    if [[ "$line" =~ \[OPTIONAL\] ]]; then
        is_required=false
        output_content+="$line"$'\n'
        continue
    fi

    # 섹션 헤더
    if [[ "$line" =~ ^#\ ══ ]]; then
        output_content+="$line"$'\n'
        continue
    fi
    if [[ "$line" =~ ^#\ ──\ (.+)\ ── ]]; then
        current_section="${BASH_REMATCH[1]}"
        echo -e "${CYAN}── $current_section ──${NC}"
        output_content+="$line"$'\n'
        is_required=false
        continue
    fi

    # 일반 주석
    if [[ "$line" =~ ^# ]]; then
        output_content+="$line"$'\n'
        continue
    fi

    # 빈 줄
    if [[ -z "$line" ]]; then
        output_content+="$line"$'\n'
        continue
    fi

    # VAR=VALUE 파싱
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*) ]]; then
        var_name="${BASH_REMATCH[1]}"
        default_value="${BASH_REMATCH[2]}"

        # ENVIRONMENT는 이미 선택됨
        if [ "$var_name" = "ENVIRONMENT" ]; then
            output_content+="${var_name}=${ENVIRONMENT}"$'\n'
            continue
        fi

        # 프롬프트 구성
        if [ "$is_required" = true ]; then
            prompt_prefix="${RED}[필수]${NC}"
        else
            prompt_prefix="${YELLOW}[선택]${NC}"
        fi

        if [ -n "$default_value" ] && [[ "$default_value" != *"CHANGE_ME"* ]]; then
            read -p "$(echo -e "$prompt_prefix $var_name [$default_value]: ")" input_value
            final_value="${input_value:-$default_value}"
        else
            if [ "$is_required" = true ]; then
                while true; do
                    read -p "$(echo -e "$prompt_prefix $var_name: ")" input_value
                    if [ -n "$input_value" ]; then
                        break
                    fi
                    echo -e "  ${RED}필수 값입니다. 입력해주세요.${NC}"
                done
                final_value="$input_value"
            else
                read -p "$(echo -e "$prompt_prefix $var_name: ")" input_value
                final_value="${input_value:-$default_value}"
            fi
        fi

        output_content+="${var_name}=${final_value}"$'\n'
    else
        output_content+="$line"$'\n'
    fi
done < "$EXAMPLE_FILE"

# ── 파일 저장 ────────────────────────────────────────────────────────────────
echo "$output_content" > "$OUTPUT_FILE"

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ $OUTPUT_FILE 파일이 생성되었습니다.${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "검증하려면: ${CYAN}./scripts/validate-env.sh${NC}"
echo ""
