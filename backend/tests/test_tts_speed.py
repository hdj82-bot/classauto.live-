"""tts.py 발화 속도 후처리(ffmpeg atempo) 단위 테스트.

ffmpeg 바이너리에 의존하지 않도록 ``_apply_atempo`` 는 monkeypatch 하고, 순수
헬퍼(``_provider_native_speed`` / ``_atempo_chain``)와 ``_postprocess_speed`` 의
분기(잔여≈1 → 후처리 생략 / 초과 → ffmpeg 호출)만 검증한다.
"""
from __future__ import annotations

from app.services.pipeline import tts


def test_provider_native_speed_clamps_per_provider():
    # ElevenLabs voice_settings.speed 는 0.7~1.2 로 클램프된다.
    assert tts._provider_native_speed(2.0, "elevenlabs") == 1.2
    assert tts._provider_native_speed(1.3, "elevenlabs") == 1.2
    assert tts._provider_native_speed(0.5, "elevenlabs") == 0.7
    assert tts._provider_native_speed(1.0, "elevenlabs") == 1.0
    # Google speaking_rate 는 0.25~4.0 → 우리 사용 범위(0.7~2.0)는 그대로.
    assert tts._provider_native_speed(2.0, "google_tts") == 2.0
    # 알 수 없는 provider 는 변환 없이 그대로.
    assert tts._provider_native_speed(1.7, "other") == 1.7


def test_atempo_chain_single_and_chained():
    assert tts._atempo_chain(1.667) == "atempo=1.667"
    assert tts._atempo_chain(1.0) == "atempo=1.0"
    # 단일 atempo 유효범위(0.5~2.0) 밖은 곱으로 분해.
    assert tts._atempo_chain(3.0) == "atempo=2.0,atempo=1.5"


async def test_postprocess_speed_skips_when_provider_covers_target(monkeypatch):
    called = {"n": 0}

    def _fake_apply(audio, factor):  # noqa: ARG001
        called["n"] += 1
        return b"changed"

    monkeypatch.setattr(tts, "_apply_atempo", _fake_apply)
    # 1.0× (ElevenLabs 가 네이티브로 적용) → 잔여≈1 → ffmpeg 미호출, 원본 유지.
    assert await tts._postprocess_speed(b"orig", 1.0, "elevenlabs") == b"orig"
    # speed 미지정 → 미호출.
    assert await tts._postprocess_speed(b"orig", None, "elevenlabs") == b"orig"
    assert called["n"] == 0


async def test_postprocess_speed_invokes_ffmpeg_above_native(monkeypatch):
    captured = {}

    def _fake_apply(audio, factor):  # noqa: ARG001
        captured["factor"] = factor
        return b"sped"

    monkeypatch.setattr(tts, "_apply_atempo", _fake_apply)
    # 2.0× 목표, ElevenLabs 네이티브 1.2× → 잔여 1.667× 만큼 ffmpeg 가속.
    assert await tts._postprocess_speed(b"orig", 2.0, "elevenlabs") == b"sped"
    assert round(captured["factor"], 3) == round(2.0 / 1.2, 3)
