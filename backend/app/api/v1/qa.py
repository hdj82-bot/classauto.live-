"""Q&A API — RAG 기반 질의응답 + 교수자용 종합 리포트 내보내기."""
import asyncio
import csv
import io
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor, require_student
from app.db.session import SyncSessionLocal, get_db
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.qa_log import QALog
from app.models.user import User
from app.services.pipeline.qa import answer_question
from app.services.pipeline.qa_avatar import resolve_avatar_for_question

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/qa", tags=["qa"])
# 계약 B 정식 경로(prefix 없음) — 프론트 PlayerV2(playbackApi)가 호출하는
# POST /api/lectures/{lecture_id}/qa/ask 를 제공한다. main.py 에서 함께 include.
lecture_qa_router = APIRouter(tags=["qa"])


class QARequest(BaseModel):
    """구 경로(POST /api/v1/qa) 요청 — lecture_id 를 body 에 담는다(호환 유지)."""
    session_id: uuid.UUID
    lecture_id: uuid.UUID
    question: str


class QAAskBody(BaseModel):
    """계약 B 요청 — lecture_id 는 경로, body 는 {question, session_id}."""
    question: str
    session_id: uuid.UUID


def _process_qa(*, session_id: uuid.UUID, lecture_id: uuid.UUID, question: str, user_id: uuid.UUID) -> dict:
    """질문 1건 처리(동기) — 텍스트 답변(RAG) 즉시 + 아바타 캐시 적중 시 부가.

    계약 B: 텍스트는 무조건 즉시, 겹치는 질문(유사도 0.9↑) ready 클립만 ``avatar``
    포함, 미적중이면 avatar=null + 클러스터 큐 적립(실시간 렌더 없음). 구·신 경로가
    공유한다. LookupError = 파이프라인 미처리(404 매핑).
    """
    with SyncSessionLocal() as db:
        lecture = db.execute(
            select(Lecture).where(Lecture.id == lecture_id)
        ).scalar_one_or_none()
        if not lecture or not lecture.pipeline_task_id:
            raise LookupError("강의 파이프라인이 아직 처리되지 않았습니다.")

        # ── 1) 텍스트 답변(RAG) — 무조건 즉시 ──
        result = answer_question(db, lecture.pipeline_task_id, str(session_id), question)

        top_slide_numbers = (
            ",".join(str(r.slide_number) for r in result.top_slides)
            if result.top_slides else None
        )
        top_similarity = (
            max(r.similarity for r in result.top_slides)
            if result.top_slides else None
        )
        source_slides = (
            [r.slide_number for r in result.top_slides]
            if (result.in_scope and result.top_slides) else []
        )
        db.add(QALog(
            session_id=session_id,
            lecture_id=lecture_id,
            user_id=user_id,
            task_id=lecture.pipeline_task_id,
            question=question,
            answer=result.answer,
            in_scope=result.in_scope,
            responded=result.in_scope,
            top_slide_numbers=top_slide_numbers,
            top_similarity=top_similarity,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            cost_usd=result.cost_usd,
        ))

        # ── 2) 아바타 캐시 — 적중 시에만 포함, 미적중이면 적립(렌더 X) ──
        # 어떤 실패도 텍스트 답변을 막지 않는다(계약 B: 텍스트 무조건 즉시).
        # SAVEPOINT 로 격리 — 캐시 측 DB 오류가 QALog/최종 commit 을 오염시키지 않게.
        avatar_payload = None
        try:
            with db.begin_nested():
                instructor_id = db.execute(
                    select(Course.instructor_id).where(Course.id == lecture.course_id)
                ).scalar_one_or_none()
                resolution = resolve_avatar_for_question(
                    db,
                    lecture_id=lecture_id,
                    instructor_id=instructor_id,
                    question=question,
                    answer=result.answer,
                    in_scope=result.in_scope,
                )
                avatar_payload = resolution.payload
        except Exception:  # noqa: BLE001
            avatar_payload = None
            logger.exception("Q&A 아바타 캐시 처리 실패(텍스트 답변은 정상 반환)")

        db.commit()
        return {
            "answer": result.answer,
            "in_scope": result.in_scope,
            "source_slides": source_slides,
            "avatar": avatar_payload,
            "cost_usd": result.cost_usd,
        }


async def _ask(session_id: uuid.UUID, lecture_id: uuid.UUID, question: str, user_id: uuid.UUID) -> dict:
    """_process_qa 를 executor 에서 실행하고 예외를 HTTP 로 매핑(구·신 경로 공유)."""
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(
            None,
            lambda: _process_qa(
                session_id=session_id, lecture_id=lecture_id, question=question, user_id=user_id
            ),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=500, detail="Q&A 처리 중 오류가 발생했습니다.")


