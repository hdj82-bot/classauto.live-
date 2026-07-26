"""테스터 자료 열람 — 스펙 14 §B.

검증 대상:
1. 4단계(PPT/스크립트/아바타/퀴즈) 판정이 실제 스키마 조인으로 맞는가.
   특히 PPT 는 `lectures.pipeline_task_id == slide_embeddings.task_id` 로 이어진다
   (스펙 표의 "embeddings WHERE lecture_id" 는 실제 스키마와 다르다).
2. 강의 귀속 비용이 두 테이블 합산인가.
3. **N+1 이 없는가** — 강의 수를 늘려도 쿼리 수가 고정이어야 한다(핵심 회귀 가드).
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import event

from app.core.config import settings
from app.models.cost_log import CostCategory, CostLog
from app.models.course import Course
from app.models.embedding import SlideEmbedding
from app.models.lecture import Lecture
from app.models.question import (
    AssessmentType,
    Difficulty,
    Question,
    QuestionType,
)
from app.models.user import User, UserRole
from app.models.video import Video, VideoScript, VideoStatus
from app.models.video_render import RenderCostLog, RenderStatus, VideoRender
from app.services import admin_artifacts
from tests.conftest import make_auth_header

OWNER_EMAIL = "classauto101@gmail.com"


@pytest.fixture
def owner_factory(db):
    async def _make() -> User:
        user = User(
            id=uuid.uuid4(),
            google_sub=f"google-owner-{uuid.uuid4().hex[:8]}",
            email=OWNER_EMAIL,
            name="계정주",
            role=UserRole.professor,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        return user

    return _make


async def _make_lecture(db, course: Course, *, title: str, task_id: str | None = None) -> Lecture:
    lec = Lecture(
        id=uuid.uuid4(),
        course_id=course.id,
        title=title,
        slug=f"lec-{uuid.uuid4().hex[:10]}",
        order=1,
        is_published=True,
        pipeline_task_id=task_id,
    )
    db.add(lec)
    await db.flush()
    return lec


# ── 4단계 판정 ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_empty_lecture_reports_all_none(client, db, professor, course, owner_factory):
    owner = await owner_factory()
    await _make_lecture(db, course, title="빈 강의")

    resp = await client.get(
        f"/api/v1/admin/users/{professor.id}/artifacts",
        headers=make_auth_header(owner),
    )
    assert resp.status_code == 200, resp.text
    lec = resp.json()["lectures"][0]
    assert lec["stages"] == {
        "ppt": "none",
        "script": "none",
        "avatar": "none",
        "quiz": "none",
    }
    assert lec["slide_count"] == 0
    assert lec["spend_usd"] == 0


@pytest.mark.asyncio
async def test_ppt_stage_joins_via_pipeline_task_id(
    client, db, professor, course, owner_factory
):
    """PPT 단계는 pipeline_task_id ↔ slide_embeddings.task_id 로 이어진다.

    이 조인을 놓치면 슬라이드가 있어도 전부 'none' 이 된다 — 스펙 표가 틀린 지점이라
    회귀 가드를 둔다.
    """
    owner = await owner_factory()
    task_id = str(uuid.uuid4())
    lec = await _make_lecture(db, course, title="PPT 있는 강의", task_id=task_id)
    for n in (1, 2):
        db.add(
            SlideEmbedding(
                task_id=task_id,
                slide_number=n,
                text_content=f"슬라이드 {n}",
                embedding=[0.0] * 1536,
                slide_image_url=f"https://example.com/slide-{n}.png",
            )
        )
    await db.flush()

    resp = await client.get(
        f"/api/v1/admin/users/{professor.id}/artifacts",
        headers=make_auth_header(owner),
    )
    item = next(x for x in resp.json()["lectures"] if x["id"] == str(lec.id))
    assert item["stages"]["ppt"] == "ok"
    assert item["slide_count"] == 2
    # 썸네일은 강의당 1건 — 첫 슬라이드.
    assert item["thumbnail_url"] is not None


@pytest.mark.asyncio
async def test_script_stage_ok_only_when_approved(
    client, db, professor, course, owner_factory
):
    """스크립트는 승인돼야 ok, 있기만 하면 run."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="스크립트 강의")
    video = Video(id=uuid.uuid4(), lecture_id=lec.id, status=VideoStatus.draft)
    db.add(video)
    await db.flush()
    db.add(VideoScript(id=uuid.uuid4(), video_id=video.id, approved_at=None))
    await db.flush()

    resp = await client.get(
        f"/api/v1/admin/users/{professor.id}/artifacts",
        headers=make_auth_header(owner),
    )
    item = next(x for x in resp.json()["lectures"] if x["id"] == str(lec.id))
    assert item["stages"]["script"] == "run"


