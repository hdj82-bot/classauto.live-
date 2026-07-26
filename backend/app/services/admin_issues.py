"""이슈 인박스 — 실패 렌더를 '강의 + 렌더 패스' 단위로 묶어 준다 (스펙 14 §C).

**왜 묶는가.** `video_renders` 는 강의당 여러 행이다(`slide_number` — 슬라이드/클러스터
단위, §1.1). 한 번의 렌더 패스가 통째로 실패하면 슬라이드 수만큼 행이 생기고, 그대로
나열하면 **같은 사고 하나가 N줄**로 보인다. 운영자는 "사고 몇 건"을 세고 싶지 "실패한
슬라이드 몇 개"를 세고 싶은 게 아니다.

**패스를 무엇으로 식별하는가.** 패스 id 컬럼은 없다. 대신 *시간 간격*으로 나눈다 —
한 패스는 슬라이드를 한꺼번에 제출하므로 실패 시각이 조밀하게 붙고, 다시 시도한 패스는
멀찍이 떨어진다. 같은 강의의 실패 행을 시간순으로 훑다가 간격이 ``_PASS_GAP_SECONDS``
를 넘으면 거기서 새 패스로 끊는다.

에러 문구로는 나누지 않는다. 한 패스 안에서도 슬라이드마다 다른 메시지가 나올 수 있고
(TTS 는 성공했는데 병합에서 깨지는 식), 그건 여전히 사고 하나다. 대신 드로어가 볼 수
있게 그룹 안의 **서로 다른 메시지 목록**을 함께 실어 준다.

**상태는 파생 3분기다**(§C — `resolved` 컬럼을 두지 않는다).
``triaged_at IS NULL`` → 미확인 / ``triaged_at`` 이후 같은 강의의 성공 렌더 존재 → 해결 /
그 외 → 확인함. 상태를 컬럼으로 따로 적어 두면 재렌더 성공과 어긋난다.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.lecture import Lecture
from app.models.user import User
from app.models.video_render import RenderStatus, VideoRender

# 같은 강의의 실패 행이 이 간격 안에 붙어 있으면 한 패스로 본다.
# 한 패스의 슬라이드는 동시에 제출되므로 실제 간격은 보통 수초~수분이다. 30분은
# 그 위로 넉넉하되, 교수자가 나중에 다시 시도한 패스와는 확실히 갈라지는 폭이다.
_PASS_GAP_SECONDS = 1800

# 한 번에 훑는 실패 행의 상한. 베타 규모(실패 수백 행)에선 닿지 않지만, 사고가
# 폭주해도 응답이 무한정 커지지 않게 막는다. 잘렸으면 응답에 명시한다(조용히 자르지 않음).
_MAX_SCAN_ROWS = 5000

# 아바타 제공자 판별용 job id 접두 — qa_batch/budget 과 같은 표식.
# **현재 `video_renders` 는 전부 HeyGen 이다**: 본문 렌더(`app/tasks/render.py`)에는
# VisionStory 분기가 없고, VisionStory 는 Q&A 답변 클립(`qa_answer_caches`)에만 쓰인다.
# 그래도 접두 검사를 남겨 두면 본문 파이프라인에 VisionStory 가 붙는 날 스키마 변경
# 없이 이 필드가 곧바로 맞는 값을 준다.
_VS_JOB_PREFIX = "visionstory:"


def _provider(job_id: str | None) -> str:
    """아바타 제공자. job id 접두가 유일한 표식이다(별도 컬럼 없음)."""
    return "visionstory" if (job_id or "").startswith(_VS_JOB_PREFIX) else "heygen"


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _aware(value: datetime | None) -> datetime | None:
    """naive datetime(SQLite 경로)을 UTC 로 맞춰 비교 가능하게 만든다."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


