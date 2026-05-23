"""translator 모듈 단위 테스트 — Claude 1순위 + 폴백 (Mock).

실제 API 연동 검증은 test_external_apis.py(@pytest.mark.external) 참고.
여기서는 provider 선택 로직과 JSON 파싱만 검증한다.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.core.config import settings
from app.services.pipeline import translator as T


def _fake_claude(json_text: str) -> MagicMock:
    """anthropic.Anthropic 를 흉내내, messages.create 가 주어진 텍스트를 반환."""
    response = SimpleNamespace(content=[SimpleNamespace(type="text", text=json_text)])
    client = MagicMock()
    client.messages.create.return_value = response
    factory = MagicMock(return_value=client)
    return factory


# ── _parse_json_array ─────────────────────────────────────────────────────────

def test_parse_json_array_plain():
    assert T._parse_json_array('[{"id": 0, "text": "你好"}]') == [
        {"id": 0, "text": "你好"}
    ]


def test_parse_json_array_fenced():
    raw = '```json\n[{"id": 0, "text": "你好"}]\n```'
    assert T._parse_json_array(raw) == [{"id": 0, "text": "你好"}]


def test_parse_json_array_with_preamble():
    raw = 'Here is the result:\n[{"id": 0, "text": "你好"}]'
    assert T._parse_json_array(raw) == [{"id": 0, "text": "你好"}]


def test_parse_json_array_rejects_non_array():
    with pytest.raises(ValueError):
        T._parse_json_array('{"id": 0}')


# ── translate_batch: Claude 1순위 ─────────────────────────────────────────────

def test_translate_batch_uses_claude_first(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test", raising=False)
    factory = _fake_claude('[{"id": 0, "text": "你好"}, {"id": 1, "text": "再见"}]')

    with patch("anthropic.Anthropic", factory):
        results = T.translate_batch(["안녕", "잘 가"], "zh", "ko")

    assert [r.text for r in results] == ["你好", "再见"]
    assert all(r.provider == "claude" for r in results)
    # 단일 호출이어야 한다 — 세그먼트 수만큼 부르면 안 됨.
    factory.return_value.messages.create.assert_called_once()


def test_translate_batch_preserves_order_by_id(monkeypatch):
    """모델이 순서를 뒤섞어 돌려줘도 id 로 재정렬해야 한다."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test", raising=False)
    factory = _fake_claude('[{"id": 1, "text": "B"}, {"id": 0, "text": "A"}]')

    with patch("anthropic.Anthropic", factory):
        results = T.translate_batch(["가", "나"], "en", "ko")

    assert [r.text for r in results] == ["A", "B"]


def test_translate_batch_falls_back_on_count_mismatch(monkeypatch):
    """Claude 가 개수를 틀리면 예외 → DeepL/Google 폴백."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test", raising=False)
    monkeypatch.setattr(settings, "DEEPL_API_KEY", "", raising=False)
    factory = _fake_claude('[{"id": 0, "text": "only one"}]')  # 2개 보냈는데 1개

    fake_google = MagicMock(
        side_effect=lambda t, tl, sl: T.TranslationResult(
            text=f"g:{t}", source_lang=sl, target_lang=tl, provider="google"
        )
    )
    with patch("anthropic.Anthropic", factory), patch.object(
        T, "_translate_google", fake_google
    ):
        results = T.translate_batch(["가", "나"], "en", "ko")

    assert [r.provider for r in results] == ["google", "google"]
    assert [r.text for r in results] == ["g:가", "g:나"]


def test_translate_batch_empty_returns_empty(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test", raising=False)
    assert T.translate_batch([], "zh", "ko") == []
