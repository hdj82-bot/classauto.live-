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


# ── T9: 추가 sensitive 키 ────────────────────────────────────────────────


def test_before_send_masks_t9_extra_sensitive_keys():
    """stripe / heygen webhook signature, jwt, bearer 도 마스킹되어야 한다."""
    event = {
        "request": {
            "url": "/api/v1/webhooks/heygen",
            "headers": {
                "stripe-signature": "t=123,v1=abc",
                "x-heygen-signature": "sha256=abcdef",
                "Authorization": "Bearer xyz",
            },
            "data": {
                "jwt": "eyJhbGciOi...",
                "bearer": "raw-token-value",
                "stripe_signature": "duplicate-form-name",
            },
        },
    }
    result = sentry_mod._before_send(event, {})
    h = result["request"]["headers"]
    assert h["stripe-signature"] == "[Filtered]"
    assert h["x-heygen-signature"] == "[Filtered]"
    # Authorization 은 추가 안전망(Bearer [FILTERED]) 또는 deep-scrub [Filtered] 둘 중 하나
    assert h["Authorization"] in ("[Filtered]", "Bearer [FILTERED]")
    d = result["request"]["data"]
    assert d["jwt"] == "[Filtered]"
    assert d["bearer"] == "[Filtered]"
    assert d["stripe_signature"] == "[Filtered]"


# ── T9: depth limit 회귀 가드 (10 단계 이상 중첩에서도 안전) ──────────────


def test_before_send_stops_at_max_depth_without_recursion_error():
    """10 단계보다 깊은 dict 에서도 RecursionError 없이 반환된다.

    depth 10 까지는 마스킹 적용, 그 이상은 원본 보존(하지만 재귀 종료) — 핵심은 안전성.
    """
    # 12 단계 깊이의 password 필드 — 재귀 한도(_MAX_DEPTH=10) 보다 깊다.
    deep: dict = {"password": "leaf-secret"}
    for _ in range(12):
        deep = {"nested": deep}

    event = {"request": {"url": "/x"}, "extra": deep}
    # 안전하게 반환되어야 한다 (RecursionError 없이).
    result = sentry_mod._before_send(event, {})
    assert result is not None

    # 얕은 단계(<= 10) 의 password 는 적어도 한 번 마스킹되어야 한다 — 0~7 단계에 password 를 두자.
    shallow: dict = {"password": "shallow-secret", "label": "ok"}
    event2 = {"request": {"url": "/x"}, "extra": {"a": {"b": shallow}}}
    result2 = sentry_mod._before_send(event2, {})
    assert result2["extra"]["a"]["b"]["password"] == "[Filtered]"


def test_max_depth_constant_is_documented():
    """T9: depth 한도가 10 으로 유지되는지 회귀 가드."""
    assert sentry_mod._MAX_DEPTH == 10
