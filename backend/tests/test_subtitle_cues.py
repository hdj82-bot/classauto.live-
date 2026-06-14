"""자막 정밀 싱크 cue 생성 단위 테스트.

- ``tts._cues_from_alignment``: Forced Alignment(글자별 시각) → 문장 cue 변환(순수).
- ``tts.synthesize(with_alignment=True)``: 정렬 호출·성공/실패 degrade 흐름.
- ``SUBTITLE_ALIGNMENT_ENABLED`` False 면 정렬 호출 자체를 건너뜀.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.core.config import settings
from app.services.pipeline import elevenlabs_client
from app.services.pipeline.tts import _cues_from_alignment, synthesize


def _alignment(chars: list[tuple[str, float, float]]) -> dict:
    return {
        "characters": [
            {"text": t, "start": s, "end": e} for (t, s, e) in chars
        ]
    }


# ── _cues_from_alignment (순수 변환) ─────────────────────────────────────────


def test_cues_split_on_terminal_punctuation():
    # "你好。再见。" → 두 문장 cue, 각 종결부호 끝 시각에서 닫힌다.
    align = _alignment(
        [
            ("你", 0.0, 0.4),
            ("好", 0.4, 0.8),
            ("。", 0.8, 1.0),
            ("再", 1.0, 1.4),
            ("见", 1.4, 1.8),
            ("。", 1.8, 2.0),
        ]
    )
    cues = _cues_from_alignment(align)
    assert cues == [
        {"start": 0.0, "end": 1.0, "text": "你好。"},
        {"start": 1.0, "end": 2.0, "text": "再见。"},
    ]


def test_cues_leading_space_not_counted_in_start():
    # 문장 사이 공백은 다음 cue 시작 시각에 포함하지 않는다(첫 실제 글자 기준).
    align = _alignment(
        [
            ("A", 0.0, 0.5),
            (".", 0.5, 0.6),
            (" ", 0.6, 0.9),
            ("B", 0.9, 1.4),
            (".", 1.4, 1.5),
        ]
    )
    cues = _cues_from_alignment(align)
    assert cues[0] == {"start": 0.0, "end": 0.6, "text": "A."}
    assert cues[1]["start"] == 0.9  # 공백(0.6) 아님
    assert cues[1]["text"] == "B."


def test_cues_flush_trailing_without_terminator():
    # 마지막 문장이 종결부호 없이 끝나도 버퍼를 cue 로 닫는다.
    align = _alignment([("끝", 0.0, 0.5), ("말", 0.5, 1.0)])
    cues = _cues_from_alignment(align)
    assert cues == [{"start": 0.0, "end": 1.0, "text": "끝말"}]


def test_cues_empty_or_malformed_alignment_returns_empty():
    assert _cues_from_alignment({}) == []
    assert _cues_from_alignment({"characters": []}) == []
    assert _cues_from_alignment({"characters": "nope"}) == []
    # start/end 가 None 인 글자는 건너뛴다 → 남는 cue 없음.
    assert _cues_from_alignment(
        {"characters": [{"text": "x", "start": None, "end": None}]}
    ) == []


# ── synthesize(with_alignment=...) 흐름 ──────────────────────────────────────


@pytest.mark.asyncio
async def test_synthesize_with_alignment_attaches_cues():
    align = _alignment([("안", 0.0, 0.5), ("녕", 0.5, 1.0), ("。", 1.0, 1.2)])
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        return_value=b"audio",
    ), patch.object(
        elevenlabs_client, "align_forced", new_callable=AsyncMock,
        return_value=align,
    ) as align_mock:
        result = await synthesize("안녕。", with_alignment=True)

    align_mock.assert_awaited_once()
    assert result.subtitle_cues == [{"start": 0.0, "end": 1.2, "text": "안녕。"}]


@pytest.mark.asyncio
async def test_synthesize_without_flag_does_not_align():
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        return_value=b"audio",
    ), patch.object(
        elevenlabs_client, "align_forced", new_callable=AsyncMock,
    ) as align_mock:
        result = await synthesize("안녕。")  # with_alignment 기본 False

    align_mock.assert_not_awaited()
    assert result.subtitle_cues is None


@pytest.mark.asyncio
async def test_synthesize_alignment_failure_degrades_to_none():
    # 정렬 실패는 cues=None 으로 degrade — 합성 결과(audio)는 정상 반환.
    with patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        return_value=b"audio",
    ), patch.object(
        elevenlabs_client, "align_forced", new_callable=AsyncMock,
        side_effect=elevenlabs_client.ElevenLabsServerError("boom"),
    ):
        result = await synthesize("안녕。", with_alignment=True)

    assert result.audio_bytes == b"audio"
    assert result.subtitle_cues is None


@pytest.mark.asyncio
async def test_synthesize_alignment_disabled_by_setting():
    with patch.object(settings, "SUBTITLE_ALIGNMENT_ENABLED", False), patch.object(
        elevenlabs_client, "synthesize", new_callable=AsyncMock,
        return_value=b"audio",
    ), patch.object(
        elevenlabs_client, "align_forced", new_callable=AsyncMock,
    ) as align_mock:
        result = await synthesize("안녕。", with_alignment=True)

    align_mock.assert_not_awaited()
    assert result.subtitle_cues is None