async def _latest_success_by_lecture(
    db: AsyncSession, lecture_ids: list[uuid.UUID]
) -> dict[uuid.UUID, datetime]:
    """강의별 '가장 최근 성공 렌더' 시각. 3분기의 '해결' 판정에 쓴다.

    N+1 금지 — 강의 하나씩 묻지 않고 `lecture_id` 로 group by 해 한 번에 가져온다
    (`admin_artifacts` 와 같은 패턴).

    성공 시각은 `completed_at` 우선, 없으면 `created_at`. "triaged_at 이후에 성공이
    있었나"를 물으므로 **완료 시각**이 맞다 — triage 전에 제출됐어도 그 뒤에 끝났으면
    그건 해결이다.
    """
    if not lecture_ids:
        return {}
    rows = (
        await db.execute(
            select(
                VideoRender.lecture_id,
                func.max(func.coalesce(VideoRender.completed_at, VideoRender.created_at)),
            )
            .where(
                VideoRender.lecture_id.in_(lecture_ids),
                VideoRender.status == RenderStatus.ready,
            )
            .group_by(VideoRender.lecture_id)
        )
    ).all()
    return {r[0]: r[1] for r in rows if r[1] is not None}


def _split_passes(rows: list) -> list[list]:
    """한 강의의 실패 행(시간 오름차순)을 렌더 패스 단위로 끊는다."""
    groups: list[list] = []
    current: list = []
    prev: datetime | None = None
    for row in rows:
        created = _aware(row.created_at)
        if prev is not None and created is not None:
            if (created - prev).total_seconds() > _PASS_GAP_SECONDS:
                groups.append(current)
                current = []
        current.append(row)
        prev = created or prev
    if current:
        groups.append(current)
    return groups


async def failed_render_groups(
    db: AsyncSession,
    *,
    since_days: int = 7,
    cohort: str | None = None,
    user_id: uuid.UUID | None = None,
    page: int = 1,
    limit: int = 50,
    render_status: RenderStatus = RenderStatus.failed,
) -> dict:
    """실패 렌더를 강의+패스 단위로 묶어 페이지네이션해 돌려준다.

    페이지네이션은 **묶은 뒤**에 적용한다. 행 단위로 자르면 한 패스가 페이지 경계에
    걸려 같은 사고가 두 페이지로 쪼개진다.
    """
    since = datetime.now(timezone.utc) - timedelta(days=max(1, since_days))

    stmt = (
        select(
            VideoRender,
            Lecture.title,
            Course.title,
            User.id,
            User.name,
            User.email,
            User.cohort,
        )
        .join(Lecture, VideoRender.lecture_id == Lecture.id)
        .outerjoin(Course, Lecture.course_id == Course.id)
        .outerjoin(User, VideoRender.instructor_id == User.id)
        .where(
            VideoRender.status == render_status,
            VideoRender.created_at >= since,
        )
    )
    if user_id is not None:
        stmt = stmt.where(VideoRender.instructor_id == user_id)
    if cohort:
        stmt = stmt.where(User.cohort == cohort)

    # 색인 ix_video_renders_status_created (status, created_at DESC) 가 받는 정렬.
    stmt = stmt.order_by(VideoRender.created_at.desc()).limit(_MAX_SCAN_ROWS + 1)
    rows = (await db.execute(stmt)).all()

    truncated = len(rows) > _MAX_SCAN_ROWS
    if truncated:
        rows = rows[:_MAX_SCAN_ROWS]

    # 강의별로 모아 시간 오름차순 정렬 후 패스로 끊는다.
    by_lecture: dict[uuid.UUID, list] = {}
    meta: dict[uuid.UUID, tuple] = {}
    for render, lec_title, course_title, uid, uname, uemail, ucohort in rows:
        by_lecture.setdefault(render.lecture_id, []).append(render)
        meta[render.lecture_id] = (lec_title, course_title, uid, uname, uemail, ucohort)

    latest_success = await _latest_success_by_lecture(db, list(by_lecture.keys()))

    groups: list[dict] = []
    for lecture_id, lec_rows in by_lecture.items():
        lec_rows.sort(key=lambda r: _aware(r.created_at) or datetime.min.replace(tzinfo=timezone.utc))
        lec_title, course_title, uid, uname, uemail, ucohort = meta[lecture_id]
        success_at = _aware(latest_success.get(lecture_id))

        for pass_rows in _split_passes(lec_rows):
            # 대표 행 = 그 패스에서 가장 최근 실패. triage 는 이 id 로 건다.
            representative = pass_rows[-1]

            triaged_values = [_aware(r.triaged_at) for r in pass_rows if r.triaged_at]
            triaged_at = max(triaged_values) if triaged_values else None

            if triaged_at is None:
                derived = "new"
            elif success_at is not None and success_at > triaged_at:
                derived = "resolved"
            else:
                derived = "triaged"

            # 메모는 가장 최근에 적힌 것을 보여준다.
            note = next(
                (r.triage_note for r in reversed(pass_rows) if r.triage_note), None
            )

            slides = sorted({r.slide_number for r in pass_rows if r.slide_number is not None})
            distinct_errors: list[str] = []
            for r in reversed(pass_rows):
                msg = (r.error_message or "").strip()
                if msg and msg not in distinct_errors:
                    distinct_errors.append(msg)

            groups.append(
                {
                    "id": str(representative.id),
                    "render_ids": [str(r.id) for r in pass_rows],
                    "lecture_id": str(lecture_id),
                    "lecture_title": lec_title,
                    "course_title": course_title,
                    "user_id": str(uid) if uid else None,
                    "user_name": uname,
                    "user_email": uemail,
                    "cohort": ucohort,
                    "provider": _provider(representative.heygen_job_id),
                    "tts_provider": representative.tts_provider,
                    "error_message": distinct_errors[0] if distinct_errors else None,
                    "error_messages": distinct_errors,
                    "affected_slides": slides,
                    "affected_count": len(pass_rows),
                    "created_at": _iso(pass_rows[0].created_at),
                    "last_failed_at": _iso(representative.created_at),
                    "status": derived,
                    "triaged_at": _iso(triaged_at),
                    "triage_note": note,
                }
            )

    # 최근 사고부터. 정렬 키는 그 패스의 마지막 실패 시각.
    groups.sort(key=lambda g: g["last_failed_at"] or "", reverse=True)

    total = len(groups)
    counts = {
        "new": sum(1 for g in groups if g["status"] == "new"),
        "triaged": sum(1 for g in groups if g["status"] == "triaged"),
        "resolved": sum(1 for g in groups if g["status"] == "resolved"),
    }

    start = (page - 1) * limit
    page_items = groups[start : start + limit]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "since_days": since_days,
        "counts": counts,
        # 스캔 상한에 걸려 잘렸는지 — 조용히 자르면 "전부 봤다"로 오해된다.
        "truncated": truncated,
        "issues": page_items,
    }


