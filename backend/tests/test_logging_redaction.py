"""로깅 마스킹 회귀 테스트.

토큰·비밀키·비밀번호·서명 헤더 같은 민감정보가 stdout 또는 JSON 로그
형태로 흘러나가지 않도록 _redact() 가 적절히 동작하는지 검증한다.
"""
import json
import logging

import pytest

from app.core.logging import (
    JSONFormatter,
    _RedactingTextFormatter,
    _redact,
)


# ── 단위 함수 ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "raw,expected_substr,forbidden_substr",
    [
        # Bearer 토큰
        (
            "Authorization: Bearer abc.def.ghi",
            "[REDACTED]",
            "abc.def.ghi",
        ),
        # access_token JSON 형태
        (
            '{"access_token": "eyJhbGciOiJIUzI1NiJ9.payload.sig"}',
            "[REDACTED]",
            "eyJhbGciOiJIUzI1NiJ9.payload.sig",
        ),
        # refresh_token=value (URL/form)
        (
            "refresh_token=secret-value-xyz",
            "[REDACTED]",
            "secret-value-xyz",
        ),
        # api_key 변종
        (
            'api_key="sk-live-1234567890"',
            "[REDACTED]",
            "sk-live-1234567890",
        ),
        # password
        (
            'password: "hunter2"',
            "[REDACTED]",
            "hunter2",
        ),
        # Stripe webhook 서명
        (
            "stripe-signature: t=12345,v1=abcdef0123",
            "[REDACTED]",
            "abcdef0123",
        ),
        # client_secret (OAuth)
        (
            'client_secret="oauth-secret-yyy"',
            "[REDACTED]",
            "oauth-secret-yyy",
        ),
    ],
)
def test_redact_masks_sensitive_payload(raw, expected_substr, forbidden_substr):
    out = _redact(raw)
    assert expected_substr in out, out
    assert forbidden_substr not in out, out


def test_redact_preserves_non_sensitive_text():
    raw = "GET /api/v1/lectures 200 12.3ms"
    assert _redact(raw) == raw


# ── 포매터 통합 ───────────────────────────────────────────────────────────────


def _make_record(msg: str) -> logging.LogRecord:
    return logging.LogRecord(
        name="ifl.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg=msg,
        args=(),
        exc_info=None,
    )


def test_json_formatter_redacts():
    record = _make_record("got Authorization: Bearer leaky-token-123")
    out = JSONFormatter().format(record)
    parsed = json.loads(out)
    assert "leaky-token-123" not in parsed["msg"]
    assert "[REDACTED]" in parsed["msg"]


def test_text_formatter_redacts():
    record = _make_record('payload {"refresh_token": "should-not-appear"}')
    out = _RedactingTextFormatter("%(message)s").format(record)
    assert "should-not-appear" not in out
    assert "[REDACTED]" in out
