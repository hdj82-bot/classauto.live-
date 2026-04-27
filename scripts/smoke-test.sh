#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# IFL Platform — 배포 직후 스모크 테스트
#
# deploy.sh 또는 GitHub Actions 배포 workflow 마지막 단계에서 호출해
# 배포된 스택이 외부에서 실제로 정상 동작하는지 자동 검증한다.
#
# 사용법:
#   ./scripts/smoke-test.sh ifl-platform.com
#
# 종료 코드 = 실패한 체크 개수 (0 이면 전체 통과).
# set -e 를 쓰지 않고 모든 체크를 끝까지 돌린 뒤 종료 코드로 총 실패 수 반환.
# ══════════════════════════════════════════════════════════════════════════════

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
    echo "사용법: $0 <도메인>  (예: $0 ifl-platform.com)" >&2
    exit 2
fi

# ── 의존성 확인 ─────────────────────────────────────────────────────────────
_missing=()
for bin in curl jq openssl; do
    command -v "$bin" >/dev/null 2>&1 || _missing+=("$bin")
done
if [ ${#_missing[@]} -gt 0 ]; then
    echo "필수 도구가 설치되어 있지 않습니다: ${_missing[*]}" >&2
    echo "apt-get install -y curl jq openssl (Debian/Ubuntu) 또는 동등 패키지 설치 후 재시도." >&2
    exit 2
fi

# ── 색상 (TTY 일 때만) ──────────────────────────────────────────────────────
if [ -t 1 ]; then
    _G='\033[0;32m'; _R='\033[0;31m'; _Y='\033[1;33m'; _N='\033[0m'
else
    _G=''; _R=''; _Y=''; _N=''
fi

FAIL=0
API="https://api.${DOMAIN}"
FRONT="https://${DOMAIN}"

pass() { printf "${_G}[PASS]${_N} %s\n" "$1"; }
fail() { printf "${_R}[FAIL]${_N} %s\n" "$1"; FAIL=$((FAIL + 1)); }
info() { printf "${_Y}[....]${_N} %s\n" "$1"; }

printf "\n=== IFL Platform 스모크 테스트: %s ===\n\n" "$DOMAIN"

# ── 1. /health 엔드포인트 ───────────────────────────────────────────────────
# frontend 쪽은 /health 가 backend 로 프록시되므로 둘 다 동일 JSON 이 와야 함.
check_health() {
    local url="$1" label="$2"
    local body
    body=$(curl -sS --max-time 10 "$url/health" 2>/dev/null)
    if [ -z "$body" ]; then
        fail "$label /health: 응답 없음"
        return
    fi
    local status db redis s3
    status=$(echo "$body" | jq -r '.status // empty' 2>/dev/null)
    db=$(echo "$body"     | jq -r '.checks.db    // empty' 2>/dev/null)
    redis=$(echo "$body"  | jq -r '.checks.redis // empty' 2>/dev/null)
    s3=$(echo "$body"     | jq -r '.checks.s3    // empty' 2>/dev/null)
    if [ "$status" = "ok" ] && [ "$db" = "ok" ] && [ "$redis" = "ok" ] && [ "$s3" = "ok" ]; then
        pass "$label /health: status=ok, db/redis/s3 모두 ok"
    else
        fail "$label /health: status=$status db=$db redis=$redis s3=$s3 (body=$(echo "$body" | head -c 200))"
    fi
}
check_health "$FRONT" "frontend"
check_health "$API"   "api"

# ── 2. nginx 보안 헤더 ───────────────────────────────────────────────────────
headers=$(curl -sSI --max-time 10 "$FRONT/" 2>/dev/null)
if [ -z "$headers" ]; then
    fail "보안 헤더: $FRONT / 응답 없음"
else
    hsts=$(echo "$headers" | awk 'BEGIN{IGNORECASE=1} /^strict-transport-security:/ {sub(/^[^:]*: */,""); print; exit}')
    csp=$(echo  "$headers" | awk 'BEGIN{IGNORECASE=1} /^content-security-policy:/ {sub(/^[^:]*: */,""); print; exit}')
    xfo=$(echo  "$headers" | awk 'BEGIN{IGNORECASE=1} /^x-frame-options:/ {sub(/^[^:]*: */,""); print; exit}')
    xcto=$(echo "$headers" | awk 'BEGIN{IGNORECASE=1} /^x-content-type-options:/ {sub(/^[^:]*: */,""); print; exit}')

    # HSTS max-age ≥ 31536000
    hsts_age=$(echo "$hsts" | grep -Eo 'max-age=[0-9]+' | grep -Eo '[0-9]+' | head -1)
    if [ -n "$hsts_age" ] && [ "$hsts_age" -ge 31536000 ] 2>/dev/null; then
        pass "HSTS max-age=$hsts_age (≥ 31536000)"
    else
        fail "HSTS max-age 부족/누락: '$hsts'"
    fi

    # CSP 에 'unsafe-eval' 없어야 함
    if [ -z "$csp" ]; then
        fail "CSP 헤더 없음"
    elif echo "$csp" | grep -q "'unsafe-eval'"; then
        fail "CSP 에 'unsafe-eval' 포함됨: $csp"
    else
        pass "CSP 존재 + 'unsafe-eval' 없음"
    fi

    [ -n "$xfo" ]  && pass "X-Frame-Options: $(echo "$xfo" | tr -d '\r')"         || fail "X-Frame-Options 헤더 없음"
    [ -n "$xcto" ] && pass "X-Content-Type-Options: $(echo "$xcto" | tr -d '\r')" || fail "X-Content-Type-Options 헤더 없음"
fi

# ── 3. SSL: TLS 1.3 + 인증서 잔여 일수 ≥ 30 ──────────────────────────────────
ssl_out=$(echo | openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" -tls1_3 2>&1 </dev/null)
if echo "$ssl_out" | grep -q "TLSv1.3"; then
    pass "TLS 1.3 핸드셰이크 성공 ($DOMAIN)"
else
    fail "TLS 1.3 핸드셰이크 실패 ($DOMAIN)"
fi

# 인증서 notAfter 파싱
not_after=$(echo | openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" 2>/dev/null </dev/null \
            | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')
if [ -n "$not_after" ]; then
    exp_epoch=$(date -d "$not_after" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$not_after" +%s 2>/dev/null)
    if [ -n "$exp_epoch" ]; then
        now_epoch=$(date +%s)
        days_left=$(( (exp_epoch - now_epoch) / 86400 ))
        if [ "$days_left" -ge 30 ]; then
            pass "SSL 인증서 잔여 ${days_left}일 (≥ 30)"
        else
            fail "SSL 인증서 잔여 ${days_left}일 — 30일 미만, 갱신 필요"
        fi
    else
        fail "SSL 인증서 만료일 파싱 실패: $not_after"
    fi
else
    fail "SSL 인증서 enddate 추출 실패"
fi

# ── 4. /metrics 외부 노출 차단 (인증 필요 또는 내부망 한정) ─────────────────
# 허용 응답: 401/403 (인증/인가 거부) 또는 404 (nginx 가 외부에서 라우팅 차단).
# 200 이면 인증 없이 메트릭이 그대로 노출된 상태 — Prometheus 토큰 부재로 추정.
code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$API/metrics")
case "$code" in
    401|403)
        pass "/metrics 외부 접근 $code (인증 필요)"
        ;;
    404)
        pass "/metrics 외부 접근 404 (nginx 차단 — 내부망 한정)"
        ;;
    *)
        fail "/metrics 외부 접근 응답 $code — 401/403/404 여야 함 (인증 없이 노출됨)"
        ;;
esac

# ── 5. /docs, /openapi.json 프로덕션 비노출 ──────────────────────────────────
for path in /docs /openapi.json; do
    code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$API$path")
    if [ "$code" = "404" ]; then
        pass "$path 프로덕션 404"
    else
        fail "$path 응답 $code — 프로덕션에서는 404 여야 함"
    fi
done

# ── 6. /api/auth/google?role=student → 302 + Location accounts.google.com ──
# curl 302 단일 응답 헤더만 보고, 자동 follow 는 끔.
hdr=$(curl -sSI --max-time 10 "$API/api/auth/google?role=student")
status_line=$(echo "$hdr" | head -1 | tr -d '\r')
location=$(echo "$hdr" | awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/^[^:]*: */,""); print; exit}' | tr -d '\r')
if echo "$status_line" | grep -qE "30[27]" && [ "${location#https://accounts.google.com}" != "$location" ]; then
    pass "OAuth 시작: $status_line, Location → accounts.google.com"
else
    fail "OAuth 시작 비정상: status='$status_line', Location='$location'"
fi

# ── 7. /api/auth/exchange code 없이 POST → 400/401 ──────────────────────────
code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 \
       -X POST "$API/api/auth/exchange" \
       -H "Content-Type: application/json" -d '{}')
