"""스크립트 에디터 API 통합 테스트."""
import uuid

import pytest

from app.models.video import VideoStatus
from tests.conftest import make_auth_header


# ── GET /api/videos/{id}/script ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_script(client, professor, video_pending):
    resp = await client.get(
        f"/api/videos/{video_pending.id}/script",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["video_id"] == str(video_pending.id)
    assert data["status"] == "pending_review"
    assert len(data["segments"]) == 2
    assert data["ai_segments"] is not None  # 원본 AI 스크립트 포함


@pytest.mark.asyncio
async def test_get_script_not_found(client, professor):
    resp = await client.get(
        f"/api/videos/{uuid.uuid4()}/script",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_script_student_forbidden(client, student, video_pending):
    """학습자는 스크립트 조회 불가 → 403."""
    resp = await client.get(
        f"/api/videos/{video_pending.id}/script",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_script_other_professor_forbidden(client, db, video_pending):
    """소유자가 아닌 교수자 접근 → 403."""
    other = _make_other_professor()
    db.add(other)
    await db.flush()

    resp = await client.get(
        f"/api/videos/{video_pending.id}/script",
        headers=make_auth_header(other),
    )
    assert resp.status_code == 403


# ── PATCH /api/videos/{id}/script ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_patch_script(client, professor, video_pending):
    """스크립트 텍스트·톤·핀 수정."""
    new_segments = [
        {
            "slide_index": 0,
            "text": "수정된 발화 텍스트입니다.",
            "start_seconds": 0,
            "end_seconds": 35,
            "tone": "emphasis",
            "question_pin_seconds": 20,
        },
        {
            "slide_index": 1,
            "text": "두 번째 슬라이드 수정.",
            "start_seconds": 35,
            "end_seconds": 65,
            "tone": "soft",
            "question_pin_seconds": None,
        },
    ]
    resp = await client.patch(
        f"/api/videos/{video_pending.id}/script",
        headers=make_auth_header(professor),
        json={"segments": new_segments},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["segments"][0]["text"] == "수정된 발화 텍스트입니다."
    assert data["segments"][0]["tone"] == "emphasis"
    assert data["segments"][0]["question_pin_seconds"] == 20
    assert data["segments"][1]["tone"] == "soft"


@pytest.mark.asyncio
async def test_patch_script_invalid_tone(client, professor, video_pending):
    """잘못된 tone 값 → 422."""
    resp = await client.patch(
        f"/api/videos/{video_pending.id}/script",
        headers=make_auth_header(professor),
        json={
            "segments": [
                {
                    "slide_index": 0,
                    "text": "텍스트",
                    "start_seconds": 0,
                    "end_seconds": 30,
                    "tone": "invalid_tone",
                }
            ]
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_script_rendering_locked(client, professor, db, lecture, course):
    """rendering 상태에서는 수정 불가 → 409."""
    from app.models.video import Video, VideoScript, VideoStatus

    v = Video(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        status=VideoStatus.rendering,
    )
    db.add(v)
    await db.flush()
    s = VideoScript(id=uuid.uuid4(), video_id=v.id, segments=[], ai_segments=[])
    db.add(s)
    await db.flush()

    resp = await client.patch(
        f"/api/videos/{v.id}/script",
        headers=make_auth_header(professor),
        json={
            "segments": [
                {
                    "slide_index": 0,
                    "text": "수정 시도",
                    "start_seconds": 0,
                    "end_seconds": 10,
                    "tone": "normal",
                }
            ]
        },
    )
    assert resp.status_code == 409


# ── POST /api/videos/{id}/script/reset ───────────────────────────────────────

@pytest.mark.asyncio
async def test_reset_script(client, professor, video_pending, db):
    """스크립트 수정 후 AI 원본으로 복원."""
    # 먼저 수정
    await client.patch(
        f"/api/videos/{video_pending.id}/script",
        headers=make_auth_header(professor),
        json={
            "segments": [
                {
                    "slide_index": 0,
                    "text": "수정된 텍스트",
                    "start_seconds": 0,
                    "end_seconds": 10,
                    "tone": "fast",
                }
            ]
        },
    )

    # 복원
    resp = await client.post(
        f"/api/videos/{video_pending.id}/script/reset",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    # AI 원본 텍스트로 복원 확인
    assert data["segments"][0]["text"] == "안녕하세요, 오늘은 파이썬을 배웁니다."
    assert data["segments"][0]["tone"] == "normal"


# ── POST /api/videos/{id}/approve ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_approve_video(client, professor, video_pending):
    """pending_review → rendering 승인."""
    resp = await client.post(
        f"/api/videos/{video_pending.id}/approve",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "rendering"


@pytest.mark.asyncio
async def test_approve_video_wrong_status(client, professor, db, lecture):
    """이미 rendering 상태에서 재승인 → 409."""
    from app.models.video import Video, VideoScript, VideoStatus

    v = Video(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        status=VideoStatus.rendering,
    )
    db.add(v)
    await db.flush()
    s = VideoScript(
        id=uuid.uuid4(),
        video_id=v.id,
        segments=[{"slide_index": 0, "text": "x", "start_seconds": 0, "end_seconds": 1, "tone": "normal"}],
        ai_segments=[],
    )
    db.add(s)
    await db.flush()

    resp = await client.post(
        f"/api/videos/{v.id}/approve",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_approve_empty_script_fails(client, professor, db, lecture):
    """세그먼트 없는 스크립트 승인 → 400."""
    from app.models.video import Video, VideoScript, VideoStatus

    v = Video(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        status=VideoStatus.pending_review,
    )
    db.add(v)
    await db.flush()
    s = VideoScript(id=uuid.uuid4(), video_id=v.id, segments=[], ai_segments=[])
    db.add(s)
    await db.flush()

    resp = await client.post(
        f"/api/videos/{v.id}/approve",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 400


# ── POST /api/videos/{id}/archive ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_archive_video(client, professor, video_pending):
    resp = await client.post(
        f"/api/videos/{video_pending.id}/archive",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_archive_already_archived(client, professor, db, lecture):
    """이미 archived → 409."""
    from app.models.video import Video, VideoStatus

    v = Video(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        status=VideoStatus.archived,
    )
    db.add(v)
    await db.flush()

    resp = await client.post(
        f"/api/videos/{v.id}/archive",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_archive_student_forbidden(client, student, video_pending):
    resp = await client.post(
        f"/api/videos/{video_pending.id}/archive",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _make_other_professor():
    from app.models.user import User, UserRole
    return User(
        id=uuid.uuid4(),
        google_sub="other-prof-vid",
        email="othervid@test.ac.kr",
        name="다른교수",
        role=UserRole.professor,
        school="다른대학교",
        is_active=True,
    )
