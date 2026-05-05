"""J: Sentry before_send 가 nested dict 의 sensitive key 를 마스킹하는지 검증."""
from __future__ import annotations

from app.core import sentry as sentry_mod


# ── /health 스킵 ───────────────────────────────────────────────────────────


def test_before_send_drops_health_check_events():
    event = {"request": {"url": "https://api.example.com/health"}}
    assert sentry_mod._before_send(event, {}) is None


# ── 평면 / 중첩 sensitive key 마스킹 ─────────────────────────────────────


def test_before_send_masks_top_level_sensitive_keys():
    event = {
        "request": {
            "url": "https://api/api/v1/auth/login",
            "data": {
                "email": "alice@example.com",
                "password": "hunter2",
            },
        },
    }
    result = sentry_mod._before_send(event, {})
    assert result["request"]["data"]["email"] == "[Filtered]"
    assert result["request"]["data"]["password"] == "[Filtered]"


def test_before_send_masks_nested_sensitive_keys_in_breadcrumbs():
    event = {
        "request": {"url": "https://api/api/v1/foo"},
        "breadcrumbs": {
            "values": [
                {
                    "category": "http",
                    "data": {
                        "method": "POST",
                        "url": "https://upstream/refresh",
                        "headers": {
                            "authorization": "Bearer eyJabc",
                            "x-api-key": "k-1234",
                        },
                        "body": {
                            "refresh_token": "rt-secret",
                            "access_token": "at-secret",
                            "user": {"email": "bob@x.io"},
                        },
                    },
                }
            ]
        },
    }
    result = sentry_mod._before_send(event, {})
    crumb = result["breadcrumbs"]["values"][0]["data"]
    # Authorization 헤더는 deep-scrub 으로도 가리고, 추가 안전망(Bearer [FILTERED]) 둘 중 하나
    assert crumb["headers"]["authorization"] in ("[Filtered]", "Bearer [FILTERED]")
    assert crumb["body"]["refresh_token"] == "[Filtered]"
    assert crumb["body"]["access_token"] == "[Filtered]"
    assert crumb["body"]["user"]["email"] == "[Filtered]"
    # 비-sensitive 필드는 보존
    assert crumb["method"] == "POST"
    assert crumb["url"] == "https://upstream/refresh"


def test_before_send_masks_token_secret_api_key_variants():
    event = {
        "request": {"url": "/foo"},
        "extra": {
            "ctx": {
                "token": "t",
                "secret": "s",
                "api_key": "k",
                "apikey": "k2",
                "non_sensitive": "keep-me",
            }
        },
    }
    result = sentry_mod._before_send(event, {})
    ctx = result["extra"]["ctx"]
    assert ctx["token"] == "[Filtered]"
    assert ctx["secret"] == "[Filtered]"
    assert ctx["api_key"] == "[Filtered]"
    assert ctx["apikey"] == "[Filtered]"
    assert ctx["non_sensitive"] == "keep-me"


def test_before_send_handles_lists_of_dicts():
    event = {
        "request": {"url": "/foo"},
        "extra": {
            "items": [
                {"email": "a@x", "label": "A"},
                {"password": "p", "label": "B"},
            ]
        },
    }
    result = sentry_mod._before_send(event, {})
    items = result["extra"]["items"]
    assert items[0]["email"] == "[Filtered]"
    assert items[0]["label"] == "A"
    assert items[1]["password"] == "[Filtered]"
    assert items[1]["label"] == "B"


# ── depth limit / 순환 구조 ───────────────────────────────────────────────


def test_before_send_handles_self_referential_dict_without_recursion_error():
    inner: dict = {"password": "p"}
    inner["self"] = inner  # 순환 참조
    event = {"request": {"url": "/x"}, "extra": inner}

    # 무한 재귀 없이 반환되어야 한다 — depth limit 으로 보호
    result = sentry_mod._before_send(event, {})
    assert result is not None
    # 첫 단계에서는 마스킹 적용
    assert result["extra"]["password"] == "[Filtered]"


def test_before_send_returns_event_even_when_scrub_fails(monkeypatch):
    """_scrub 가 예외를 던져도 sentry 송신은 계속되어야 한다 (event != None)."""
    def boom(*a, **kw):
        raise RuntimeError("scrub bug")

    monkeypatch.setattr(sentry_mod, "_scrub", boom)
    event = {"request": {"url": "/foo"}, "extra": {"password": "p"}}
    result = sentry_mod._before_send(event, {})
    assert result is event
