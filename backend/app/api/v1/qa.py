"""Q&A API — RAG 기반 질의응답 + 교수자용 종합 리포트 내보내기."""
import asyncio
import csv
import io
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
from app.models.session import LearningSession
from app.models.user import User
from app.services.pipeline.qa import answer_question

router = APIRouter(prefix="/api/v1/qa", tags=["qa"])


class QARequest(BaseModel):
    session_id: uuid.UUID
    lecture_id: uuid.UUID
    question: str


@router.post("", summary="Q&A 질문")
async def ask_question(
    body: QARequest,
    user: User = Depends(require_student),
):
    loop = asyncio.get_event_loop()

    def _run():
        with SyncSessionLocal() as db:
            # 권한·정합 검증 — 본인 세션이고 그 세션이 이 강의의 것인지 확인한다.
            # (검증 없으면 임의 학생이 아무 강의의 RAG 를 호출하고 비용을 그 강의에
            #  전가할 수 있다.)
            session = db.execute(
                select(LearningSession).where(LearningSession.id == body.session_id)
            ).scalar_one_or_none()
            if (
                session is None
                or session.user_id != user.id
                or session.lecture_id != body.lecture_id
            ):
                raise PermissionError("이 세션에 대한 권한이 없습니다.")

            lecture = db.execute(
                select(Lecture).where(Lecture.id == body.lecture_id)
            ).scalar_one_or_none()
            if not lecture or not lecture.pipeline_task_id:
                raise LookupError("강의 파이프라인이 아직 처리되지 않았습니다.")
            result = answer_question(db, lecture.pipeline_task_id, str(body.session_id), body.question)

            top_slide_numbers = (
                ",".join(str(r.slide_number) for r in result.top_slides)
                if result.top_slides else None
            )
            top_similarity = (
                max(r.similarity for r in result.top_slides)
                if result.top_slides else None
            )
            db.add(QALog(
                session_id=body.session_id,
                lecture_id=body.lecture_id,
                user_id=user.id,
                task_id=lecture.pipeline_task_id,
                question=body.question,
                answer=result.answer,
                in_scope=result.in_scope,
                responded=result.in_scope,
                top_slide_numbers=top_slide_numbers,
                top_similarity=top_similarity,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                cost_usd=result.cost_usd,
            ))
            db.commit()
            return result

    try:
        result = await loop.run_in_executor(None, _run)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=500, detail="Q&A 처리 중 오류가 발생했습니다.")

    return {
        "answer": result.answer,
        "in_scope": result.in_scope,
        "cost_usd": result.cost_usd,
    }


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
