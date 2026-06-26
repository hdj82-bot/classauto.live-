"""프로덕션 설정 검증(_validate_settings) — placeholder·누락 키 부팅 차단."""
from __future__ import annotations

import pytest

from app.core import config


def _fill_valid_prod(monkeypatch) -> None:
    """프로덕션 검증을 통과하는 최소 유효 설정으로 채운다."""
    monkeypatch.setattr(config.settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(config.settings, "JWT_SECRET_KEY", "a" * 40)
    monkeypatch.setattr(config.settings, "JWT_ALGORITHM", "HS256")
    monkeypatch.setattr(config.settings, "GOOGLE_OAUTH_CLIENT_ID", "client-id")
    monkeypatch.setattr(config.settings, "GOOGLE_OAUTH_CLIENT_SECRET", "client-secret")
    for k in config._REQUIRED_IN_PROD:
        monkeypatch.setattr(config.settings, k, "real-value-123")
    # 형식 경고를 피하려고 prefix 가 맞는 더미 키를 넣는다(경고는 실패 아님).
    monkeypatch.setattr(config.settings, "ANTHROPIC_API_KEY", "sk-ant-real")
    monkeypatch.setattr(config.settings, "OPENAI_API_KEY", "sk-real")


def test_looks_like_placeholder():
    assert config._looks_like_placeholder("CHANGE_ME")
    assert config._looks_like_placeholder("change_me_bucket")
    assert config._looks_like_placeholder("CHANGE_ME_JWT_SECRET")
    assert config._looks_like_placeholder("your-key-here")
    assert not config._looks_like_placeholder("sk-ant-abc123")
    assert not config._looks_like_placeholder("ifl-prod-bucket")


def test_required_in_prod_covers_pipeline_keys():
    # 핵심 파이프라인 키가 누락 검증 대상에 들어 있어야 한다(회귀 방지).
    for k in ("OPENAI_API_KEY", "HEYGEN_API_KEY", "S3_BUCKET", "AWS_ACCESS_KEY_ID"):
        assert k in config._REQUIRED_IN_PROD


def test_required_in_prod_excludes_stripe_includes_webhook(monkeypatch):
    """H5: 베타 무료 배포 — 결제 비활성이므로 STRIPE_* 는 prod 필수에서 제외,
    HeyGen 웹훅 서명·OpenAI 키는 필수. 배포 스크립트(REQUIRED_VARS)와도 일치해야 한다."""
    # 베타 무료 — Stripe 키는 미설정이 정상.
    assert "STRIPE_SECRET_KEY" not in config._REQUIRED_IN_PROD
    assert "STRIPE_WEBHOOK_SECRET" not in config._REQUIRED_IN_PROD
    # HeyGen 웹훅 서명 검증·OpenAI 임베딩은 필수.
    assert "HEYGEN_WEBHOOK_SECRET" in config._REQUIRED_IN_PROD
    assert "OPENAI_API_KEY" in config._REQUIRED_IN_PROD


def test_placeholder_markers_canonical_set():
    """L5: config.py 가 통일 마커 집합(CHANGE_ME·change-me·YOUR_·PLACEHOLDER)을
    대소문자 무시로 모두 잡아낸다 — 스크립트의 grep 패턴과 동일 기준."""
    for marker in (
        "CHANGE_ME", "change-me", "CHANGEME", "CHANGE-ME",
        "YOUR_KEY", "your-domain", "PLACEHOLDER", "placeholder_x",
    ):
        assert config._looks_like_placeholder(marker), marker
    # 정상 시크릿은 placeholder 로 오탐하지 않는다.
    for real in ("sk-ant-abc123", "ifl-prod-bucket", "whsec_realsecret"):
        assert not config._looks_like_placeholder(real), real


def test_valid_prod_settings_pass(monkeypatch):
    _fill_valid_prod(monkeypatch)
    # 예외 없이 통과해야 한다.
    config._validate_settings()


def test_missing_required_key_raises(monkeypatch):
    _fill_valid_prod(monkeypatch)
    monkeypatch.setattr(config.settings, "OPENAI_API_KEY", "")
    with pytest.raises(RuntimeError, match="누락"):
        config._validate_settings()


def test_changeme_placeholder_key_raises(monkeypatch):
    _fill_valid_prod(monkeypatch)
    monkeypatch.setattr(config.settings, "S3_BUCKET", "CHANGE_ME_BUCKET_NAME")
    with pytest.raises(RuntimeError, match="placeholder"):
        config._validate_settings()


def test_placeholder_jwt_secret_raises(monkeypatch):
    _fill_valid_prod(monkeypatch)
    # 32자 이상이라 길이 검증은 통과하지만 placeholder 라 차단돼야 한다.
    monkeypatch.setattr(config.settings, "JWT_SECRET_KEY", "CHANGE_ME_JWT_SECRET_AAAAAAAAAAAAAA")
    with pytest.raises(RuntimeError, match="placeholder"):
        config._validate_settings()
