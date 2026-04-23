"""응답 제출 및 채점 서비스."""
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.assessment_result import AssessmentResult
from app.models.question import Question, QuestionType
from app.models.response import Response
from app.models.session import LearningSession
from app.schemas.response import (
    SessionResponsesResult,
    SessionScore,
    SingleResponse,
)

logger = logging.getLogger(__name__)


# ── 타임스탬프 검증 ───────────────────────────────────────────────────────────

def _check_timestamp(
    question: Question,
    video_timestamp_seconds: int,
) -> bool:
    """형성평가: 문제 타임스탬프 ± 허용오차 내 응답 여부 확인."""
    if question.timestamp_seconds is None:
        # 총괄평가는 타임스탬프 검사 불필요
        return True
    # 음수 타임스탬프는 항상 무효
    if video_timestamp_seconds < 0:
        return False
    diff = abs(video_timestamp_seconds - question.timestamp_seconds)
    return diff <= settings.TIMESTAMP_TOLERANCE_SECONDS


# ── 자동 채점 ─────────────────────────────────────────────────────────────────

def _grade(question: Question, user_answer: str) -> bool | None:
    """객관식: 정답 비교. 주관식: None(수동 채점)."""
    if question.question_type == QuestionType.short_answer:
        return None  # 주관식은 자동 채점 불가
    # 객관식: 인덱스 비교 (0~3 범위 검증)
    answer = user_answer.strip()
    correct = (question.correct_answer or "").strip()
    if answer not in ("0", "1", "2", "3"):
        return False  # 유효하지 않은 객관식 답변
    return answer == correct


# ── 응답 제출 ─────────────────────────────────────────────────────────────────

async def submit_responses(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    responses: list[SingleResponse],
) -> list[Response]:
    """응답 일괄 제출 및 채점. 세션 소유권도 검증."""
    # 세션 소유권 검증
    sess_result = await db.execute(
        select(LearningSession).where(
            LearningSession.id == session_id,
            LearningSession.user_id == user_id,
        )
    )
    session = sess_result.scalars().first()
    if session is None:
        raise ValueError("세션을 찾을 수 없거나 접근 권한이 없습니다.")

    # 해당 question_id 목록 조회
    question_ids = [r.question_id for r in responses]
    q_result = await db.execute(
        select(Question).where(Question.id.in_(question_ids))
    )
    questions_map: dict[uuid.UUID, Question] = {
        q.id: q for q in q_result.scalars().all()
    }

    skipped_ids: list[str] = []
    saved: list[Response] = []
    assessment_records: list[AssessmentResult] = []
    for item in responses:
        question = questions_map.get(item.question_id)
        if question is None:
            skipped_ids.append(str(item.question_id))
            continue

        timestamp_valid = _check_timestamp(question, item.video_timestamp_seconds)
        if timestamp_valid:
            is_correct = _grade(question, item.user_answer)
        else:
            # 타임스탬프 무효: 주관식은 None 유지, 객관식은 False
            is_correct = None if question.question_type == QuestionType.short_answer else False

        resp = Response(
            session_id=session_id,
            question_id=item.question_id,
            user_answer=item.user_answer,
            is_correct=is_correct,
            video_timestamp_seconds=item.video_timestamp_seconds,
            timestamp_valid=timestamp_valid,
        )
        db.add(resp)
        saved.append(resp)

        # AssessmentResult는 자동 채점된 응답(객관식)만 기록 — is_correct nullable 제약 때문
        if is_correct is not None:
            assessment_records.append(AssessmentResult(
                lecture_id=session.lecture_id,
                session_id=session_id,
                user_id=user_id,
                question_type=question.question_type.value,
                question_text=question.content,
                correct_answer=question.correct_answer or "",
                user_answer=item.user_answer,
                is_correct=is_correct,
            ))

    if skipped_ids:
        logger.warning("존재하지 않는 question_id 건너뜀: %s", skipped_ids)

    for ar in assessment_records:
        db.add(ar)

    await db.commit()
    for r in saved:
        await db.refresh(r)
    return saved


# ── 결과 조회 ─────────────────────────────────────────────────────────────────

async def get_session_results(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> SessionResponsesResult:
    """세션 응답 결과 + 점수 집계."""
    # 세션 소유권 검증
    sess_result = await db.execute(
        select(LearningSession).where(
            LearningSession.id == session_id,
            LearningSession.user_id == user_id,
        )
    )
    session = sess_result.scalars().first()
    if session is None:
        raise ValueError("세션을 찾을 수 없거나 접근 권한이 없습니다.")

    # 응답 + 연관 question eager load
    r_result = await db.execute(
        select(Response)
        .where(Response.session_id == session_id)
        .options(selectinload(Response.question))
        .order_by(Response.responded_at)
    )
    resp_list = list(r_result.scalars().all())

    # 점수 집계
    total = len(resp_list)
    correct = sum(1 for r in resp_list if r.is_correct is True)
    short_answer_pending = sum(1 for r in resp_list if r.is_correct is None)
    timestamp_violations = sum(1 for r in resp_list if not r.timestamp_valid)
    incorrect = total - correct - short_answer_pending

    score = SessionScore(
        total=total,
        correct=correct,
        incorrect=incorrect,
        short_answer_pending=short_answer_pending,
        timestamp_violations=timestamp_violations,
    )

    return SessionResponsesResult(
        session_id=session_id,
        score=score,
        responses=resp_list,
    )