async def unresolved_count(db: AsyncSession, *, since_days: int = 7) -> int:
    """사이드바 배지용 — 미확인(triaged_at IS NULL) 실패 **패스** 수.

    배지는 보조 정보이므로 목록과 같은 그룹핑을 다시 돌린다. 베타 규모에선 충분하고,
    행 수를 세면 슬라이드 수만큼 부풀어 배지가 목록과 어긋난다.
    """
    result = await failed_render_groups(db, since_days=since_days, page=1, limit=1)
    return result["counts"]["new"]


async def render_detail(db: AsyncSession, render_id: uuid.UUID) -> dict | None:
    """단일 실패 렌더의 상세 — 드로어가 여는 대상.

    같은 패스의 형제 행까지 함께 돌려줘 드로어가 영향 슬라이드를 그릴 수 있게 한다.
    """
    row = (
        await db.execute(
            select(
                VideoRender,
                Lecture.title,
                Course.title,
                User.id,
                User.name,
                User.email,
            )
            .join(Lecture, VideoRender.lecture_id == Lecture.id)
            .outerjoin(Course, Lecture.course_id == Course.id)
            .outerjoin(User, VideoRender.instructor_id == User.id)
            .where(VideoRender.id == render_id)
        )
    ).first()
    if row is None:
        return None

    render, lec_title, course_title, uid, uname, uemail = row
    return {
        "id": str(render.id),
        "lecture_id": str(render.lecture_id),
        "lecture_title": lec_title,
        "course_title": course_title,
        "user_id": str(uid) if uid else None,
        "user_name": uname,
        "user_email": uemail,
        "provider": _provider(render.heygen_job_id),
        "tts_provider": render.tts_provider,
        "avatar_id": render.avatar_id,
        "slide_number": render.slide_number,
        "status": render.status.value,
        "error_message": render.error_message,
        "created_at": _iso(render.created_at),
        "completed_at": _iso(render.completed_at),
        "triaged_at": _iso(render.triaged_at),
        "triage_note": render.triage_note,
    }
