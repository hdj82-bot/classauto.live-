"""인프라 하드닝 회귀 테스트 — /metrics 토큰 게이트(L4) + CORS Vercel 프리뷰 범위(M9)."""
from __future__ import annotations

import re
from unittest.mock import patch

import pytest


# ══════════════════════════════════════════════════════════════════════════════
# L4 — /metrics 토큰 게이트
#   Railway 엔 nginx 가 없어 /metrics 가 공개 도달 가능 → 토큰 게이트로 보호한다.
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_metrics_open_in_dev_without_token(client):
    """개발/스테이징에서는 토큰 미설정이어도 /metrics 가 열려 로컬 Prometheus 가 동작한다."""
    from app.core.config import settings
    with patch.object(settings, "ENVIRONMENT", "development"), \
         patch.object(settings, "METRICS_TOKEN", ""):
        resp = await client.get("/metrics")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_metrics_disabled_in_prod_without_token(client):
    """production + 토큰 미설정 = /metrics 비활성(404) — 공개 노출 차단."""
    from app.core.config import settings
    with patch.object(settings, "ENVIRONMENT", "production"), \
         patch.object(settings, "METRICS_TOKEN", ""):
        resp = await client.get("/metrics")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_metrics_requires_matching_token_in_prod(client):
    """production + 토큰 설정: 일치 토큰만 200, 그 외(없음/오답)는 404(존재 은닉)."""
    from app.core.config import settings
    token = "s3cr3t-metrics-token"
    with patch.object(settings, "ENVIRONMENT", "production"), \
         patch.object(settings, "METRICS_TOKEN", token):
        no_token = await client.get("/metrics")
        wrong = await client.get("/metrics", headers={"Authorization": "Bearer nope"})
        bearer_ok = await client.get("/metrics", headers={"Authorization": f"Bearer {token}"})
        query_ok = await client.get("/metrics", params={"token": token})

    assert no_token.status_code == 404
    assert wrong.status_code == 404
    assert bearer_ok.status_code == 200
    assert query_ok.status_code == 200
    # 정상 응답은 Prometheus 텍스트 포맷.
    assert "ifl_" in bearer_ok.text


# ══════════════════════════════════════════════════════════════════════════════
# M9 — CORS Vercel 프리뷰 정규식 범위 축소
#   종전 r"https://.*\.vercel\.app" 는 임의 Vercel 앱 전체를 허용해 과대했다.
# ══════════════════════════════════════════════════════════════════════════════


def test_cors_vercel_regex_scoped_to_project():
    """우리 팀 프로젝트 프리뷰 origin 만 허용하고, 임의 Vercel 앱은 거부한다."""
    from app.core.config import settings
    rx = re.compile(settings.CORS_VERCEL_PREVIEW_REGEX)

    # 우리 프로젝트(classauto) 프리뷰 — 허용 (starlette 는 fullmatch).
    assert rx.fullmatch("https://classauto.vercel.app")
    assert rx.fullmatch("https://classauto-git-main-team.vercel.app")
    assert rx.fullmatch("https://classauto-abc123def-team.vercel.app")

    # 임의의 다른 Vercel 앱 — 거부.
    assert not rx.fullmatch("https://evil.vercel.app")
    assert not rx.fullmatch("https://attacker-classauto.vercel.app")
    assert not rx.fullmatch("https://classauto.evil.com")


def test_cors_allow_vercel_previews_default_false():
    """코드 기본값은 False (production .env.production 도 명시적 false — M9)."""
    from app.core.config import settings
    assert settings.CORS_ALLOW_VERCEL_PREVIEWS is False
