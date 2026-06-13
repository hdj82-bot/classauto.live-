"""내 아바타(룩+음성 조합) API 테스트 — /api/avatars/me/saved CRUD·적용·미리보기."""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.core.config import settings
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.photo_avatar import LookStatus, PhotoAvatarLook
from app.models.saved_avatar import SavedAvatar
from app.models.user import User, UserRole
from tests.conftest import make_auth_header


# ── 헬퍼: 룩 행 생성 ──────────────────────────────────────────────────────────


async def _make_look(
    db,
    user,
    *,
    status: str = LookStatus.ready.value,
    heygen_look_id: str | None = None,
    image_url: str | None = "https://classauto-x.s3.ap-northeast-2.amazonaws.com/look.png",
) -> PhotoAvatarLook:
    look = PhotoAvatarLook(
        id=uuid.uuid4(),
        user_id=user.id,
        heygen_look_id=heygen_look_id,
        image_url=image_url,
        status=status,
        saved_to_library=True,
    )
    db.add(look)
    await db.flush()
    return look


# ── 생성 + 목록 ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_and_list_saved_avatar(client, professor, db):
    look = await _make_look(db, professor)

    resp = await client.post(
        "/api/avatars/me/saved",
        json={"name": "중어중문 강의", "look_id": str(look.id), "voice_id": "vc_self"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 201, resp.text
    item = resp.json()
    assert item["name"] == "중어중문 강의"
    assert item["look_id"] == str(look.id)
    assert item["voice_id"] == "vc_self"
    assert item["preview_status"] == "none"

    listed = await client.get(
        "/api/avatars/me/saved", headers=make_auth_header(professor)
    )
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["id"] == item["id"]


@pytest.mark.asyncio
async def test_create_rejects_non_ready_look(client, professor, db):
    look = await _make_look(db, professor, status=LookStatus.generating.value)
    resp = await client.post(
        "/api/avatars/me/saved",
        json={"name": "x", "look_id": str(look.id)},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_rejects_unknown_look(client, professor):
    resp = await client.post(
        "/api/avatars/me/saved",
        json={"name": "x", "look_id": str(uuid.uuid4())},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_accepts_registered_standard_avatar(client, professor, db):
    """사진 룩이 아니라 본인이 등록한 표준 Video Avatar(heygen avatar_id)도 저장 가능.

    프론트는 표준 아바타의 id 로 heygen avatar_id 를 보낸다. 표준은 항상 ready.
    """
    from app.models.standard_avatar import StandardAvatar

    db.add(
        StandardAvatar(
            id=uuid.uuid4(),
            user_id=professor.id,
            heygen_avatar_id="Sabine_Office_Front_2",
            name="Sabine",
        )
    )
    await db.flush()

    resp = await client.post(
        "/api/avatars/me/saved",
        json={
            "name": "중국어 표준 아바타",
            "look_id": "Sabine_Office_Front_2",
            "voice_id": "vc_helen",
        },
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 201, resp.text
    item = resp.json()
    assert item["look_id"] == "Sabine_Office_Front_2"
    assert item["voice_id"] == "vc_helen"


@pytest.mark.asyncio
async def test_create_rejects_unregistered_standard_avatar(client, professor):
    """등록하지 않은 표준 avatar_id(룩도 표준도 아님)는 404."""
    resp = await client.post(
        "/api/avatars/me/saved",
        json={"name": "x", "look_id": "Unregistered_Avatar_999"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_enforces_cap(client, professor, db):
    look = await _make_look(db, professor)
    # 상한까지 채운다.
    for _ in range(settings.PHOTO_AVATAR_SAVED_MAX):
        db.add(
            SavedAvatar(
                id=uuid.uuid4(), user_id=professor.id, name="기존", look_id=str(look.id)
            )
        )
    await db.flush()
    resp = await client.post(
        "/api/avatars/me/saved",
        json={"name": "초과", "look_id": str(look.id)},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 400


# ── 수정 + 삭제 ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_name_and_voice_invalidates_preview(client, professor, db):
    look = await _make_look(db, professor)
    row = SavedAvatar(
        id=uuid.uuid4(),
        user_id=professor.id,
        name="원래",
        look_id=str(look.id),
        voice_id="vc_a",
        preview_video_url="https://x.s3.ap-northeast-2.amazonaws.com/v.mp4",
        preview_voice_id="vc_a",
        preview_text="안녕",
    )
    db.add(row)
    await db.flush()

    resp = await client.patch(
        f"/api/avatars/me/saved/{row.id}",
        json={"name": "바뀐 이름", "voice_id": "vc_b"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200, resp.text
    item = resp.json()
    assert item["name"] == "바뀐 이름"
    assert item["voice_id"] == "vc_b"
    # 음성이 바뀌었으니 미리보기 캐시는 무효화되어 none.
    assert item["preview_status"] == "none"
    assert item["preview_video_url"] is None


@pytest.mark.asyncio
async def test_delete_saved_avatar(client, professor, db):
    look = await _make_look(db, professor)
    row = SavedAvatar(
        id=uuid.uuid4(), user_id=professor.id, name="삭제대상", look_id=str(look.id)
    )
    db.add(row)
    await db.flush()

    resp = await client.delete(
        f"/api/avatars/me/saved/{row.id}", headers=make_auth_header(professor)
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    listed = await client.get(
        "/api/avatars/me/saved", headers=make_auth_header(professor)
    )
    assert listed.json() == []


@pytest.mark.asyncio
async def test_get_saved_404_for_unknown(client, professor):
    resp = await client.patch(
        f"/api/avatars/me/saved/{uuid.uuid4()}",
        json={"name": "x"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404


# ── 강의 적용 ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_apply_sets_lecture_fields(client, professor, db, lecture):
    await _make_look(db, professor, heygen_look_id="hg_look_1", image_url=None)
    row = SavedAvatar(
        id=uuid.uuid4(),
        user_id=professor.id,
        name="강의용",
        look_id="hg_look_1",
        voice_id="vc_self",
        avatar_scale=0.8,
    )
    db.add(row)
    await db.flush()

    resp = await client.post(
        f"/api/avatars/me/saved/{row.id}/apply",
        json={"lecture_id": str(lecture.id)},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True}

    await db.refresh(lecture)
    assert lecture.avatar_id == "hg_look_1"
    assert lecture.avatar_name == "강의용"
    assert lecture.voice_id == "vc_self"
    assert abs(lecture.avatar_scale - 0.8) < 1e-6


@pytest.mark.asyncio
async def test_apply_rejects_other_users_lecture(client, professor, db):
    # 다른 교수의 강좌·강의.
    other = User(
        id=uuid.uuid4(),
        google_sub="g-other",
        email="other@test.ac.kr",
        name="타 교수",
        role=UserRole.professor,
        is_active=True,
    )
    db.add(other)
    await db.flush()
    other_course = Course(
        id=uuid.uuid4(), instructor_id=other.id, title="타인 강좌", is_published=True
    )
    db.add(other_course)
    await db.flush()
    other_lecture = Lecture(
        id=uuid.uuid4(),
        course_id=other_course.id,
        title="타인 강의",
        slug=f"other-{uuid.uuid4().hex[:8]}",
        order=1,
    )
    db.add(other_lecture)

    await _make_look(db, professor, heygen_look_id="hg_look_1", image_url=None)
    row = SavedAvatar(
        id=uuid.uuid4(), user_id=professor.id, name="x", look_id="hg_look_1"
    )
    db.add(row)
    await db.flush()

    resp = await client.post(
        f"/api/avatars/me/saved/{row.id}/apply",
        json={"lecture_id": str(other_lecture.id)},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404


# ── 미리보기 렌더 + 폴링 ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_preview_render_then_poll_to_ready(client, professor, db):
    # 레거시 heygen 룩 → S3/talking-photo 등록 없이 avatar_id 로 바로 렌더.
    await _make_look(db, professor, heygen_look_id="hg_look_1", image_url=None)
    row = SavedAvatar(
        id=uuid.uuid4(),
        user_id=professor.id,
        name="미리보기",
        look_id="hg_look_1",
        voice_id="vc_self",
    )
    db.add(row)
    await db.flush()

    fake_tts = AsyncMock(return_value=SimpleNamespace(audio_bytes=b"audio"))
    with patch("app.services.pipeline.tts.synthesize", fake_tts), patch(
        "app.services.pipeline.heygen.create_video",
        new=AsyncMock(return_value="vid_1"),
    ), patch(
        "app.services.pipeline.s3.upload_audio_bytes",
        return_value="https://hg.example/audio.mp3",
    ):
        resp = await client.post(
            f"/api/avatars/me/saved/{row.id}/preview",
            json={"text": "안녕하세요"},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["preview_status"] == "processing"

    # 목록 조회 시 폴링 → completed → S3 이전 → ready.
    with patch(
        "app.services.pipeline.heygen.get_video_status",
        new=AsyncMock(
            return_value={"status": "completed", "video_url": "https://hg.example/v.mp4"}
        ),
    ), patch(
        "app.services.pipeline.s3.upload_from_url",
        new=AsyncMock(return_value=("https://hg.example/cached.mp4", None)),
    ):
        listed = await client.get(
            "/api/avatars/me/saved", headers=make_auth_header(professor)
        )
    assert listed.status_code == 200
    item = listed.json()[0]
    assert item["preview_status"] == "ready"
    assert item["preview_video_url"] == "https://hg.example/cached.mp4"


@pytest.mark.asyncio
async def test_preview_cache_hit_skips_render(client, professor, db):
    await _make_look(db, professor, heygen_look_id="hg_look_1", image_url=None)
    row = SavedAvatar(
        id=uuid.uuid4(),
        user_id=professor.id,
        name="캐시",
        look_id="hg_look_1",
        voice_id="vc_self",
        preview_video_url="https://hg.example/cached.mp4",
        preview_voice_id="vc_self",
        preview_text="안녕하세요",
    )
    db.add(row)
    await db.flush()

    create_video = AsyncMock(return_value="vid_should_not_be_called")
    with patch("app.services.pipeline.heygen.create_video", new=create_video):
        resp = await client.post(
            f"/api/avatars/me/saved/{row.id}/preview",
            json={"text": "안녕하세요"},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    assert resp.json()["preview_status"] == "ready"
    create_video.assert_not_called()
