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
        """v0.4 (2026-06-01): count 만큼 별도 호출(N분할). 각 호출은 n=1."""
        edit = AsyncMock(return_value=_fake_edit_response(1))
        with (
            patch.object(settings, "OPENAI_IMAGE_MOCK", False),
            patch.object(settings, "PHOTO_AVATAR_INPUT_FIDELITY", "high"),
            _patch_async_openai(edit),
        ):
            out = await oi.generate_instructor_looks(
                b"img", "image/png", "researcher", "suit", "lab", "confident", "안경", 2
            )
        assert out == [b"fake-png-bytes", b"fake-png-bytes"]
        # count 만큼 호출됐다(이전엔 1번 호출 + n=count).
        assert edit.await_count == 2
        # 마지막 호출의 계약 검증 — input_fidelity·quality·model + n=1.
        kwargs = edit.await_args.kwargs
        assert kwargs["model"] == settings.OPENAI_IMAGE_MODEL
        assert kwargs["input_fidelity"] == "high"
        assert kwargs["quality"] == settings.PHOTO_AVATAR_IMAGE_QUALITY
        assert kwargs["n"] == 1, "v0.4: N 분할 호출이므로 각 요청은 n=1."

    @pytest.mark.asyncio
    async def test_pose_rotation_when_pose_is_none(self):
        """pose=None 이면 호출별 prompt 에 relaxed/crossed/gesturing 이 순환된다.

        회귀 가드(2026-06-01): 사용자 요청 "3장 중 하나는 정자세·하나는 팔짱·
        하나는 말하는 제스처" 의 핵심 동작.
        """
        edit = AsyncMock(return_value=_fake_edit_response(1))
        with (
            patch.object(settings, "OPENAI_IMAGE_MOCK", False),
            _patch_async_openai(edit),
        ):
            await oi.generate_instructor_looks(
                b"img", "image/png", "educator", None, None, None, None, 3,
                # pose 미지정 → rotation 발동.
            )
        assert edit.await_count == 3
        prompts = [call.kwargs["prompt"] for call in edit.await_args_list]
        # 각 호출의 prompt 에 해당 자세 키워드가 포함된다.
        assert "relaxed naturally at the sides" in prompts[0]  # _POSE_ROTATION[0]
        assert "arms crossed comfortably" in prompts[1]        # _POSE_ROTATION[1]
        assert "mid-gesture" in prompts[2]                     # _POSE_ROTATION[2]

    @pytest.mark.asyncio
    async def test_pose_explicit_applies_to_all_calls(self):
        """pose 가 명시되면 rotation 대신 모든 호출에 동일 적용(LookDetailModal 경로)."""
        edit = AsyncMock(return_value=_fake_edit_response(1))
        with (
            patch.object(settings, "OPENAI_IMAGE_MOCK", False),
            _patch_async_openai(edit),
        ):
            await oi.generate_instructor_looks(
                b"img", "image/png", "educator", None, None, None, None, 3,
                pose="holding_mic",
            )
        prompts = [call.kwargs["prompt"] for call in edit.await_args_list]
        # 3장 모두 holding_mic 키워드 포함, 다른 rotation 키워드는 들어가지 않음.
        assert all("handheld podcast microphone" in p for p in prompts)
        assert not any("arms crossed comfortably" in p for p in prompts)

    @pytest.mark.asyncio
    async def test_size_is_landscape_16_9_class(self):
        """2026-06-01 v2 회귀 가드: 1024x1024(정사각) → 1536x1024(3:2 가로) 전환.

        사용자 보고 "16:9 를 기대했는데 정사각으로 만들고 얼굴이 잘려 보인다" 에
        대한 조치 — gpt-image-2 가 지원하는 사이즈 중 16:9 에 가장 가까운 1536x1024
        로 고정.
        """
        edit = AsyncMock(return_value=_fake_edit_response(1))
        with (
            patch.object(settings, "OPENAI_IMAGE_MOCK", False),
            _patch_async_openai(edit),
        ):
            await oi.generate_instructor_looks(
                b"img", "image/png", "educator", None, None, None, None, 1
            )
        assert edit.await_args.kwargs["size"] == "1536x1024"

    @pytest.mark.asyncio
    async def test_input_fidelity_omitted_when_empty(self):
        """gpt-image-2 처럼 input_fidelity 미지원 모델용 — 빈 문자열이면 파라미터 자체를 안 보낸다.

        회귀 가드: 2026-06-01 프로덕션 사고 — gpt-image-2 + input_fidelity 조합이
        OpenAI 400 invalid_input_fidelity_model 로 거부돼 룩 생성이 전부 실패했다.
        """
        edit = AsyncMock(return_value=_fake_edit_response(1))
        with (
            patch.object(settings, "OPENAI_IMAGE_MOCK", False),
            patch.object(settings, "PHOTO_AVATAR_INPUT_FIDELITY", ""),
            _patch_async_openai(edit),
        ):
            await oi.generate_instructor_looks(
                b"img", "image/png", "educator", None, None, None, None, 1
            )
        kwargs = edit.await_args.kwargs
        assert "input_fidelity" not in kwargs, (
            "PHOTO_AVATAR_INPUT_FIDELITY 가 빈 문자열이면 파라미터를 보내지 않아야 한다 "
            "(gpt-image-2 호환)"
        )
        # 다른 필수 파라미터는 그대로 전달된다.
        assert kwargs["model"] == settings.OPENAI_IMAGE_MODEL
        assert kwargs["quality"] == settings.PHOTO_AVATAR_IMAGE_QUALITY

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
        # 숨은 규칙(face-only 보존·talking-head 프레이밍)이 항상 주입된다.
        # 2026-06-01: "Preserve" 어조를 "PRESERVE EXACTLY (face only)" 로 강화.
        assert "PRESERVE EXACTLY" in p
        assert "talking-head" in p

    def test_replace_directives_for_outfit_and_background(self):
        """outfit·background 가 'REPLACE ... entirely' 명령형으로 들어가야
        gpt-image-2 가 reference 사진의 원래 의상·배경을 덮어쓴다.
        (2026-06-01 회귀 가드: 옵션 미반영 사고.)"""
        p = oi.build_prompt("educator", "blazer", "lecture", None, None)
        assert "REPLACE the clothing entirely" in p
        assert "REPLACE the background entirely" in p

    def test_studio_means_broadcast_not_photo_backdrop(self):
        """배경=studio 는 사진관 배경이 아니라 팟캐스트/방송 스튜디오 (마이크/헤드폰/
        포음판 가시) 로 매핑돼야 한다(2026-06-01 사용자 보고 회귀 가드)."""
        p = oi.build_prompt("podcast_host", None, "studio", None, None)
        s = p.lower()
        assert "podcast" in s or "broadcast" in s
        assert "microphone" in s
        assert "acoustic" in s or "foam" in s
        # 이전 사진관 식 어휘는 들어가지 않아야 한다.
        assert "neutral grey studio backdrop" not in s
        assert "headshot context" not in s

    def test_framing_requires_waist_up_and_hands_visible(self):
        """프레이밍은 허리 위까지 + 두 손 보임을 강제해야 한다(사용자 '하단 짤림' 회귀 가드)."""
        p = oi.build_prompt("educator", None, None, None, None)
        s = p.lower()
        assert "waist-up" in s or "waist or hip" in s
        assert "hands" in s and "visible" in s

    def test_omits_directives_for_auto_options(self):
        """outfit/background/expression 이 None 이면 명령 블록을 생략한다 —
        모델이 persona 에 어울리게 알아서 채우게 둔다."""
        p = oi.build_prompt("educator", None, None, None, None)
        assert "REPLACE the clothing" not in p
        assert "REPLACE the background" not in p
        # persona·hidden rules 는 여전히 들어간다.
        assert "university professor" in p
        assert "PRESERVE EXACTLY" in p

    def test_prop_and_pose_inject_directives(self):
        """v0.3: prop·pose 가 주어지면 'INCLUDE in the scene'·'POSE the subject'
        명령으로 프롬프트에 들어간다."""
        p = oi.build_prompt(
            "educator", None, None, None, None,
            prop="mic_stand", pose="gesturing",
        )
        assert "INCLUDE in the scene" in p
        assert "podcast" in p.lower()  # mic_stand 설명에 podcast microphone 포함
        assert "POSE the subject" in p
        assert "mid-gesture" in p or "gesture" in p.lower()

    def test_holding_mic_pose_forces_handheld_mic(self):
        """holding_mic 자세는 핸드헬드 마이크 가시성까지 함께 강제한다
        (prop=mic_stand 가 따로 없어도)."""
        p = oi.build_prompt(
            "podcast_host", None, None, None, None, prop=None, pose="holding_mic",
        )
        # POSE 블록만 들어가고 prop 블록은 생략돼야 한다.
        assert "INCLUDE in the scene" not in p
        assert "POSE the subject" in p
        # 핸드헬드 마이크가 보여야 한다.
        assert "handheld" in p.lower()
        assert "microphone" in p.lower()

    def test_prop_pose_omitted_when_none(self):
        """prop=None, pose=None 이면 둘 다 명령 블록을 생략한다 (하위호환)."""
        p = oi.build_prompt("educator", None, None, None, None)
        assert "INCLUDE in the scene" not in p
        assert "POSE the subject" not in p

    def test_unknown_persona_falls_back_to_educator(self):
        p = oi.build_prompt("___nope___", None, None, None, None)
        assert "university professor" in p
