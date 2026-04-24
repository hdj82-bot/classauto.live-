"""Sentry 에러 추적 초기화."""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


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


def _before_send(event, hint):
    """Sentry로 전송 전 민감 정보 필터링."""
    # 헬스체크 에러는 무시
    if event.get("request", {}).get("url", "").endswith("/health"):
        return None

    # Authorization 헤더에서 실제 토큰 마스킹
    headers = event.get("request", {}).get("headers", {})
    if "authorization" in headers:
        headers["authorization"] = "Bearer [FILTERED]"

    return event
