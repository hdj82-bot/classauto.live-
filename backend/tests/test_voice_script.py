"""본인 음성 녹음용 대본 생성 — 서비스/엔드포인트 테스트.

Anthropic(Claude) 호출은 모두 mock. 실제 네트워크·크레딧 소모 없음.
서비스 단위에서 형식(마크다운/병음 제거)·모델·온도·예외 변환을, 엔드포인트
단위에서 보호(require_professor)·계약 형식·키 미설정 503 을 검증한다.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import anthropic
import pytest

from app.core.config import settings
from app.services.voice_script import (
    VoiceScriptError,
    _SYSTEM_BLOCKS,
    generate_voice_script,
)
from tests.conftest import make_auth_header

_PATCH_TARGET = "app.services.voice_script.anthropic.Anthropic"


def _mock_response(text: str, *, input_tokens: int = 900, output_tokens: int = 320):
    """anthropic 응답을 흉내내는 가벼운 mock(content + usage)."""
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(
            input_tokens=input_tokens, output_tokens=output_tokens
        ),
    )


def _mock_client(response=None, *, side_effect=None) -> MagicMock:
    client = MagicMock()
    if side_effect is not None:
        client.messages.create.side_effect = side_effect
    else:
        client.messages.create.return_value = response
    return client


class _FakeAPIError(anthropic.APIError):
    """no-arg 생성이 가능한 anthropic.APIError — base APIError 라 재시도 대상 아님."""

    def __init__(self) -> None:  # noqa: D107 - super().__init__ 는 request/body 필요
        self.message = "boom"

    def __str__(self) -> str:
        return self.message


# ── 서비스 단위 ───────────────────────────────────────────────────────────────


def test_returns_sanitized_plain_text():
    """마크다운·한자 뒤 병음 괄호가 제거된 평문을 반환한다."""
    dirty = "## 도입\n\n학문은 **중요**합니다. 우리는 他(tā)를 봅니다.\n- 항목"
    client = _mock_client(_mock_response(dirty))
    with patch(_PATCH_TARGET, return_value=client):
        out = generate_voice_script("중국어 어순")

    assert "**" not in out  # 굵게 마커 제거
    assert "#" not in out  # 헤딩 마커 제거
    assert "- 항목" not in out and "항목" in out  # 목록 마커만 제거, 내용 보존
    assert "tā" not in out  # 병음 괄호 제거
    assert "他" in out  # 한자는 보존
    assert "학문은 중요합니다" in out


def test_topic_included_in_user_prompt():
    """topic 이 주어지면 user 프롬프트에 그 주제가 포함된다."""
    client = _mock_client(_mock_response("좋은 학술 산문입니다."))
    with patch(_PATCH_TARGET, return_value=client):
        generate_voice_script("양자역학 입문")

    content = client.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "양자역학 입문" in content


def test_general_prose_when_no_topic():
    """topic 이 비면 일반 학술문 프롬프트로 생성한다(예외 없음)."""
    client = _mock_client(_mock_response("일반 학술 산문입니다."))
    with patch(_PATCH_TARGET, return_value=client):
        out = generate_voice_script(None)

    assert out == "일반 학술 산문입니다."
    msg = client.messages.create.call_args.kwargs["messages"][0]
    assert msg["role"] == "user"
    assert "학술 산문" in msg["content"]  # 일반문 프롬프트 신호
    assert "500자" in msg["content"]  # ~500자 길이 지시


def test_call_uses_policy_model_and_variation():
    """모델은 정책값(SCRIPT_MODEL=Haiku), 변형 위해 temperature=1.0, system 캐시 블록."""
    client = _mock_client(_mock_response("학술 산문."))
    with patch(_PATCH_TARGET, return_value=client):
        generate_voice_script("주제")

    kwargs = client.messages.create.call_args.kwargs
    assert kwargs["model"] == settings.SCRIPT_MODEL
    assert kwargs["temperature"] == 1.0
    assert kwargs["max_tokens"] == settings.SCRIPT_MAX_TOKENS
    assert kwargs["system"] == _SYSTEM_BLOCKS
    assert isinstance(kwargs["system"], list)
    assert kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}


def test_varies_between_calls():
    """같은 topic 이라도 호출마다 프롬프트(서술 각도)가 달라질 수 있다."""
    client = _mock_client(_mock_response("산문."))
    prompts: set[str] = set()
    with patch(_PATCH_TARGET, return_value=client):
        # 무작위 각도라 충분히 반복하면 2종 이상 나온다(결정적 보장은 아님 →
        # 각도 풀이 6개라 20회면 사실상 항상 2종 이상).
        for _ in range(20):
            generate_voice_script("동일 주제")
            prompts.add(client.messages.create.call_args.kwargs["messages"][0]["content"])
    assert len(prompts) >= 2


def test_empty_content_raises():
    """빈 응답(content 없음)은 VoiceScriptError."""
    client = _mock_client(SimpleNamespace(content=[], usage=None))
    with patch(_PATCH_TARGET, return_value=client):
        with pytest.raises(VoiceScriptError):
            generate_voice_script("주제")


def test_api_error_wrapped():
    """anthropic.APIError 는 VoiceScriptError 로 변환된다(재시도 소진 후)."""
    client = _mock_client(side_effect=_FakeAPIError())
    with patch(_PATCH_TARGET, return_value=client):
        with pytest.raises(VoiceScriptError):
            generate_voice_script("주제")


# ── 엔드포인트 ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_endpoint_returns_script(client, professor, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    anth = _mock_client(_mock_response("녹음용 학술 산문입니다. " * 10))
    with patch(_PATCH_TARGET, return_value=anth):
        resp = await client.post(
            "/api/avatars/me/voice/script",
            json={"topic": "중국어 교수법"},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "script" in data
    assert isinstance(data["script"], str)
    assert data["script"].strip()


@pytest.mark.asyncio
async def test_endpoint_topic_optional(client, professor, monkeypatch):
    """body 없이도(또는 topic 생략) 일반 학술문으로 200 응답."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    anth = _mock_client(_mock_response("일반 학술 산문입니다."))
    with patch(_PATCH_TARGET, return_value=anth):
        resp = await client.post(
            "/api/avatars/me/voice/script",
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    assert resp.json()["script"] == "일반 학술 산문입니다."


@pytest.mark.asyncio
async def test_endpoint_requires_professor(client, student, monkeypatch):
    """학생 토큰은 거부(require_professor)."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    resp = await client.post(
        "/api/avatars/me/voice/script",
        json={"topic": "x"},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_endpoint_503_without_api_key(client, professor, monkeypatch):
    """ANTHROPIC_API_KEY 미설정이면 503 으로 명확히 응답."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    resp = await client.post(
        "/api/avatars/me/voice/script",
        json={"topic": "x"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_endpoint_502_on_generation_failure(client, professor, monkeypatch):
    """대본 생성 실패(APIError)는 502 로 표면화."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    anth = _mock_client(side_effect=_FakeAPIError())
    with patch(_PATCH_TARGET, return_value=anth):
        resp = await client.post(
            "/api/avatars/me/voice/script",
            json={"topic": "x"},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 502
