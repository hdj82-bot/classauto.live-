"""음성·자막 기능 테스트.

- GET /api/voices (ElevenLabs 보이스 목록, 장애 시 빈 목록 degrade)
- POST /api/videos/{id}/subtitle/translate (발화 → 자막 번역)
- PATCH /api/videos/{id}/subtitle (슬라이드별 자막 편집)
- PATCH /api/lectures/{id} (voice_lang / subtitle_lang / voice_id 저장)
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.models.video import VideoStatus
from tests.conftest import make_auth_header

# ElevenLabs list_voices() raw dict (premade 1개).
_FAKE_VOICES = [
    {
        "voice_id": "v_yuna",
        "name": "Yuna",
        "category": "premade",
        "preview_url": "https://el.example/yuna.mp3",
        "labels": {"gender": "female", "accent": "korean"},
    },
    {
        # voice_id 없는 항목은 스킵돼야 한다.
        "name": "broken",
        "labels": {},
    },
]


def _fake_translate_batch(texts, target_lang, source_lang="ko"):
    return [SimpleNamespace(text=f"[{target_lang}] {t}") for t in texts]


# ── GET /api/voices ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_voices_maps_labels(client, professor):
    with patch(
        "app.services.pipeline.elevenlabs_client.list_voices",
        new=AsyncMock(return_value=_FAKE_VOICES),
    ):
        resp = await client.get("/api/voices", headers=make_auth_header(professor))
    assert resp.status_code == 200
    data = resp.json()
    # voice_id 없는 항목은 제외 → 1개.
    assert data["total"] == 1
    v = data["voices"][0]
    assert v["voice_id"] == "v_yuna"
    assert v["name"] == "Yuna"
    assert v["gender"] == "female"
    assert v["accent"] == "korean"
    assert v["preview_url"] == "https://el.example/yuna.mp3"
    # 한국어 표기.
    assert v["display_name"] == "Yuna"
    assert v["gender_ko"] == "여성"
    assert v["accent_ko"] == "한국"


@pytest.mark.asyncio
async def test_list_voices_korean_split_and_translation(client, professor):
    """'고유명 - 설명' 분리 + 설명 한국어 번역 + 국적 한국어."""
    fake = [
        {
            "voice_id": "v_charlie",
            "name": "Charlie - Deep, Confident, Energetic",
            "category": "premade",
            "preview_url": "https://el.example/charlie.mp3",
            "labels": {"gender": "male", "accent": "australian"},
        }
    ]

    def fake_batch(texts, target_lang, source_lang="ko"):
        return [SimpleNamespace(text="깊고 자신감 있으며 활기찬") for _ in texts]

    with patch(
        "app.services.pipeline.elevenlabs_client.list_voices",
        new=AsyncMock(return_value=fake),
    ), patch(
        "app.services.pipeline.translator.translate_batch",
        new=fake_batch,
    ):
        resp = await client.get("/api/voices", headers=make_auth_header(professor))
    assert resp.status_code == 200
    v = resp.json()["voices"][0]
    assert v["display_name"] == "Charlie"
    assert v["gender_ko"] == "남성"
    assert v["accent_ko"] == "호주"
    assert v["description_ko"] == "깊고 자신감 있으며 활기찬"


@pytest.mark.asyncio
async def test_list_voices_degrades_to_empty_on_error(client, professor):
    from app.services.pipeline.elevenlabs_client import ElevenLabsAuthError

    with patch(
        "app.services.pipeline.elevenlabs_client.list_voices",
        new=AsyncMock(side_effect=ElevenLabsAuthError("키 없음")),
    ):
        resp = await client.get("/api/voices", headers=make_auth_header(professor))
    # 보이스 선택은 보조 기능 — 장애여도 패널이 깨지지 않게 빈 목록 200.
    assert resp.status_code == 200
    assert resp.json() == {"voices": [], "total": 0}


@pytest.mark.asyncio
async def test_list_voices_requires_professor(client, student):
    resp = await client.get("/api/voices", headers=make_auth_header(student))
    assert resp.status_code in (401, 403)


# ── POST /api/videos/{id}/subtitle/translate ──────────────────────────────────


@pytest.mark.asyncio
async def test_translate_subtitle_populates_per_slide(client, professor, video_pending):
    with patch(
        "app.services.pipeline.translator.translate_batch",
        new=_fake_translate_batch,
    ):
        resp = await client.post(
            f"/api/videos/{video_pending.id}/subtitle/translate",
            headers=make_auth_header(professor),
            params={"target_lang": "en"},
        )
    assert resp.status_code == 200
    data = resp.json()
    subs = data["subtitle_segments"]
    assert subs is not None
    assert len(subs) == 2
    assert subs[0]["slide_index"] == 0
    assert subs[0]["text"] == "[en] 안녕하세요, 오늘은 파이썬을 배웁니다."
    assert subs[1]["slide_index"] == 1
    # GET 으로도 자막이 따라오는지 확인.
    get_resp = await client.get(
        f"/api/videos/{video_pending.id}/script",
        headers=make_auth_header(professor),
    )
    assert get_resp.json()["subtitle_segments"][0]["text"].startswith("[en]")


@pytest.mark.asyncio
async def test_translate_subtitle_rendering_locked(client, professor, db, lecture):
    from app.models.video import Video, VideoScript

    v = Video(lecture_id=lecture.id, status=VideoStatus.rendering)
    db.add(v)
    await db.flush()
    db.add(VideoScript(video_id=v.id, segments=[], ai_segments=[]))
    await db.flush()

    with patch(
        "app.services.pipeline.translator.translate_batch",
        new=_fake_translate_batch,
    ):
        resp = await client.post(
            f"/api/videos/{v.id}/subtitle/translate",
            headers=make_auth_header(professor),
            params={"target_lang": "en"},
        )
    assert resp.status_code == 409


# ── PATCH /api/videos/{id}/subtitle ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_patch_subtitle_saves_edits(client, professor, video_pending):
    resp = await client.patch(
        f"/api/videos/{video_pending.id}/subtitle",
        headers=make_auth_header(professor),
        json={
            "segments": [
                {"slide_index": 0, "text": "Hello, today we learn Python."},
                {"slide_index": 1, "text": "Let's look at variables."},
            ]
        },
    )
    assert resp.status_code == 200
    subs = resp.json()["subtitle_segments"]
    assert subs[0]["text"] == "Hello, today we learn Python."
    assert subs[1]["text"] == "Let's look at variables."


@pytest.mark.asyncio
async def test_patch_subtitle_student_forbidden(client, student, video_pending):
    resp = await client.patch(
        f"/api/videos/{video_pending.id}/subtitle",
        headers=make_auth_header(student),
        json={"segments": [{"slide_index": 0, "text": "x"}]},
    )
    assert resp.status_code == 403


# ── PATCH /api/lectures/{id} — 음성·자막 설정 저장 ────────────────────────────


@pytest.mark.asyncio
async def test_patch_lecture_voice_subtitle_fields(client, professor, lecture):
    resp = await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(professor),
        json={"voice_lang": "en", "subtitle_lang": "ko", "voice_id": "v_yuna"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["voice_lang"] == "en"
    assert data["subtitle_lang"] == "ko"
    assert data["voice_id"] == "v_yuna"


@pytest.mark.asyncio
async def test_patch_lecture_subtitle_same_as_voice_null(client, professor, lecture):
    """subtitle_lang=null = 음성과 동일."""
    resp = await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(professor),
        json={"voice_lang": "ko", "subtitle_lang": None},
    )
    assert resp.status_code == 200
    assert resp.json()["subtitle_lang"] is None


@pytest.mark.asyncio
async def test_patch_lecture_invalid_lang_422(client, professor, lecture):
    resp = await client.patch(
        f"/api/lectures/{lecture.id}",
        headers=make_auth_header(professor),
        json={"voice_lang": "es"},  # 지원 7종 밖
    )
    assert resp.status_code == 422
