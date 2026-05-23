"""translator 모듈 단위 테스트 — Claude 슬라이드별 병렬 + 폴백 (Mock).

실제 API 연동 검증은 test_external_apis.py(@pytest.mark.external) 참고.
여기서는 provider 선택·순서 보존·폴백 차단 로직을 검증한다.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import anthropic
import httpx
import pytest

from app.core.config import settings
from app.services.pipeline import translator as T


def _fake_anthropic(translate=lambda t: f"zh:{t}") -> MagicMock:
    """anthropic.Anthropic 흉내 — messages.create 가 user 텍스트를 translate() 한 결과 반환.

    세그먼트별로 다른 입력이 오므로 입력 텍스트 기반으로 응답을 만든다.
    """
    def create(model, max_tokens, system, messages):
        text = messages[0]["content"]
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=translate(text))])

    client = MagicMock()
    client.messages.create.side_effect = create
    return MagicMock(return_value=client)


# ── Claude 슬라이드별 병렬 번역 ────────────────────────────────────────────────


def test_translate_batch_uses_claude_per_segment(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test", raising=False)
    factory = _fake_anthropic()

    with patch("anthropic.Anthropic", factory):
        results = T.translate_batch(["안녕", "잘 가"], "zh", "ko")

    assert [r.text for r in results] == ["zh:안녕", "zh:잘 가"]
    assert all(r.provider == "claude" for r in results)
    # 세그먼트당 1회씩 — 2개면 2회 호출(병렬).
    assert factory.return_value.messages.create.call_count == 2


def test_translate_batch_preserves_order(monkeypatch):
    """병렬 완료 순서와 무관하게 입력 순서대로 결과를 돌려줘야 한다."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test", raising=False)
    factory = _fake_anthropic(translate=lambda t: t.upper())

    with patch("anthropic.Anthropic", factory):
        results = T.translate_batch(["a", "b", "c", "d"], "en", "ko")

    assert [r.text for r in results] == ["A", "B", "C", "D"]


def test_translate_batch_empty_segment_skips_call(monkeypatch):
    """빈 세그먼트는 호출 없이 빈 문자열로 자리만 채운다(위치 보존)."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test", raising=False)
    factory = _fake_anthropic()

    with patch("anthropic.Anthropic", factory):
        results = T.translate_batch(["안녕", "  ", "끝"], "zh", "ko")

    assert [r.text for r in results] == ["zh:안녕", "", "zh:끝"]
    # 빈 세그먼트는 API 미호출 → 2회만.
    assert factory.return_value.messages.create.call_count == 2


def test_translate_batch_empty_list(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test", raising=False)
    assert T.translate_batch([], "zh", "ko") == []


# ── 폴백 차단 (hang 방지) ──────────────────────────────────────────────────────


def test_claude_failure_without_google_raises_fast(monkeypatch):
    """Claude 실패 + Google 비활성 → 즉시 RuntimeError (Google Client() hang 방지)."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test", raising=False)
    monkeypatch.setattr(settings, "DEEPL_API_KEY", "", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_TRANSLATE_ENABLED", False, raising=False)

    factory = _fake_anthropic(translate=lambda t: (_ for _ in ()).throw(RuntimeError("boom")))
    google = MagicMock()
    with patch("anthropic.Anthropic", factory), patch.object(T, "_translate_google", google):
        with pytest.raises(RuntimeError):
            T.translate_batch(["가", "나"], "zh", "ko")

    # Google 은 절대 호출되지 않아야 한다(미구성 시 hang 위험).
    google.assert_not_called()


def test_claude_retries_on_transient_error(monkeypatch):
    """429(rate_limit)·연결오류 등 일시 오류는 retry_external 백오프로 재시도된다.

    동시 연결 수 초과(429) 가 이 경로로 흡수되는 것이 이번 수정의 핵심.
    """
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test", raising=False)
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    calls = {"n": 0}

    def create(model, max_tokens, system, messages):
        calls["n"] += 1
        if calls["n"] == 1:  # 첫 시도는 일시 오류 → 재시도되어야 함
            raise anthropic.APIConnectionError(message="boom", request=req)
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text="zh:" + messages[0]["content"])]
        )

    client = MagicMock()
    client.messages.create.side_effect = create
    factory = MagicMock(return_value=client)

    # 백오프 sleep 은 패치해 테스트를 빠르게.
    with patch("anthropic.Anthropic", factory), patch("app.core.retry.time.sleep"):
        results = T.translate_batch(["안녕"], "zh", "ko")

    assert results[0].text == "zh:안녕"
    assert calls["n"] == 2  # 1회 실패 후 재시도 성공


def test_claude_failure_with_google_enabled_falls_back(monkeypatch):
    """Claude 실패 + Google 활성 → Google 폴백 사용."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test", raising=False)
    monkeypatch.setattr(settings, "DEEPL_API_KEY", "", raising=False)
    monkeypatch.setattr(settings, "GOOGLE_TRANSLATE_ENABLED", True, raising=False)

    factory = _fake_anthropic(translate=lambda t: (_ for _ in ()).throw(RuntimeError("boom")))
    fake_google = MagicMock(
        side_effect=lambda t, tl, sl: T.TranslationResult(
            text=f"g:{t}", source_lang=sl, target_lang=tl, provider="google"
        )
    )
    with patch("anthropic.Anthropic", factory), patch.object(T, "_translate_google", fake_google):
        results = T.translate_batch(["가", "나"], "en", "ko")

    assert [r.provider for r in results] == ["google", "google"]
    assert [r.text for r in results] == ["g:가", "g:나"]
