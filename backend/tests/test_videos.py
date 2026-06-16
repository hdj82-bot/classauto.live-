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
    from app.models.video import Video, VideoScript

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
    """pending_review → rendering 승인 + 슬라이드별 render_slide enqueue."""
    from unittest.mock import patch

    # 승인은 이제 렌더를 실제 시작한다(VideoRender 생성 + render_slide.delay).
    # 브로커 호출 없이 enqueue 여부만 검증하도록 태스크를 모킹.
    with patch("app.tasks.render.render_slide") as mock_render:
        resp = await client.post(
            f"/api/videos/{video_pending.id}/approve",
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "rendering"
    # 세그먼트가 있으므로 슬라이드별 렌더가 enqueue 돼야 한다.
    assert mock_render.delay.called


@pytest.mark.asyncio
async def test_approve_does_not_fallback_to_own_face_look(
    client, professor, db, video_pending, lecture
):
    """강의에 아바타 미적용 시, 교수자 기본 본인 룩을 자동 채용하지 않는다(2026-06-15).

    이전엔 lecture.avatar_id 가 비면 professor.photo_avatar_default_look_id(본인 얼굴)로
    폴백해, 타인 아바타를 고른 강의도 "가장 최근 본인 룩"으로 렌더되는 문제가 있었다.
    이제 빈 문자열(= create_video 의 gender 기본 아바타)로 두고 본인 룩을 쓰지 않는다.
    """
    from unittest.mock import patch

    from sqlalchemy import select

    from app.models.video_render import VideoRender

    professor.photo_avatar_default_look_id = "look-default-own"
    lecture.avatar_id = None
    await db.flush()

    with patch("app.tasks.render.render_slide"):
        resp = await client.post(
            f"/api/videos/{video_pending.id}/approve",
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200

    rows = (
        await db.execute(
            select(VideoRender).where(VideoRender.lecture_id == lecture.id)
        )
    ).scalars().all()
    assert rows  # 세그먼트별 렌더가 생성됨
    assert all(r.avatar_id == "" for r in rows)


@pytest.mark.asyncio
async def test_approve_video_wrong_status(client, professor, db, lecture):
    """이미 rendering 상태에서 재승인 → 409."""
    from app.models.video import Video, VideoScript

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
    from app.models.video import Video, VideoScript

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
    from app.models.video import Video

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


# ── POST /api/videos/{id}/rerender — 갇힌 Video 자가 회복 ──────────────────────

@pytest.mark.asyncio
async def test_rerender_heals_stuck_rendering_video(
    client, professor, lecture, db
):
    """모든 슬라이드 음성이 ready 인데 rendering 에 갇힌 Video 를 done 으로 승격.

    재현: 마지막 슬라이드 finalize 누락으로 Video 가 rendering 에 고착(미리보기는
    '준비 중', rerender 는 변경 없음). rerender 가 이를 감지해 done 으로 풀어준다.
    """
    from app.models.video import Video, VideoScript
    from app.models.video_render import RenderStatus, VideoRender

    segments = [
        {"slide_index": 0, "text": "첫 슬라이드 발화", "start_seconds": 0, "end_seconds": 10},
        {"slide_index": 1, "text": "둘째 슬라이드 발화", "start_seconds": 10, "end_seconds": 20},
    ]
    video = Video(
        id=uuid.uuid4(), lecture_id=lecture.id, status=VideoStatus.rendering,
    )
    db.add(video)
    await db.flush()
    db.add(VideoScript(
        id=uuid.uuid4(), video_id=video.id,
        ai_segments=segments, segments=list(segments),
    ))
    # 두 슬라이드 모두 ready + 음성 보유 + 텍스트 일치 → 재합성할 게 없음.
    for seg in segments:
        db.add(VideoRender(
            id=uuid.uuid4(),
            lecture_id=lecture.id,
            instructor_id=professor.id,
            avatar_id="avatar-x",
            status=RenderStatus.ready,
            audio_url=f"https://s3/audio/{seg['slide_index']}.mp3",
            script_text=seg["text"],
            slide_number=seg["slide_index"],
        ))
    await db.flush()

    resp = await client.post(
        f"/api/videos/{video.id}/rerender",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    # 재합성 대상은 0(비용 0)이지만 갇혀 있던 Video 는 done 으로 회복된다.
    assert data["rerendered_segments"] == 0
    assert data["status"] == "done"

    await db.refresh(video)
    assert video.status == VideoStatus.done


@pytest.mark.asyncio
async def test_rerender_done_video_no_changes_stays_done(
    client, professor, lecture, db
):
    """이미 done + 변경 없음 → 0 을 반환하고 상태 불변(불필요한 승격 없음)."""
    from app.models.video import Video, VideoScript
    from app.models.video_render import RenderStatus, VideoRender

    segments = [
        {"slide_index": 0, "text": "그대로인 발화", "start_seconds": 0, "end_seconds": 10},
    ]
    video = Video(
        id=uuid.uuid4(), lecture_id=lecture.id, status=VideoStatus.done,
    )
    db.add(video)
    await db.flush()
    db.add(VideoScript(
        id=uuid.uuid4(), video_id=video.id,
        ai_segments=segments, segments=list(segments),
    ))
    db.add(VideoRender(
        id=uuid.uuid4(), lecture_id=lecture.id, instructor_id=professor.id,
        avatar_id="avatar-x", status=RenderStatus.ready,
        audio_url="https://s3/audio/0.mp3", script_text="그대로인 발화",
        slide_number=0,
    ))
    await db.flush()

    resp = await client.post(
        f"/api/videos/{video.id}/rerender",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["rerendered_segments"] == 0
    assert data["status"] == "done"


@pytest.mark.asyncio
async def test_rerender_dry_run_reports_diff_without_mutating(
    client, professor, lecture, db
):
    """dry_run=true 는 DB 를 건드리지 않고 실제 변경분만 정확히 보고한다.

    슬라이드 2장 중 1장만 발화를 고친 상태 → 점검은 '1장 변경(2번)·1장 재사용' 을
    돌려주고, 상태 전환·합성 enqueue 는 일어나지 않는다(비용 0)."""
    from unittest.mock import patch

    from app.models.video import Video, VideoScript
    from app.models.video_render import RenderStatus, VideoRender

    segments = [
        {"slide_index": 0, "text": "그대로인 발화", "start_seconds": 0, "end_seconds": 10},
        {"slide_index": 1, "text": "수정된 발화", "start_seconds": 10, "end_seconds": 20},
    ]
    lecture.avatar_name = "Sabine Office Front 2"
    video = Video(id=uuid.uuid4(), lecture_id=lecture.id, status=VideoStatus.done)
    db.add(video)
    await db.flush()
    db.add(VideoScript(
        id=uuid.uuid4(), video_id=video.id,
        ai_segments=segments, segments=list(segments),
    ))
    # 0번 슬라이드는 텍스트 일치(재사용), 1번은 옛 텍스트로 렌더돼 변경 대상.
    db.add(VideoRender(
        id=uuid.uuid4(), lecture_id=lecture.id, instructor_id=professor.id,
        avatar_id="avatar-x", status=RenderStatus.ready,
        audio_url="https://s3/audio/0.mp3", script_text="그대로인 발화",
        slide_number=0,
    ))
    db.add(VideoRender(
        id=uuid.uuid4(), lecture_id=lecture.id, instructor_id=professor.id,
        avatar_id="avatar-x", status=RenderStatus.ready,
        audio_url="https://s3/audio/1.mp3", script_text="옛 발화",
        slide_number=1,
    ))
    await db.flush()

    with patch("app.tasks.render.render_slide.delay") as mock_delay:
        resp = await client.post(
            f"/api/videos/{video.id}/rerender?dry_run=true",
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["dry_run"] is True
    assert data["rerendered_segments"] == 1
    assert data["slides_total"] == 2
    assert data["changed_slide_numbers"] == [2]  # 1-based 표시
    assert data["reused_slides"] == 1
    assert data["avatar_name"] == "Sabine Office Front 2"
    # 점검만 — 상태 전환·합성 enqueue 가 절대 없어야 한다(비용 0).
    assert data["status"] == "done"
    mock_delay.assert_not_called()

    await db.refresh(video)
    assert video.status == VideoStatus.done  # 점검은 상태를 바꾸지 않는다.


@pytest.mark.asyncio
async def test_rerender_detects_voice_change(client, professor, lecture, db):
    """텍스트가 그대로여도 음성(보이스/속도)을 바꿨으면 해당 슬라이드를 재합성한다."""
    from unittest.mock import patch

    from app.models.video import Video, VideoScript
    from app.models.video_render import RenderStatus, VideoRender

    segments = [
        {"slide_index": 0, "text": "그대로인 발화", "start_seconds": 0, "end_seconds": 10},
    ]
    # 강의의 현재 보이스를 변경된 상태로 둔다.
    lecture.voice_id = "new-voice"
    lecture.voice_speed = 1.0
    video = Video(id=uuid.uuid4(), lecture_id=lecture.id, status=VideoStatus.done)
    db.add(video)
    await db.flush()
    db.add(VideoScript(
        id=uuid.uuid4(), video_id=video.id,
        ai_segments=segments, segments=list(segments),
    ))
    # 렌더는 예전 보이스로 합성됨(텍스트는 동일).
    db.add(VideoRender(
        id=uuid.uuid4(), lecture_id=lecture.id, instructor_id=professor.id,
        avatar_id="avatar-x", status=RenderStatus.ready,
        audio_url="https://s3/audio/0.mp3", script_text="그대로인 발화",
        slide_number=0, voice_id="old-voice", voice_speed=1.0,
    ))
    await db.flush()

    with patch("app.tasks.render.render_slide.delay") as mock_delay:
        resp = await client.post(
            f"/api/videos/{video.id}/rerender",
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["rerendered_segments"] == 1  # 텍스트 동일해도 음성 변경 → 재합성
    assert data["status"] == "rendering"
    mock_delay.assert_called_once()


@pytest.mark.asyncio
async def test_rerender_legacy_render_without_voice_record_no_regression(
    client, professor, lecture, db
):
    """구버전 렌더(voice 기록 NULL)는 음성 변경을 판별할 수 없어 텍스트 기준만 — 무회귀."""
    from app.models.video import Video, VideoScript
    from app.models.video_render import RenderStatus, VideoRender

    segments = [
        {"slide_index": 0, "text": "그대로인 발화", "start_seconds": 0, "end_seconds": 10},
    ]
    lecture.voice_id = "new-voice"  # 바뀌었지만 렌더에 기록이 없어 감지 불가.
    video = Video(id=uuid.uuid4(), lecture_id=lecture.id, status=VideoStatus.done)
    db.add(video)
    await db.flush()
    db.add(VideoScript(
        id=uuid.uuid4(), video_id=video.id,
        ai_segments=segments, segments=list(segments),
    ))
    db.add(VideoRender(
        id=uuid.uuid4(), lecture_id=lecture.id, instructor_id=professor.id,
        avatar_id="avatar-x", status=RenderStatus.ready,
        audio_url="https://s3/audio/0.mp3", script_text="그대로인 발화",
        slide_number=0,  # voice_id/voice_speed 기록 없음(NULL)
    ))
    await db.flush()

    resp = await client.post(
        f"/api/videos/{video.id}/rerender",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    assert resp.json()["rerendered_segments"] == 0


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
