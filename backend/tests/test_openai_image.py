"""openai_image — gpt-image-2 룩 생성 서비스 단위 테스트.

외부 호출 없이 검증한다:
  - OPENAI_IMAGE_MOCK 경로(더미 PNG count 개 / count<1 → []).
  - 실제 경로의 예외 매핑: 모더레이션 거부 → OpenAIModerationRefused,
    그 외 OpenAI 오류 → OpenAIImageError.
  - build_prompt 가 persona 매핑 + 숨은 HeyGen 규칙을 포함.
"""
from __future__ import annotations

import base64
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import openai
import pytest

from app.core.config import settings
from app.services.pipeline import openai_image as oi


def _fake_edit_response(n: int):
    """images.edit 의 반환을 흉내내는 객체 — data[].b64_json + usage."""
    item = MagicMock()
    item.b64_json = base64.b64encode(b"fake-png-bytes").decode()
    resp = MagicMock()
    resp.data = [item for _ in range(n)]
    resp.usage = MagicMock(input_tokens=10, output_tokens=20, total_tokens=30)
    return resp


def _patch_async_openai(edit_mock: AsyncMock):
    """openai.AsyncOpenAI() → images.edit 가 edit_mock 인 가짜 클라이언트로 패치."""
    client = MagicMock()
    client.images.edit = edit_mock
    return patch.object(oi.openai, "AsyncOpenAI", return_value=client)


# ── MOCK 경로 ─────────────────────────────────────────────────────────────────


class TestMockPath:
    @pytest.mark.asyncio
    async def test_returns_count_dummy_images(self):
        with patch.object(settings, "OPENAI_IMAGE_MOCK", True):
            out = await oi.generate_instructor_looks(
                b"img", "image/jpeg", "educator", "blazer", "lecture", "warm", None, 3
            )
        assert len(out) == 3
        # 더미는 유효한 PNG magic 으로 시작.
        assert all(b.startswith(b"\x89PNG") for b in out)

    @pytest.mark.asyncio
    async def test_count_below_one_returns_empty(self):
        with patch.object(settings, "OPENAI_IMAGE_MOCK", True):
            out = await oi.generate_instructor_looks(
                b"img", "image/jpeg", "educator", None, None, None, None, 0
            )
        assert out == []


# ── 실제 경로(클라이언트 모킹) ────────────────────────────────────────────────


class TestRealCall:
    @pytest.mark.asyncio
    async def test_decodes_b64_to_bytes(self):
        edit = AsyncMock(return_value=_fake_edit_response(2))
        with patch.object(settings, "OPENAI_IMAGE_MOCK", False), _patch_async_openai(edit):
            out = await oi.generate_instructor_looks(
                b"img", "image/png", "researcher", "suit", "lab", "confident", "안경", 2
            )
        assert out == [b"fake-png-bytes", b"fake-png-bytes"]
        edit.assert_awaited_once()
        # 계약: input_fidelity·quality·model 을 settings 에서 전달.
        kwargs = edit.await_args.kwargs
        assert kwargs["model"] == settings.OPENAI_IMAGE_MODEL
        assert kwargs["input_fidelity"] == settings.PHOTO_AVATAR_INPUT_FIDELITY
        assert kwargs["quality"] == settings.PHOTO_AVATAR_IMAGE_QUALITY
        assert kwargs["n"] == 2

    @pytest.mark.asyncio
    async def test_moderation_refusal_maps_to_specific_error(self):
        req = httpx.Request("POST", "https://api.openai.com/v1/images/edits")
        resp = httpx.Response(400, request=req)
        err = openai.BadRequestError(
            "Your request was rejected: moderation_blocked",
            response=resp,
            body={"error": {"code": "moderation_blocked"}},
        )
        edit = AsyncMock(side_effect=err)
        with patch.object(settings, "OPENAI_IMAGE_MOCK", False), _patch_async_openai(edit):
            with pytest.raises(oi.OpenAIModerationRefused):
                await oi.generate_instructor_looks(
                    b"img", "image/jpeg", "educator", None, None, None, None, 1
                )

    @pytest.mark.asyncio
    async def test_bad_request_non_moderation_maps_to_image_error(self):
        req = httpx.Request("POST", "https://api.openai.com/v1/images/edits")
        resp = httpx.Response(400, request=req)
        err = openai.BadRequestError(
            "invalid size parameter", response=resp, body={"error": {"code": "invalid_request"}}
        )
        edit = AsyncMock(side_effect=err)
        with patch.object(settings, "OPENAI_IMAGE_MOCK", False), _patch_async_openai(edit):
            with pytest.raises(oi.OpenAIImageError):
                await oi.generate_instructor_looks(
                    b"img", "image/jpeg", "educator", None, None, None, None, 1
                )

    @pytest.mark.asyncio
    async def test_generic_api_error_maps_to_image_error(self):
        req = httpx.Request("POST", "https://api.openai.com/v1/images/edits")
        err = openai.APIError("upstream boom", request=req, body=None)
        edit = AsyncMock(side_effect=err)
        with patch.object(settings, "OPENAI_IMAGE_MOCK", False), _patch_async_openai(edit):
            with pytest.raises(oi.OpenAIImageError):
                await oi.generate_instructor_looks(
                    b"img", "image/jpeg", "educator", None, None, None, None, 1
                )

    @pytest.mark.asyncio
    async def test_empty_response_raises(self):
        empty = MagicMock()
        empty.data = []
        empty.usage = None
        edit = AsyncMock(return_value=empty)
        with patch.object(settings, "OPENAI_IMAGE_MOCK", False), _patch_async_openai(edit):
            with pytest.raises(oi.OpenAIImageError):
                await oi.generate_instructor_looks(
                    b"img", "image/jpeg", "educator", None, None, None, None, 1
                )


# ── build_prompt ─────────────────────────────────────────────────────────────


class TestBuildPrompt:
    def test_includes_persona_outfit_background_and_hidden_rules(self):
        p = oi.build_prompt("researcher", "suit", "lab", "confident", "검은 뿔테 안경")
        assert "researcher" in p
        assert "business suit" in p
        assert "laboratory" in p
        assert "검은 뿔테 안경" in p
        # 숨은 규칙(정체성·talking-head 프레이밍)이 항상 주입된다.
        assert "Preserve the exact same person" in p
        assert "talking-head" in p

    def test_unknown_persona_falls_back_to_educator(self):
        p = oi.build_prompt("___nope___", None, None, None, None)
        assert "university professor" in p
