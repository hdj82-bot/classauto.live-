"""Sentry 에러 추적 초기화."""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


# J/T9: Sentry 로 보내기 전 마스킹할 키 (소문자 비교).
# request body / response body / breadcrumbs / extras 어디든 등장 가능.
# T9 추가:
#   - stripe-signature / x-heygen-signature: 외부 webhook HMAC 헤더
#   - jwt: JWT 페이로드 / 토큰 변형
#   - bearer: "Bearer <token>" 식의 raw 토큰 필드
_SENSITIVE_KEYS = frozenset({
    "email",
    "password",
    "token",
    "secret",
    "authorization",
    "api_key",
    "apikey",
    "refresh_token",
    "access_token",
    # T9 확장
    "jwt",
    "bearer",
    "stripe_signature",
    "stripe-signature",
    "x-heygen-signature",
    "x_heygen_signature",
    "heygen_signature",
})

_FILTERED = "[Filtered]"
# T9: 재귀 한도 — Sentry event 가 self-referential / 깊게 중첩된 경우에도 안전.
# 10 이면 실제 Sentry event 모양(보통 depth ≤ 6)을 충분히 커버하면서, 악성/순환 구조에서
# 무한 재귀를 막는다.
_MAX_DEPTH = 10


def init_sentry() -> None:
    """SENTRY_DSN이 설정된 경우에만 Sentry를 초기화."""
    if not settings.SENTRY_DSN:
        logger.info("SENTRY_DSN 미설정 — Sentry 비활성화")
        return

    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.redis import RedisIntegration

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        release="ifl-backend@1.0.0",
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        profiles_sample_rate=0.1,
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
            CeleryIntegration(),
            RedisIntegration(),
        ],
        # 민감 정보 필터링
        send_default_pii=False,
        before_send=_before_send,
    )
    logger.info("Sentry 초기화 완료 (env=%s)", settings.ENVIRONMENT)


def _scrub(value, depth: int = 0):
    """dict/list 를 재귀적으로 walk 하면서 sensitive key 의 값을 [Filtered] 로 치환.

    J: depth 한도 ``_MAX_DEPTH`` 로 self-referential / 순환 구조에서도 무한루프를 방지.
    원본을 in-place 수정 — 호출자는 반환값을 사용해도, 무시해도 무관 (sentry event 본인).
    """
    if depth > _MAX_DEPTH:
        return value

    if isinstance(value, dict):
        for k in list(value.keys()):
            try:
                k_lower = k.lower() if isinstance(k, str) else ""
            except Exception:
                k_lower = ""
            if k_lower in _SENSITIVE_KEYS:
                value[k] = _FILTERED
            else:
                value[k] = _scrub(value[k], depth + 1)
        return value

    if isinstance(value, list):
        for i, item in enumerate(value):
            value[i] = _scrub(item, depth + 1)
        return value

    if isinstance(value, tuple):
        # tuple 은 immutable — list 로 변환해 scrub 후 다시 tuple 로 (드물게 발생)
        return tuple(_scrub(item, depth + 1) for item in value)

    return value


def _before_send(event, hint):
    """Sentry로 전송 전 민감 정보 필터링.

    J: 이벤트 dict 전체를 재귀적으로 walk — request.data, request.cookies, breadcrumbs,
    extras, contexts 어느 곳에 들어 있든 ``_SENSITIVE_KEYS`` 매칭 시 [Filtered].
    """
    # 헬스체크 에러는 무시
    try:
        if event.get("request", {}).get("url", "").endswith("/health"):
            return None
    except AttributeError:
        pass

    # Authorization 헤더는 항상 통째로 마스킹 (key=lower 매칭 외에도 추가 안전망)
    try:
        headers = event.get("request", {}).get("headers", {})
        if isinstance(headers, dict):
            for h in list(headers.keys()):
                if isinstance(h, str) and h.lower() == "authorization":
                    headers[h] = "Bearer [FILTERED]"
    except Exception:
        pass

    # 전체 event dict 재귀 마스킹 — sensitive key 의 값을 [Filtered] 로 치환.
    try:
        _scrub(event, depth=0)
    except Exception as exc:
        # before_send 가 절대 sentry 송신을 막아선 안 됨 — 로깅만 하고 통과
        logger.warning("Sentry before_send scrub 실패: %s", exc)

    return event