@pytest.mark.asyncio
async def test_avatar_fail_when_renders_failed(
    client, db, professor, course, owner_factory
):
    """영상이 done/rendering 이 아닌데 실패 렌더가 있으면 fail 로 승격한다.

    "아직 안 만듦"과 "만들다 깨짐"은 운영자가 다르게 대응해야 한다.
    """
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="렌더 실패 강의")
    db.add(
        VideoRender(
            id=uuid.uuid4(),
            lecture_id=lec.id,
            instructor_id=professor.id,
            avatar_id="avatar-test",
            slide_number=1,
            status=RenderStatus.failed,
            error_message="HeyGen 402",
        )
    )
    await db.flush()

    resp = await client.get(
        f"/api/v1/admin/users/{professor.id}/artifacts",
        headers=make_auth_header(owner),
    )
    item = next(x for x in resp.json()["lectures"] if x["id"] == str(lec.id))
    assert item["stages"]["avatar"] == "fail"
    assert item["failed_render_count"] == 1


@pytest.mark.asyncio
async def test_quiz_stage_and_rerender_cap(client, db, professor, course, owner_factory):
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="퀴즈 강의")
    lec.avatar_render_count = 2
    db.add(
        Question(
            id=uuid.uuid4(),
            lecture_id=lec.id,
            assessment_type=AssessmentType.formative,
            question_type=QuestionType.multiple_choice,
            difficulty=Difficulty.medium,
            content="把자문의 어순은?",
            options=["A", "B"],
            correct_answer="A",
        )
    )
    await db.flush()

    resp = await client.get(
        f"/api/v1/admin/users/{professor.id}/artifacts",
        headers=make_auth_header(owner),
    )
    item = next(x for x in resp.json()["lectures"] if x["id"] == str(lec.id))
    assert item["stages"]["quiz"] == "ok"
    assert item["question_count"] == 1
    # 재렌더 잔여 pip(●●○)를 프론트가 그리려면 count/cap 이 둘 다 필요하다.
    assert item["avatar_render_count"] == 2
    assert item["avatar_render_cap"] == settings.AVATAR_RERENDER_MAX_PER_LECTURE


# ── 강의 귀속 비용 ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_spend_sums_both_cost_tables(client, db, professor, course, owner_factory):
    """render_cost_logs + platform_cost_logs 합산. qa_logs 는 섞지 않는다(§1.1)."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="비용 강의")

    render = VideoRender(
        id=uuid.uuid4(),
        lecture_id=lec.id,
        instructor_id=professor.id,
        avatar_id="avatar-test",
        slide_number=1,
        status=RenderStatus.ready,
    )
    db.add(render)
    await db.flush()
    db.add(
        RenderCostLog(
            id=uuid.uuid4(),
            video_render_id=render.id,
            service="elevenlabs",
            operation="tts_synthesize",
            cost_usd=1.25,
        )
    )
    db.add(
        CostLog(
            id=uuid.uuid4(),
            lecture_id=lec.id,
            category=CostCategory.avatar_qa,
            model="heygen",
            cost_usd=3.75,
        )
    )
    await db.flush()

    resp = await client.get(
        f"/api/v1/admin/users/{professor.id}/artifacts",
        headers=make_auth_header(owner),
    )
    item = next(x for x in resp.json()["lectures"] if x["id"] == str(lec.id))
    assert item["spend_usd"] == pytest.approx(5.0)


# ── N+1 회귀 가드 (핵심) ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_query_count_is_flat_regardless_of_lecture_count(
    db, professor, course
):
    """**강의 수를 늘려도 쿼리 수가 늘면 안 된다.**

    강의 30개인 테스터에서 4단계를 강의별로 돌리면 120쿼리다(§B 구현 주의).
    강의 1개일 때와 12개일 때의 쿼리 수가 같은지 직접 센다.
    """
    counter = {"n": 0}

    def _count(*_args, **_kwargs):
        counter["n"] += 1

    # aiosqlite 세션의 bind 는 sync Engine 을 노출한다. sync_engine 속성이 있으면
    # 그걸, 없으면 자기 자신에 리스너를 건다.
    bind = db.get_bind()
    engine = getattr(bind, "sync_engine", bind)
    event.listen(engine, "before_cursor_execute", _count)
    try:
        await _make_lecture(db, course, title="강의 1")
        counter["n"] = 0
        await admin_artifacts.user_artifacts(db, professor.id)
        one = counter["n"]

        for i in range(2, 14):
            await _make_lecture(db, course, title=f"강의 {i}")
        counter["n"] = 0
        await admin_artifacts.user_artifacts(db, professor.id)
        many = counter["n"]
    finally:
        event.remove(engine, "before_cursor_execute", _count)

    assert one == many, f"강의 1개 {one}쿼리 → 13개 {many}쿼리 (N+1)"


@pytest.mark.asyncio
async def test_unknown_user_404(client, owner_factory):
    owner = await owner_factory()
    resp = await client.get(
        f"/api/v1/admin/users/{uuid.uuid4()}/artifacts",
        headers=make_auth_header(owner),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_requires_admin(client, professor):
    resp = await client.get(
        f"/api/v1/admin/users/{professor.id}/artifacts",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 403