if [ "$code" = "400" ] || [ "$code" = "401" ] || [ "$code" = "422" ]; then
    # FastAPI 는 body 필수 필드 누락 시 422 를 반환 — 의도한 "code 없음 거부" 범주로 포함.
    pass "/api/auth/exchange code 없이 POST → $code (거부)"
else
    fail "/api/auth/exchange code 없이 POST → $code (400/401/422 여야 함)"
fi

# ── 8. Rate-limit: /api/v1/qa 130회 호출 시 429 한 번 이상 ───────────────────
info "Rate-limit 테스트: /api/v1/qa 130회 호출 중... (몇 초 소요)"
got_429=0
total_req=0
for i in $(seq 1 130); do
    c=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 \
        -X POST "$API/api/v1/qa" -H "Content-Type: application/json" -d '{}')
    total_req=$((total_req + 1))
    if [ "$c" = "429" ]; then
        got_429=$((got_429 + 1))
    fi
done
if [ "$got_429" -ge 1 ]; then
    pass "/api/v1/qa rate-limit 트리거: $total_req 요청 중 429 $got_429 회"
else
    fail "/api/v1/qa 130회 호출했으나 429 한 번도 발생 안 함 (rate-limit 미작동)"
fi

# ── 9. Stripe 웹훅 /api/v1/payment/webhook 은 rate-limit 에서 제외 ───────────
info "웹훅 제외 테스트: /api/v1/payment/webhook 100회 POST 중..."
webhook_429=0
webhook_other=0
for i in $(seq 1 100); do
    c=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 \
        -X POST "$API/api/v1/payment/webhook" \
        -H "Content-Type: application/json" \
        -H "stripe-signature: t=1,v1=fake" \
        -d '{}')
    if [ "$c" = "429" ]; then
        webhook_429=$((webhook_429 + 1))
    else
        webhook_other=$((webhook_other + 1))
    fi
done
if [ "$webhook_429" -eq 0 ]; then
    pass "/api/v1/payment/webhook 100회 POST: 429 0회 (rate-limit 제외 확인, 그 외 $webhook_other)"
else
    fail "/api/v1/payment/webhook 100회 POST 중 429 $webhook_429 회 발생 — rate-limit 제외 누락"
fi

# ── 결과 ─────────────────────────────────────────────────────────────────────
printf "\n=== 결과: 실패 %d 건 ===\n" "$FAIL"
exit "$FAIL"
