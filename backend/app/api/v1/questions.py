"""평가 시스템 API 라우터."""
import logging
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_professor, require_student
from app.core.config import settings
from app.core.redis import get_redis
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["questions"])


# Critical 9: 입력/요청 한도
MAX_PPT_CONTENT_BYTES = 50 * 1024  # 50KB — Claude API 비용 방어
QGEN_RATE_LIMIT_WINDOW_SECONDS = 300  # 5분
QGEN_RATE_LIMIT_MAX = 1               # 윈도우 내 1회


async def _enforce_qgen_rate_limit(lecture_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Redis ZSET 기반 sliding window rate limit — (lecture_id, user_id) 단위 5분당 1회.

    Critical 9: Claude API 호출은 비싼 작업. 동일 강의·동일 교수자가
    1초 안에 여러 번 클릭해도 최대 1회만 통과시켜야 비용 폭주 방지.
    Redis 미설정/장애 시에는 fail-open — 로깅 후 통과.
    """
    redis_client = None
    try:
        redis_client = get_redis()
    except Exception as exc:
        logger.warning("rate limit: Redis 초기화 실패 — fail-open: %s", exc)
        return

    if redis_client is None:
        return

    key = f"qgen:rl:{lecture_id}:{user_id}"
    now_ms = int(time.time() * 1000)
    window_start_ms = now_ms - QGEN_RATE_LIMIT_WINDOW_SECONDS * 1000
    member = f"{now_ms}:{uuid.uuid4().hex}"

    try:
        # ZREMRANGEBYSCORE 로 윈도우 외 만료, ZCARD 로 현재 카운트, 통과 시 ZADD + EXPIRE
        await redis_client.zremrangebyscore(key, 0, window_start_ms)
        count = await redis_client.zcard(key)
        if count >= QGEN_RATE_LIMIT_MAX:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"문제 생성은 강의·사용자별 "
                    f"{QGEN_RATE_LIMIT_WINDOW_SECONDS // 60}분에 "
                    f"{QGEN_RATE_LIMIT_MAX}회만 가능합니다. 잠시 후 다시 시도해주세요."
                ),
            )
        await redis_client.zadd(key, {member: now_ms})
        await redis_client.expire(key, QGEN_RATE_LIMIT_WINDOW_SECONDS)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("rate limit: Redis 쿼리 실패 — fail-open: %s", exc)


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
    # ── Critical 9: ppt_content 50KB 한도 (Claude API 토큰 비용 폭주 방지) ──
    ppt_bytes = len(body.ppt_content.encode("utf-8"))
    if ppt_bytes > MAX_PPT_CONTENT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"ppt_content 가 {MAX_PPT_CONTENT_BYTES // 1024}KB 한도를 초과했습니다 "
                f"(현재 {ppt_bytes // 1024}KB)."
            ),
        )

    # ── Critical 9: lecture+user 단위 rate limit (5분당 1회) ──
    await _enforce_qgen_rate_limit(lecture_id, current_user.id)

    try:
        formative_created, summative_created = await question_svc.generate_questions(
            db=db,
            lecture_id=lecture_id,
            ppt_content=body.ppt_content,
            formative_count=body.formative_count,
            summative_count=body.summative_count,
            video_duration_seconds=body.video_duration_seconds,
        )
    except HTTPException:
        raise
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
