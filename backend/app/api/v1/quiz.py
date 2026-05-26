"""소크라테스식 인터랙티브 퀴즈 저작 API (교수자 전용).

대화 1턴은 무거운 Sonnet 호출이라 services/pipeline/qa.py 와 동일하게 동기 Session +
run_in_executor 로 처리해 이벤트 루프를 막지 않는다. rate-limit·락은 questions.py 의
ZSET/SETNX 패턴을 따르되, 다중 턴 대화이므로 한도를 더 관대하게 둔다.
"""
import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require_professor
from app.core.redis import get_redis
from app.db.session import SyncSessionLocal
from app.models.user import User
from app.schemas.quiz import (
    AuthoredQuizItem,
    AuthoredQuizListResponse,
    QuizConfirmRequest,
    QuizConfirmResponse,
    QuizDraft,
    SocraticTurnRequest,
    SocraticTurnResponse,
)
from app.services import quiz_socratic as quiz_svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["quiz"])

# 대화 1턴 rate-limit — 일괄 생성(5분당 1회)보다 관대하게(다중 턴). 비용 폭주 방지선.
SOCRATIC_RATE_LIMIT_WINDOW_SECONDS = 300
SOCRATIC_RATE_LIMIT_MAX = 40
# 확정 저장 중복 방지 락 TTL.
CONFIRM_LOCK_TTL_SECONDS = 30


