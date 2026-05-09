"""HEYGEN/ElevenLabs voice_gender 분기 헬퍼 단위 테스트.

``services/pipeline/heygen.py:pick_avatar_id`` 와
``services/pipeline/elevenlabs_client.py:pick_voice_id`` 의 매핑·fallback 동작을 검증.

분기 규칙 (config.py):
    gender == 'female'  → *_FEMALE   → 비면 deprecated 단일 ID
    gender == 'male'    → *_MALE     → 비면 deprecated 단일 ID
    gender is None      → male 취급
    그 외 문자열       → male 취급 (안전 fallback)

또한 lecture API 통합 테스트 — POST /api/lectures 에 voice_gender 를 넘기면
저장되고 응답에 포함되는지, 미지정 시 기본 male 인지.
"""
from __future__ import annotations

import pytest

from app.services.pipeline import elevenlabs_client, heygen
from tests.conftest import make_auth_header


# ── ElevenLabs.pick_voice_id ────────────────────────────────────────────────


def test_pick_voice_id_male_uses_male_env(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_MALE", "vid-male")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_FEMALE", "vid-female")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID", "vid-legacy")

    assert elevenlabs_client.pick_voice_id("male") == "vid-male"


def test_pick_voice_id_female_uses_female_env(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_MALE", "vid-male")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_FEMALE", "vid-female")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID", "vid-legacy")

    assert elevenlabs_client.pick_voice_id("female") == "vid-female"


def test_pick_voice_id_none_defaults_to_male(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_MALE", "vid-male")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_FEMALE", "vid-female")

    assert elevenlabs_client.pick_voice_id(None) == "vid-male"


def test_pick_voice_id_uppercase_normalised(monkeypatch):
    """대문자/공백이 섞여도 안전하게 정규화."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_MALE", "vid-male")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_FEMALE", "vid-female")

    assert elevenlabs_client.pick_voice_id("FEMALE") == "vid-female"
    assert elevenlabs_client.pick_voice_id(" Male ") == "vid-male"


def test_pick_voice_id_falls_back_to_legacy_when_male_blank(monkeypatch):
    """1단계 운영(_MALE 미설정)에서 deprecated 단일 ID 로 자동 fallback."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_MALE", "")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_FEMALE", "")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID", "vid-legacy")

    assert elevenlabs_client.pick_voice_id("male") == "vid-legacy"
    assert elevenlabs_client.pick_voice_id("female") == "vid-legacy"


def test_pick_voice_id_returns_empty_when_all_blank(monkeypatch):
    """모두 비면 빈 문자열 — 호출부 _voice_id_or_default 가 명시 raise 한다."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_MALE", "")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID_FEMALE", "")
    monkeypatch.setattr(settings, "ELEVENLABS_VOICE_ID", "")

    assert elevenlabs_client.pick_voice_id("female") == ""


# ── HeyGen.pick_avatar_id ───────────────────────────────────────────────────


def test_pick_avatar_id_male_uses_male_env(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "HEYGEN_AVATAR_ID_MALE", "avatar-male")
    monkeypatch.setattr(settings, "HEYGEN_AVATAR_ID_FEMALE", "avatar-female")
    monkeypatch.setattr(settings, "HEYGEN_AVATAR_ID", "avatar-legacy")

    assert heygen.pick_avatar_id("male") == "avatar-male"


def test_pick_avatar_id_female_uses_female_env(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "HEYGEN_AVATAR_ID_MALE", "avatar-male")
    monkeypatch.setattr(settings, "HEYGEN_AVATAR_ID_FEMALE", "avatar-female")
    monkeypatch.setattr(settings, "HEYGEN_AVATAR_ID", "avatar-legacy")

    assert heygen.pick_avatar_id("female") == "avatar-female"


def test_pick_avatar_id_falls_back_to_legacy(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "HEYGEN_AVATAR_ID_MALE", "")
    monkeypatch.setattr(settings, "HEYGEN_AVATAR_ID_FEMALE", "")
    monkeypatch.setattr(settings, "HEYGEN_AVATAR_ID", "avatar-legacy")

    assert heygen.pick_avatar_id("male") == "avatar-legacy"
    assert heygen.pick_avatar_id("female") == "avatar-legacy"


# ── 강의 API: voice_gender 저장/조회 ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_lecture_defaults_to_male(client, professor, course):
    """voice_gender 미지정 시 기본 'male'."""
    resp = await client.post(
        "/api/lectures",
        headers=make_auth_header(professor),
        json={
            "course_id": str(course.id),
            "title": "성별 미지정 강의",
            "order": 5,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["voice_gender"] == "male"


@pytest.mark.asyncio
async def test_create_lecture_with_female(client, professor, course):
    """voice_gender='female' 명시 시 그대로 저장·반환."""
    resp = await client.post(
        "/api/lectures",
        headers=make_auth_header(professor),
        json={
            "course_id": str(course.id),
            "title": "여성 보이스 강의",
            "order": 6,
            "voice_gender": "female",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["voice_gender"] == "female"


@pytest.mark.asyncio
async def test_patch_lecture_voice_gender(client, professor, lecture):
    """PATCH 로 voice_gender 만 변경 가능."""
    resp = await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(professor),
        json={"voice_gender": "female"},
    )
    assert resp.status_code == 200
    assert resp.json()["voice_gender"] == "female"