@router.post("", summary="Q&A 질문 (구 경로 — 호환 유지)")
async def ask_question(
    body: QARequest,
    user: User = Depends(require_student),
):
    """구 경로. 신규 클라이언트는 POST /api/lectures/{id}/qa/ask(계약 B)를 쓴다."""
    return await _ask(body.session_id, body.lecture_id, body.question, user.id)


@lecture_qa_router.post("/api/lectures/{lecture_id}/qa/ask", summary="Q&A 질문 (계약 B)")
async def ask_question_for_lecture(
    lecture_id: uuid.UUID,
    body: QAAskBody,
    user: User = Depends(require_student),
):
    """계약 B — 프론트 PlayerV2(playbackApi)가 호출. lecture_id 는 경로, body 는
    {question, session_id}. 응답은 구 경로와 동일(answer/in_scope/source_slides/avatar).
    """
    return await _ask(body.session_id, lecture_id, body.question, user.id)


# ── 교수자용 Q&A 종합 리포트 내보내기 ─────────────────────────────────────────
#
# /professor/inbox 페이지가 요구하는 "강의별 질문/답변 종합 리포트" 다운로드.
# - 전체 단위: 교수자가 소유한 모든 강의의 Q&A 로그.
# - 강의(course) 단위: `course_id` 지정.
# - 강의 영상(lecture) 단위: `lecture_id` 지정.
# 강의명·영상명·학생 이름/학번·질문·챗봇 답변·시각 컬럼만 노출.
# 진단/RAG 메타(유사도·in_scope·비용)는 의도적으로 제외 (인박스 단순화 정책).


def _format_ts(dt: datetime | None) -> str:
    if not dt:
        return ""
    return dt.strftime("%Y-%m-%d %H:%M:%S")


@router.get("/export", summary="교수자 Q&A 종합 리포트 내보내기")
async def export_qa_report(
    format: str = Query("csv", pattern="^csv$"),
    course_id: uuid.UUID | None = Query(None),
    lecture_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    """소유 강의의 Q&A 로그를 CSV 로 내려준다.

    - 인자 없음 → 본인 소유 *모든* 강의/영상의 Q&A.
    - `lecture_id` → 해당 영상 한정 (소유 검증).
    - `course_id` → 해당 강의(코스) 전체 영상 (소유 검증).
    `lecture_id` 와 `course_id` 가 동시에 오면 `lecture_id` 우선.
    """
    # 1) 대상 강의 영상 집합 + 소유 검증
    stmt = (
        select(Lecture, Course)
        .join(Course, Lecture.course_id == Course.id)
        .where(Course.instructor_id == user.id)
    )
    if lecture_id is not None:
        stmt = stmt.where(Lecture.id == lecture_id)
    elif course_id is not None:
        stmt = stmt.where(Course.id == course_id)
    rows = (await db.execute(stmt)).all()
    if (lecture_id is not None or course_id is not None) and not rows:
        raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")

    lecture_ids = [lec.id for lec, _ in rows]
    course_by_lecture: dict[uuid.UUID, Course] = {lec.id: c for lec, c in rows}
    lecture_by_id: dict[uuid.UUID, Lecture] = {lec.id: lec for lec, _ in rows}

    # 2) QA 로그 + 학생 정보 join
    logs: list[tuple[QALog, User]] = []
    if lecture_ids:
        log_stmt = (
            select(QALog, User)
            .join(User, QALog.user_id == User.id)
            .where(QALog.lecture_id.in_(lecture_ids))
            .order_by(QALog.lecture_id, QALog.created_at.asc())
        )
        logs = list((await db.execute(log_stmt)).all())

    # 3) CSV 작성 (Excel 한글 호환 BOM)
    buf = io.StringIO()
    buf.write("﻿")
    writer = csv.writer(buf)
    writer.writerow([
        "강의",
        "강의 영상",
        "학생",
        "학번",
        "질문",
        "챗봇 답변",
        "시각",
    ])
    for log, student in logs:
        lec = lecture_by_id.get(log.lecture_id)
        course = course_by_lecture.get(log.lecture_id)
        writer.writerow([
            course.title if course else "",
            lec.title if lec else "",
            student.name or "",
            student.student_number or "",
            log.question or "",
            log.answer or "",
            _format_ts(log.created_at),
        ])

    buf.seek(0)
    if lecture_id is not None:
        filename = f"qa_lecture_{lecture_id}.csv"
    elif course_id is not None:
        filename = f"qa_course_{course_id}.csv"
    else:
        filename = "qa_report_all.csv"

    return StreamingResponse(
        buf,
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
