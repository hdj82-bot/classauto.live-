"""Q&A API — RAG 기반 질의응답 + 교수자용 종합 리포트 내보내기."""
import asyncio
import csv
import io
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user_optional,
    require_professor,
    require_student,
)
from app.db.session import SyncSessionLocal, get_db
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.qa_log import QALog
from app.models.session import LearningSession
from app.models.user import User
from app.services.pipeline.qa import answer_question
from app.services.pipeline.qa_avatar import resolve_avatar_for_question

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/qa", tags=["qa"])


class QARequest(BaseModel):
    session_id: uuid.UUID
    lecture_id: uuid.UUID
    # 1차 가드레일 — 입력 제약(docs/planning/02 §3.1: 텍스트 ≤ 500자). 서버 사이드에서
    # 강제해 "보고서 붙여넣기"식 남용을 RAG·Claude 호출 전에 차단한다(비용 0). 초과/공백
    # 질문은 422 로 거부 — 프론트 글자수 카운터(500/500)와 동일 한도.
    question: str = Field(..., min_length=1, max_length=500)


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

            # 아바타 캐시 — 겹치는(유사도 0.9↑) 질문에 사전 렌더된 클립이 ready 면
            # avatar 로 함께 내려준다. 미적중이면 클러스터 큐에 적립(렌더는 야간 배치 —
            # 실시간 렌더 없음). 어떤 실패도 텍스트 답변을 막지 않도록 SAVEPOINT 로 격리.
            avatar_payload = None
            try:
                with db.begin_nested():
                    instructor_id = db.execute(
                        select(Course.instructor_id).where(Course.id == lecture.course_id)
                    ).scalar_one_or_none()
                    resolution = resolve_avatar_for_question(
                        db,
                        lecture_id=body.lecture_id,
                        instructor_id=instructor_id,
                        question=body.question,
                        answer=result.answer,
                        in_scope=result.in_scope,
                    )
                    avatar_payload = resolution.payload
            except Exception:  # noqa: BLE001
                avatar_payload = None
                logger.exception("Q&A 아바타 캐시 처리 실패(텍스트 답변은 정상 반환)")

            db.commit()
            return result, avatar_payload

    try:
        result, avatar_payload = await loop.run_in_executor(None, _run)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=500, detail="Q&A 처리 중 오류가 발생했습니다.")

    return {
        "answer": result.answer,
        "in_scope": result.in_scope,
        "avatar": avatar_payload,
        "cost_usd": result.cost_usd,
    }


# ── 교수자 미리보기 Q&A (세션 없이, 소유 강의 한정) ───────────────────────────
#
# 배포 전 교수자가 학생과 동일한 플레이어로 자유 채팅 Q&A 를 점검하는 경로.
# 학생 /qa 와 달리 세션·QALog·아바타 큐가 없다(로그·비용 오염 방지) — RAG 답변만.


class QAPreviewRequest(BaseModel):
    lecture_id: uuid.UUID
    question: str = Field(..., min_length=1, max_length=500)


@router.post("/preview", summary="Q&A 미리보기 (소유 교수자, 세션 없이)")
async def preview_question(
    body: QAPreviewRequest,
    user: User = Depends(require_professor),
):
    loop = asyncio.get_event_loop()

    def _run():
        with SyncSessionLocal() as db:
            lecture = db.execute(
                select(Lecture).where(Lecture.id == body.lecture_id)
            ).scalar_one_or_none()
            if not lecture or not lecture.pipeline_task_id:
                raise LookupError("강의 파이프라인이 아직 처리되지 않았습니다.")
            instructor_id = db.execute(
                select(Course.instructor_id).where(Course.id == lecture.course_id)
            ).scalar_one_or_none()
            if instructor_id != user.id:
                raise PermissionError("미리보기 Q&A 는 소유 교수자만 가능합니다.")
            # session_id 자리에 합성 키 — 로그/세션 없이 RAG 답변만 받는다.
            return answer_question(
                db, lecture.pipeline_task_id, f"preview-{user.id}", body.question
            )

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
        "avatar": None,
        "cost_usd": result.cost_usd,
    }


# ── 공개 Q&A (인증 불필요, 발행 강의 한정) ───────────────────────────────────
#
# 배포 링크로 로그인 없이 들어온 익명 시청자도 Q&A 를 쓸 수 있게 하는 경로
# (교수자 결정 2026-06-12: 익명 시청 + 익명 Q&A 허용). 세션·QALog·아바타 큐가
# 없다(로그·비용 오염 방지) — RAG 답변만. 남용·비용은 전역 RateLimitMiddleware
# 가 IP 당 분당 30회로 제한한다(RATE_LIMITS["/api/v1/qa"]).


class QAPublicRequest(BaseModel):
    lecture_id: uuid.UUID
    question: str = Field(..., min_length=1, max_length=500)


@router.post("/public", summary="공개 Q&A (발행 강의, 인증 불필요)")
async def public_question(
    body: QAPublicRequest,
    viewer: User | None = Depends(get_current_user_optional),
):
    loop = asyncio.get_event_loop()

    def _run():
        with SyncSessionLocal() as db:
            lecture = db.execute(
                select(Lecture).where(Lecture.id == body.lecture_id)
            ).scalar_one_or_none()
            if not lecture or not lecture.pipeline_task_id:
                raise LookupError("강의 파이프라인이 아직 처리되지 않았습니다.")
            # 익명/비소유자는 발행 강의에만 질문 가능. 소유 교수자는 미발행도 허용.
            if not lecture.is_published:
                instructor_id = db.execute(
                    select(Course.instructor_id).where(Course.id == lecture.course_id)
                ).scalar_one_or_none()
                if viewer is None or instructor_id != viewer.id:
                    raise PermissionError("아직 발행되지 않은 강의입니다.")
            # session_id 자리에 합성 키 — 로그/세션 없이 RAG 답변만 받는다.
            return answer_question(
                db, lecture.pipeline_task_id, "public", body.question
            )

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
        "avatar": None,
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
