"""평가 시스템 API 라우터."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_professor, require_student
from app.core.config import settings
from app.db.session import get_db
from app.models.question import AssessmentType
from app.models.user import User
from app.schemas.question import (
    GenerateResponse,
    QuestionGenerateRequest,
    QuestionSetResponse,
)
from app.schemas.response import SessionResponsesResult, SubmitResponsesRequest
from app.services import question as question_svc
from app.services import response as response_svc

router = APIRouter(prefix="/api", tags=["questions"])


# ── 교수자: 문제 자동 생성 ───────────────────────────────────────────────────

@router.post(
    "/lectures/{lecture_id}/questions/generate",
    response_model=GenerateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="PPT 기반 문제 자동 생성 (교수자 전용)",
)
async def generate_questions(
    lecture_id: uuid.UUID,
    body: QuestionGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    """Claude API를 통해 PPT 슬라이드 내용으로 형성/총괄평가 문제 자동 생성."""
    try:
        formative_created, summative_created = await question_svc.generate_questions(
            db=db,
            lecture_id=lecture_id,
            ppt_content=body.ppt_content,
            formative_count=body.formative_count,
            summative_count=body.summative_count,
            video_duration_seconds=body.video_duration_seconds,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"문제 생성 중 오류가 발생했습니다: {exc}",
        ) from exc

    return GenerateResponse(
        lecture_id=lecture_id,
        formative_created=formative_created,
        summative_created=summative_created,
        message=(
            f"형성평가 {formative_created}문항, "
            f"총괄평가 {summative_created}문항이 생성되었습니다."
        ),
    )


# ── 학습자: 문제 조회 ─────────────────────────────────────────────────────────

@router.get(
    "/questions/{lecture_id}",
    response_model=QuestionSetResponse,
    summary="강의 문제 조회 (학습자 전용)",
)
async def get_questions(
    lecture_id: uuid.UUID,
    assessment_type: AssessmentType = AssessmentType.formative,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """
    세션 ID를 기반으로 랜덤화된 문제 목록을 반환합니다.
    - `formative`: 형성평가 (기본값)
    - `summative`: 총괄평가
    """
    session = await question_svc.get_or_create_session(
        db=db,
        user_id=current_user.id,
        lecture_id=lecture_id,
    )

    serve_count = (
        settings.FORMATIVE_SERVE_COUNT
        if assessment_type == AssessmentType.formative
        else settings.SUMMATIVE_SERVE_COUNT
    )

    questions, total = await question_svc.get_questions_for_session(
        db=db,
        lecture_id=lecture_id,
        assessment_type=assessment_type,
        session_id=session.id,
        serve_count=serve_count,
    )

    if not questions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 강의에 출제된 문제가 없습니다.",
        )

    return QuestionSetResponse(
        lecture_id=lecture_id,
        session_id=session.id,
        assessment_type=assessment_type.value,
        questions=questions,
        total_in_pool=total,
        served_count=len(questions),
    )


# ── 학습자: 응답 제출 ─────────────────────────────────────────────────────────

@router.post(
    "/responses",
    response_model=list[dict],
    status_code=status.HTTP_201_CREATED,
    summary="응답 제출 (학습자 전용)",
)
async def submit_responses(
    body: SubmitResponsesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_student),
):
    """
    학습자의 응답을 제출합니다.
    - 타임스탬프 허용 오차(±120초) 벗어나면 `timestamp_valid=false`
    - 객관식은 자동 채점, 주관식은 `is_correct=null` (수동 채점 대기)
    """
    try:
        saved = await response_svc.submit_responses(
            db=db,
            session_id=body.session_id,
            user_id=current_user.id,
            responses=body.responses,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    return [
        {
            "id": str(r.id),
            "question_id": str(r.question_id),
            "is_correct": r.is_correct,
            "timestamp_valid": r.timestamp_valid,
        }
        for r in saved
    ]


# ── 학습자/교수자: 결과 조회 ──────────────────────────────────────────────────

@router.get(
    "/responses/{session_id}",
    response_model=SessionResponsesResult,
    summary="세션 응답 결과 조회",
)
async def get_session_responses(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """세션의 전체 응답 및 점수를 반환합니다."""
    try:
        result = await response_svc.get_session_results(
            db=db,
            session_id=session_id,
            user_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return result
