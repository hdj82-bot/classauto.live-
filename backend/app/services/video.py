"""Video / Script 서비스."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.video import Video, VideoScript, VideoStatus
from app.schemas.video import ScriptSegment


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

def _segments_to_dict(segments: list[ScriptSegment]) -> list[dict]:
    return [s.model_dump() for s in segments]


def _dict_to_segments(data: list[dict] | None) -> list[ScriptSegment]:
    if not data:
        return []
    return [ScriptSegment(**item) for item in data]


async def _get_video_with_script(
    db: AsyncSession, video_id: uuid.UUID
) -> Video | None:
    result = await db.execute(
        select(Video)
        .where(Video.id == video_id)
        .options(selectinload(Video.script))
    )
    return result.scalars().first()


# ── 소유권 검증 ───────────────────────────────────────────────────────────────

async def assert_professor_owns_video(
    db: AsyncSession,
    video: Video,
    professor_id: uuid.UUID,
) -> None:
    """Video → Lecture → Course.instructor_id == professor_id 확인."""
    from app.models.lecture import Lecture
    from app.models.course import Course

    result = await db.execute(
        select(Course.instructor_id)
        .join(Lecture, Lecture.course_id == Course.id)
        .where(Lecture.id == video.lecture_id)
    )
    instructor_id = result.scalar_one_or_none()
    if instructor_id != professor_id:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="해당 영상에 대한 권한이 없습니다.",
        )


# ── 스크립트 조회 ─────────────────────────────────────────────────────────────

async def get_script(
    db: AsyncSession, video_id: uuid.UUID
) -> tuple[Video, VideoScript]:
    video = await _get_video_with_script(db, video_id)
    if video is None:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="영상을 찾을 수 없습니다.",
        )
    if video.script is None:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="스크립트가 아직 생성되지 않았습니다.",
        )
    return video, video.script


# ── 스크립트 수정 ─────────────────────────────────────────────────────────────

async def patch_script(
    db: AsyncSession,
    video_id: uuid.UUID,
    professor_id: uuid.UUID,
    segments: list[ScriptSegment],
) -> tuple[Video, VideoScript]:
    video, script = await get_script(db, video_id)
    await assert_professor_owns_video(db, video, professor_id)

    if video.status not in (VideoStatus.pending_review,):
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{video.status.value}' 상태에서는 스크립트를 수정할 수 없습니다.",
        )

    script.segments = _segments_to_dict(segments)
    await db.commit()
    await db.refresh(script)
    return video, script


# ── 단일 슬라이드 Claude 재생성 ───────────────────────────────────────────────

async def regenerate_slide_segment(
    db: AsyncSession,
    video_id: uuid.UUID,
    professor_id: uuid.UUID,
    slide_index: int,
) -> tuple[Video, VideoScript]:
    """
    슬라이드 1장의 발화 스크립트를 Claude 로 재생성합니다.

    SlideEmbedding 테이블에 저장된 원본 텍스트(`text_content`)를 가져와
    `_generate_single_script` 에 전달한다. PPT 이미지는 임시 디렉토리에만
    존재하고 파이프라인 종료 시 제거되므로 텍스트 기반으로만 재생성한다.
    SYSTEM_PROMPT 는 손대지 않는다 — 동일 프롬프트를 동일 함수로 호출.
    """
    video, script = await get_script(db, video_id)
    await assert_professor_owns_video(db, video, professor_id)

    if video.status != VideoStatus.pending_review:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{video.status.value}' 상태에서는 스크립트를 재생성할 수 없습니다.",
        )

    segments = _dict_to_segments(script.segments)
    target_idx = next(
        (i for i, s in enumerate(segments) if s.slide_index == slide_index), -1
    )
    if target_idx < 0:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"슬라이드 인덱스 {slide_index} 를 찾을 수 없습니다.",
        )

    # lecture.pipeline_task_id → SlideEmbedding(text_content) 으로 원본 텍스트 조회
    from app.models.lecture import Lecture
    from app.models.embedding import SlideEmbedding
    from app.services.pipeline.schemas import SlideContent
    from app.services.pipeline.script_generator import _generate_single_script
    import anthropic
    from app.core.config import settings

    lec_result = await db.execute(
        select(Lecture.pipeline_task_id).where(Lecture.id == video.lecture_id)
    )
    task_id = lec_result.scalar_one_or_none()

    slide_text_content = ""
    if task_id:
        emb_result = await db.execute(
            select(SlideEmbedding.text_content).where(
                SlideEmbedding.task_id == task_id,
                SlideEmbedding.slide_number == slide_index + 1,  # parser 는 1-based
            )
        )
        slide_text_content = emb_result.scalar_one_or_none() or ""

    # 원본이 없으면 현재 segment.text 를 입력으로 사용 (재다듬기)
    if not slide_text_content:
        slide_text_content = segments[target_idx].text

    slide_content = SlideContent(
        slide_number=slide_index + 1,
        texts=[slide_text_content],
        speaker_notes="",
        image_paths=[],
    )
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)
    new_text = _generate_single_script(client, slide_content).strip()
    if not new_text:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Claude 가 빈 응답을 반환했습니다.",
        )

    # 해당 슬라이드만 갱신
    segments[target_idx] = ScriptSegment(
        slide_index=segments[target_idx].slide_index,
        text=new_text,
        start_seconds=segments[target_idx].start_seconds,
        end_seconds=segments[target_idx].end_seconds,
        tone=segments[target_idx].tone,
        question_pin_seconds=segments[target_idx].question_pin_seconds,
    )
    script.segments = _segments_to_dict(segments)
    await db.commit()
    await db.refresh(script)
    return video, script


# ── 기본값 복원 (AI 원본 사용) ────────────────────────────────────────────────

async def reset_to_ai_script(
    db: AsyncSession,
    video_id: uuid.UUID,
    professor_id: uuid.UUID,
) -> tuple[Video, VideoScript]:
    video, script = await get_script(db, video_id)
    await assert_professor_owns_video(db, video, professor_id)

    if video.status not in (VideoStatus.pending_review,):
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{video.status.value}' 상태에서는 기본값 복원을 할 수 없습니다.",
        )

    # ai_segments가 없으면 아무것도 할 수 없음
    if not script.ai_segments:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="원본 AI 스크립트가 존재하지 않습니다.",
        )

    script.segments = list(script.ai_segments)  # 원본으로 덮어쓰기
    await db.commit()
    await db.refresh(script)
    return video, script


# ── 최종 승인 → RENDERING ─────────────────────────────────────────────────────

async def approve_video(
    db: AsyncSession,
    video_id: uuid.UUID,
    professor_id: uuid.UUID,
) -> Video:
    video = await _get_video_with_script(db, video_id)
    if video is None:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="영상을 찾을 수 없습니다.",
        )

    await assert_professor_owns_video(db, video, professor_id)

    if video.status != VideoStatus.pending_review:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{video.status.value}' 상태에서는 승인할 수 없습니다. pending_review 상태여야 합니다.",
        )

    if video.script is None or not video.script.segments:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="스크립트가 비어 있습니다. 승인 전에 스크립트를 확인하세요.",
        )

    video.status = VideoStatus.rendering
    video.script.approved_at = datetime.now(tz=timezone.utc)
    video.script.approved_by_id = professor_id
    await db.commit()
    await db.refresh(video)
    return video


# ── 보관 처리 ─────────────────────────────────────────────────────────────────

async def archive_video(
    db: AsyncSession,
    video_id: uuid.UUID,
    professor_id: uuid.UUID,
) -> Video:
    video = await _get_video_with_script(db, video_id)
    if video is None:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="영상을 찾을 수 없습니다.",
        )

    await assert_professor_owns_video(db, video, professor_id)

    if video.status == VideoStatus.archived:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 보관된 영상입니다.",
        )

    video.status = VideoStatus.archived
    await db.commit()
    await db.refresh(video)
    return video
