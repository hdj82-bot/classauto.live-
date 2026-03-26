"""스크립트 에디터 API 라우터."""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor
from app.db.session import get_db
from app.models.user import User
from app.schemas.video import (
    ScriptPatchRequest,
    VideoScriptResponse,
    VideoStatusResponse,
)
from app.services import video as video_svc

router = APIRouter(prefix="/api/videos", tags=["script-editor"])


def _build_script_response(video, script) -> VideoScriptResponse:
    """Video + VideoScript → VideoScriptResponse 변환."""
    from app.schemas.video import ScriptSegment

    def _parse(raw: list | None) -> list[ScriptSegment] | None:
        if raw is None:
            return None
        return [ScriptSegment(**item) for item in raw]

    return VideoScriptResponse(
        video_id=video.id,
        status=video.status.value,
        segments=_parse(script.segments) or [],
        ai_segments=_parse(script.ai_segments),
        approved_at=script.approved_at,
        approved_by_id=script.approved_by_id,
        updated_at=script.updated_at,
    )


# ── GET /api/videos/{id}/script ───────────────────────────────────────────────

@router.get(
    "/{video_id}/script",
    response_model=VideoScriptResponse,
    summary="슬라이드별 스크립트 타임라인 조회 (교수자 전용)",
)
async def get_script(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    """영상의 스크립트 세그먼트 전체와 원본 AI 스크립트를 반환합니다."""
    video, script = await video_svc.get_script(db, video_id)
    await video_svc.assert_professor_owns_video(db, video, current_user.id)
    return _build_script_response(video, script)


# ── PATCH /api/videos/{id}/script ────────────────────────────────────────────

@router.patch(
    "/{video_id}/script",
    response_model=VideoScriptResponse,
    summary="스크립트 수정 저장 (교수자 전용)",
)
async def patch_script(
    video_id: uuid.UUID,
    body: ScriptPatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    """
    슬라이드별 스크립트를 수정합니다.

    - `text`: 발화 텍스트 수정
    - `tone`: 발화 톤 태그 (`normal` / `emphasis` / `soft` / `fast`)
    - `question_pin_seconds`: 질문 타이밍 핀 설정 (null = 핀 제거)
    - `start_seconds` / `end_seconds`: 슬라이드 타임스탬프 조정

    `pending_review` 상태에서만 수정 가능합니다.
    """
    video, script = await video_svc.patch_script(
        db=db,
        video_id=video_id,
        professor_id=current_user.id,
        segments=body.segments,
    )
    return _build_script_response(video, script)


# ── POST /api/videos/{id}/script/reset ───────────────────────────────────────

@router.post(
    "/{video_id}/script/reset",
    response_model=VideoScriptResponse,
    summary="AI 원본 스크립트로 기본값 복원 (교수자 전용)",
)
async def reset_script(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    """
    편집한 스크립트를 버리고 AI가 최초 생성한 원본 스크립트로 되돌립니다.
    (기본값 버튼 — AI 그대로 사용)
    """
    video, script = await video_svc.reset_to_ai_script(
        db=db,
        video_id=video_id,
        professor_id=current_user.id,
    )
    return _build_script_response(video, script)


# ── POST /api/videos/{id}/approve ────────────────────────────────────────────

@router.post(
    "/{video_id}/approve",
    response_model=VideoStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="스크립트 최종 승인 → RENDERING 전환 (교수자 전용)",
)
async def approve_video(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    """
    교수자가 스크립트를 최종 승인합니다.

    - `pending_review` → `rendering` 상태로 전환
    - `approved_at`, `approved_by_id` 기록
    - 이후 HeyGen 렌더링 파이프라인이 `rendering` 상태를 polling
    """
    video = await video_svc.approve_video(
        db=db,
        video_id=video_id,
        professor_id=current_user.id,
    )
    return VideoStatusResponse(
        id=video.id,
        status=video.status.value,
        updated_at=video.updated_at,
    )


# ── POST /api/videos/{id}/archive ────────────────────────────────────────────

@router.post(
    "/{video_id}/archive",
    response_model=VideoStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="영상 보관 처리 (교수자 전용)",
)
async def archive_video(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor),
):
    """영상을 보관(archived) 상태로 전환합니다. 모든 상태에서 가능합니다."""
    video = await video_svc.archive_video(
        db=db,
        video_id=video_id,
        professor_id=current_user.id,
    )
    return VideoStatusResponse(
        id=video.id,
        status=video.status.value,
        updated_at=video.updated_at,
    )
