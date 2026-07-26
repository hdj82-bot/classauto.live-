"""테스터가 만든 자료 열람 — 스펙 14 §B.

`/admin/users/{id}/usage` 는 강의 **제목만** 줘서 "어떤 자료를 만들어 쓰는지"가 안 보였다.
강의별로 **PPT → 스크립트 → 아바타 → 퀴즈** 4단계 상태와 재렌더 잔여·실패 수·귀속 비용을
한 번에 돌려준다.

**N+1 금지**(§B 구현 주의). 강의가 수십 개인 테스터가 나온다. 4단계를 강의별 4쿼리로 돌리면
강의 30개에 120쿼리다. `lecture_id` 로 group by 한 집계 쿼리를 먼저 돌린 뒤 파이썬에서 dict
조인한다 — `admin_analytics.spend_by_instructor` 와 같은 패턴이다.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.cost_log import CostLog
from app.models.course import Course
from app.models.embedding import SlideEmbedding
from app.models.lecture import Lecture
from app.models.question import Question
from app.models.user import User
from app.models.video import Video, VideoScript, VideoStatus
from app.models.video_render import RenderCostLog, RenderStatus, VideoRender
from app.services.pipeline.s3 import presign_stored_s3_url

# 4단계 상태값. 프론트가 pip/칩 색을 이걸로 고른다.
STAGE_OK = "ok"
STAGE_RUN = "run"
STAGE_FAIL = "fail"
STAGE_NONE = "none"


async def _slide_counts(db: AsyncSession, lecture_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """강의별 슬라이드 수(이미지 보유 행).

    ⚠️ 스펙 §B 표는 "embeddings WHERE lecture_id" 라고 적었지만, `slide_embeddings` 에는
    `lecture_id` 컬럼이 없다. 실제 연결은 `lectures.pipeline_task_id == slide_embeddings.task_id`
    다(둘 다 파이프라인 task UUID 문자열). 이 조인을 놓치면 PPT 단계가 전부 `none` 이 된다.
    """
    if not lecture_ids:
        return {}
    rows = (
        await db.execute(
            select(Lecture.id, func.count(SlideEmbedding.id))
            .select_from(Lecture)
            .join(SlideEmbedding, SlideEmbedding.task_id == Lecture.pipeline_task_id)
            .where(
                Lecture.id.in_(lecture_ids),
                SlideEmbedding.slide_image_url.isnot(None),
            )
            .group_by(Lecture.id)
        )
    ).all()
    return {r[0]: int(r[1] or 0) for r in rows}


async def _first_slide_url(db: AsyncSession, lecture_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    """강의별 **첫 슬라이드 1장**의 이미지 URL.

    §B: presign 은 강의당 1건만. 슬라이드 전체를 presign 하면 응답이 폭발한다.
    """
    if not lecture_ids:
        return {}
    rows = (
        await db.execute(
            select(Lecture.id, func.min(SlideEmbedding.slide_number), SlideEmbedding.slide_image_url)
            .select_from(Lecture)
            .join(SlideEmbedding, SlideEmbedding.task_id == Lecture.pipeline_task_id)
            .where(
                Lecture.id.in_(lecture_ids),
                SlideEmbedding.slide_image_url.isnot(None),
            )
            .group_by(Lecture.id, SlideEmbedding.slide_image_url, SlideEmbedding.slide_number)
            .order_by(Lecture.id, SlideEmbedding.slide_number)
        )
    ).all()
    out: dict[uuid.UUID, str] = {}
    for lecture_id, _num, url in rows:
        # order_by 로 slide_number 오름차순이라 첫 등장이 1번 슬라이드.
        if lecture_id not in out and url:
            out[lecture_id] = url
    return out


async def _script_states(db: AsyncSession, lecture_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    """강의별 스크립트 상태 — 승인됨(ok) / 있음(run) / 없음(none)."""
    if not lecture_ids:
        return {}
    rows = (
        await db.execute(
            select(
                Video.lecture_id,
                func.count(VideoScript.id),
                func.count(VideoScript.approved_at),
            )
            .select_from(Video)
            .join(VideoScript, VideoScript.video_id == Video.id)
            .where(Video.lecture_id.in_(lecture_ids))
            .group_by(Video.lecture_id)
        )
    ).all()
    out: dict[uuid.UUID, str] = {}
    for lecture_id, total, approved in rows:
        if int(approved or 0) > 0:
            out[lecture_id] = STAGE_OK
        elif int(total or 0) > 0:
            out[lecture_id] = STAGE_RUN
    return out


async def _video_states(db: AsyncSession, lecture_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    """강의별 영상(아바타) 상태 — videos.status 기준."""
    if not lecture_ids:
        return {}
    rows = (
        await db.execute(
            select(Video.lecture_id, Video.status, Video.created_at)
            .where(Video.lecture_id.in_(lecture_ids))
            .order_by(Video.lecture_id, Video.created_at.desc())
        )
    ).all()
    out: dict[uuid.UUID, str] = {}
    for lecture_id, status, _created in rows:
        # 최신 Video 1건만 본다(강의에 Video 가 둘 이상일 수 있다 — lectures.py 와 동일 기준).
        if lecture_id in out:
            continue
        if status == VideoStatus.done:
            out[lecture_id] = STAGE_OK
        elif status == VideoStatus.rendering:
            out[lecture_id] = STAGE_RUN
        else:
            out[lecture_id] = STAGE_NONE
    return out


async def _failed_render_counts(
    db: AsyncSession, lecture_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """강의별 실패 렌더 수."""
    if not lecture_ids:
        return {}
    rows = (
        await db.execute(
            select(VideoRender.lecture_id, func.count(VideoRender.id))
            .where(
                VideoRender.lecture_id.in_(lecture_ids),
                VideoRender.status == RenderStatus.failed,
            )
            .group_by(VideoRender.lecture_id)
        )
    ).all()
    return {r[0]: int(r[1] or 0) for r in rows}


async def _quiz_counts(db: AsyncSession, lecture_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """강의별 문제 수."""
    if not lecture_ids:
        return {}
    rows = (
        await db.execute(
            select(Question.lecture_id, func.count(Question.id))
            .where(Question.lecture_id.in_(lecture_ids))
            .group_by(Question.lecture_id)
        )
    ).all()
    return {r[0]: int(r[1] or 0) for r in rows}


async def _spend_by_lecture(
    db: AsyncSession, lecture_ids: list[uuid.UUID]
) -> dict[uuid.UUID, float]:
    """강의 귀속 비용 — 두 비용 테이블 합산.

    교수자 귀속과 달리 강의 귀속은 **양쪽 다 1-조인**이다.
      · render_cost_logs → video_renders.lecture_id
      · platform_cost_logs.lecture_id (직결)

    ⚠️ `qa_logs` 는 섞지 않는다(§1.1 이중 기록). Q&A 아바타 렌더 비용은 이미
    platform_cost_logs(category=AVATAR_QA)에 들어 있어, qa_logs 를 더하면 두 번 센다.
    """
    out: dict[uuid.UUID, float] = {}
    if not lecture_ids:
        return out

    render_rows = (
        await db.execute(
            select(VideoRender.lecture_id, func.coalesce(func.sum(RenderCostLog.cost_usd), 0.0))
            .select_from(RenderCostLog)
            .join(VideoRender, RenderCostLog.video_render_id == VideoRender.id)
            .where(VideoRender.lecture_id.in_(lecture_ids))
            .group_by(VideoRender.lecture_id)
        )
    ).all()
    for lecture_id, total in render_rows:
        out[lecture_id] = out.get(lecture_id, 0.0) + float(total or 0.0)

    platform_rows = (
        await db.execute(
            select(CostLog.lecture_id, func.coalesce(func.sum(CostLog.cost_usd), 0.0))
            .where(CostLog.lecture_id.in_(lecture_ids))
            .group_by(CostLog.lecture_id)
        )
    ).all()
    for lecture_id, total in platform_rows:
        out[lecture_id] = out.get(lecture_id, 0.0) + float(total or 0.0)

    return out


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


async def user_artifacts(db: AsyncSession, user_id: uuid.UUID) -> dict | None:
    """테스터 1명이 만든 자료 전체. 유저가 없으면 None.

    쿼리 수는 **강의 수와 무관하게 고정**이다(유저 1 + 강의목록 1 + 집계 7).
    """
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        return None

    lecture_rows = (
        await db.execute(
            select(Lecture, Course.title)
            .select_from(Lecture)
            .join(Course, Lecture.course_id == Course.id)
            .where(Course.instructor_id == user_id)
            .order_by(Lecture.updated_at.desc())
        )
    ).all()
    lectures = [row[0] for row in lecture_rows]
    course_titles = {row[0].id: row[1] for row in lecture_rows}
    lecture_ids = [lec.id for lec in lectures]

    slides = await _slide_counts(db, lecture_ids)
    thumbs = await _first_slide_url(db, lecture_ids)
    scripts = await _script_states(db, lecture_ids)
    videos = await _video_states(db, lecture_ids)
    failed = await _failed_render_counts(db, lecture_ids)
    quizzes = await _quiz_counts(db, lecture_ids)
    spend = await _spend_by_lecture(db, lecture_ids)

    # 썸네일은 **강의당 1건만** presign 한다(§B). 슬라이드 PNG 는 public-read 가 아니라
    # 서명 없이는 403 이다. 만료 10분 — 콘솔에서 훑어보는 용도라 짧게 잡는다.
    presigned = {
        lecture_id: presign_stored_s3_url(url, expiration=600)
        for lecture_id, url in thumbs.items()
    }

    cap = settings.AVATAR_RERENDER_MAX_PER_LECTURE
    items = []
    for lec in lectures:
        slide_count = slides.get(lec.id, 0)
        fail_count = failed.get(lec.id, 0)
        avatar_state = videos.get(lec.id, STAGE_NONE)
        # videos 가 done/rendering 이 아닌데 실패 렌더가 있으면 fail 로 승격한다 —
        # "아직 안 만듦"과 "만들다 깨짐"은 운영자가 다르게 대응해야 한다.
        if avatar_state == STAGE_NONE and fail_count > 0:
            avatar_state = STAGE_FAIL

        items.append(
            {
                "id": str(lec.id),
                "title": lec.title,
                "course_title": course_titles.get(lec.id),
                "is_published": lec.is_published,
                "updated_at": _iso(lec.updated_at),
                "thumbnail_url": presigned.get(lec.id),
                "slide_count": slide_count,
                "stages": {
                    "ppt": STAGE_OK if slide_count > 0 else STAGE_NONE,
                    "script": scripts.get(lec.id, STAGE_NONE),
                    "avatar": avatar_state,
                    "quiz": STAGE_OK if quizzes.get(lec.id, 0) > 0 else STAGE_NONE,
                },
                "question_count": quizzes.get(lec.id, 0),
                "avatar_render_count": lec.avatar_render_count,
                "avatar_render_cap": cap,
                "failed_render_count": fail_count,
                "spend_usd": round(spend.get(lec.id, 0.0), 4),
            }
        )

    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "cohort": user.cohort,
            "beta_consented_at": _iso(user.beta_consented_at),
            "school": user.school,
            "department": user.department,
        },
        "lectures": items,
    }