async def _enforce_socratic_rate_limit(lecture_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Redis ZSET sliding window — (lecture, user) 5분당 SOCRATIC_RATE_LIMIT_MAX 턴.

    Redis 미설정/장애 시 fail-open(로깅 후 통과).
    """
    try:
        redis_client = get_redis()
    except Exception as exc:  # noqa: BLE001
        logger.warning("quiz rate limit: Redis 초기화 실패 — fail-open: %s", exc)
        return
    if redis_client is None:
        return

    key = f"quiz:socratic:rl:{lecture_id}:{user_id}"
    now_ms = int(time.time() * 1000)
    window_start_ms = now_ms - SOCRATIC_RATE_LIMIT_WINDOW_SECONDS * 1000
    member = f"{now_ms}:{uuid.uuid4().hex}"
    try:
        await redis_client.zremrangebyscore(key, 0, window_start_ms)
        count = await redis_client.zcard(key)
        if count >= SOCRATIC_RATE_LIMIT_MAX:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="대화 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
            )
        await redis_client.zadd(key, {member: now_ms})
        await redis_client.expire(key, SOCRATIC_RATE_LIMIT_WINDOW_SECONDS)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("quiz rate limit: Redis 쿼리 실패 — fail-open: %s", exc)


@asynccontextmanager
async def _confirm_lock(lecture_id: uuid.UUID):
    """확정 저장 동시 요청 가드 (Redis SETNX). 미설정/장애 시 fail-open."""
    try:
        redis_client = get_redis()
    except Exception:  # noqa: BLE001
        yield
        return
    if redis_client is None:
        yield
        return

    key = f"quiz:confirm:lock:{lecture_id}"
    try:
        acquired = bool(await redis_client.set(key, "1", nx=True, ex=CONFIRM_LOCK_TTL_SECONDS))
    except Exception as exc:  # noqa: BLE001
        logger.warning("quiz confirm lock: SETNX 실패 — fail-open: %s", exc)
        yield
        return

    if not acquired:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 문제 저장이 진행 중입니다. 잠시 후 다시 시도해주세요.",
        )
    try:
        yield
    finally:
        try:
            await redis_client.delete(key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("quiz confirm lock: 해제 실패 (TTL 만료 의존): %s", exc)


# ── 대화 1턴 ──────────────────────────────────────────────────────────────────

@router.post(
    "/lectures/{lecture_id}/quiz/socratic",
    response_model=SocraticTurnResponse,
    summary="소크라테스식 퀴즈 저작 대화 1턴 (교수자 전용)",
)
async def quiz_socratic_turn(
    lecture_id: uuid.UUID,
    body: SocraticTurnRequest,
    current_user: User = Depends(require_professor),
):
    """슬라이드 경계 내용을 근거로 클로드(Sonnet)가 초안+근거를 제시하고 유도 질문을 던진다.

    messages 가 비어 있으면 첫 턴(클로드가 먼저 제안). 응답은 자연어 reply + 구조화 draft.
    """
    await _enforce_socratic_rate_limit(lecture_id, current_user.id)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    loop = asyncio.get_event_loop()

    def _run():
        with SyncSessionLocal() as db:
            return quiz_svc.socratic_turn(
                db=db,
                lecture_id=lecture_id,
                insert_after_slide_index=body.insert_after_slide_index,
                question_type=body.question_type,
                difficulty=body.difficulty,
                messages=messages,
            )

    try:
        result = await loop.run_in_executor(None, _run)
    except Exception as exc:  # noqa: BLE001
        logger.error("소크라테스 대화 실패: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="대화 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        ) from exc

    draft = None
    if result.draft:
        try:
            draft = QuizDraft(**result.draft)
        except Exception as exc:  # noqa: BLE001
            logger.warning("draft 검증 실패 — 미리보기 생략: %s", exc)

    return SocraticTurnResponse(reply=result.reply, draft=draft, done=result.done)


# ── 확정 저장 ─────────────────────────────────────────────────────────────────

@router.post(
    "/lectures/{lecture_id}/quiz/confirm",
    response_model=QuizConfirmResponse,
    status_code=status.HTTP_201_CREATED,
    summary="확정된 인터랙티브 퀴즈 저장 (교수자 전용)",
)
async def quiz_confirm(
    lecture_id: uuid.UUID,
    body: QuizConfirmRequest,
    current_user: User = Depends(require_professor),
):
    """확정된 문제를 형성평가 + 슬라이드 경계 anchor 로 저장."""
    async with _confirm_lock(lecture_id):
        loop = asyncio.get_event_loop()

        def _run():
            with SyncSessionLocal() as db:
                q = quiz_svc.confirm_quiz(
                    db=db,
                    lecture_id=lecture_id,
                    insert_after_slide_index=body.insert_after_slide_index,
                    question_type=body.question_type,
                    difficulty=body.difficulty,
                    content=body.content,
                    options=body.options,
                    correct_answer=body.correct_answer,
                    explanation=body.explanation,
                )
                return {
                    "id": q.id,
                    "insert_after_slide_index": q.insert_after_slide_index,
                    "timestamp_seconds": q.timestamp_seconds,
                }

        try:
            saved = await loop.run_in_executor(None, _run)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            ) from exc
        except Exception as exc:  # noqa: BLE001
            logger.error("퀴즈 저장 실패: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="문제 저장 중 오류가 발생했습니다.",
            ) from exc

    return QuizConfirmResponse(
        id=saved["id"],
        insert_after_slide_index=saved["insert_after_slide_index"],
        timestamp_seconds=saved["timestamp_seconds"],
        message="문제가 저장되었습니다.",
    )


# ── 목록 (패널 재수화) ────────────────────────────────────────────────────────

@router.get(
    "/lectures/{lecture_id}/quiz",
    response_model=AuthoredQuizListResponse,
    summary="저작된 인터랙티브 퀴즈 목록 (교수자 전용)",
)
async def quiz_list(
    lecture_id: uuid.UUID,
    current_user: User = Depends(require_professor),
):
    loop = asyncio.get_event_loop()

    def _run():
        with SyncSessionLocal() as db:
            rows = quiz_svc.list_authored(db, lecture_id)
            return [AuthoredQuizItem.model_validate(r).model_dump() for r in rows]

    items = await loop.run_in_executor(None, _run)
    return AuthoredQuizListResponse(lecture_id=lecture_id, quizzes=items)


# ── 삭제 (재작성) ─────────────────────────────────────────────────────────────

@router.delete(
    "/lectures/{lecture_id}/quiz/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="인터랙티브 퀴즈 삭제 (교수자 전용)",
)
async def quiz_delete(
    lecture_id: uuid.UUID,
    question_id: uuid.UUID,
    current_user: User = Depends(require_professor),
):
    loop = asyncio.get_event_loop()

    def _run():
        with SyncSessionLocal() as db:
            return quiz_svc.delete_authored(db, lecture_id, question_id)

    ok = await loop.run_in_executor(None, _run)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 인터랙티브 퀴즈를 찾을 수 없습니다.",
        )
