"""Video / Script 서비스."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.video import Video, VideoScript, VideoStatus
from app.schemas.video import ScriptSegment, SubtitleSegment


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


# ── 자막 번역 / 편집 ──────────────────────────────────────────────────────────


def _subtitles_to_dict(segments: list[SubtitleSegment]) -> list[dict]:
    return [s.model_dump() for s in segments]


async def translate_subtitles(
    db: AsyncSession,
    video_id: uuid.UUID,
    professor_id: uuid.UUID,
    target_lang: str,
) -> tuple[Video, VideoScript]:
    """발화 스크립트를 ``target_lang`` 으로 번역해 자막 세그먼트를 생성한다.

    기존 ``translate_batch`` (DeepL → Google 폴백) 를 재사용한다. 발화 언어
    (lecture.voice_lang) 를 source 로 쓰고, 슬라이드 순서를 보존해 슬라이드별
    자막을 만든다. "번역 생성" 버튼 1회 호출 — 비용은 호출 시점에만 발생.
    결과는 ``script.subtitle_segments`` 에 저장되고 교수자가 편집할 수 있다.
    """
    import asyncio

    from app.models.lecture import Lecture
    from app.services.pipeline.translator import translate_batch

    video, script = await get_script(db, video_id)
    await assert_professor_owns_video(db, video, professor_id)

    if video.status != VideoStatus.pending_review:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{video.status.value}' 상태에서는 자막을 생성할 수 없습니다.",
        )

    segments = _dict_to_segments(script.segments)
    if not segments:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="번역할 발화 스크립트가 없습니다.",
        )

    lec_result = await db.execute(
        select(Lecture.voice_lang).where(Lecture.id == video.lecture_id)
    )
    source_lang = lec_result.scalar_one_or_none() or "ko"

    # 한자 뒤 병음 괄호 표기는 번역 입력에서도 제거 — 번역 결과 자막에 병음이
    # 새어나가지 않도록(기존 스크립트가 병음을 포함한 경우 대비).
    from app.services.pipeline.text_cleanup import strip_pinyin_annotations

    texts = [strip_pinyin_annotations(s.text) for s in segments]
    # translate_batch 는 동기(blocking) 호출 — 이벤트 루프를 막지 않도록 thread 로.
    results = await asyncio.to_thread(
        translate_batch, texts, target_lang, source_lang
    )

    subtitle_segments = [
        SubtitleSegment(
            slide_index=seg.slide_index,
            text=results[i].text if i < len(results) else "",
        )
        for i, seg in enumerate(segments)
    ]
    script.subtitle_segments = _subtitles_to_dict(subtitle_segments)
    await db.commit()
    await db.refresh(script)
    return video, script


async def patch_subtitles(
    db: AsyncSession,
    video_id: uuid.UUID,
    professor_id: uuid.UUID,
    segments: list[SubtitleSegment],
) -> tuple[Video, VideoScript]:
    """슬라이드별 자막 편집 저장."""
    video, script = await get_script(db, video_id)
    await assert_professor_owns_video(db, video, professor_id)

    if video.status != VideoStatus.pending_review:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{video.status.value}' 상태에서는 자막을 수정할 수 없습니다.",
        )

    script.subtitle_segments = _subtitles_to_dict(segments)
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

    # 승인 = 렌더 시작. 슬라이드(세그먼트)별 VideoRender 행을 만들고 render_slide
    # 태스크를 enqueue 한다. (과거엔 상태만 rendering 으로 바꾸고 아무도 렌더를
    # 실제로 시작시키지 않아 TTS 0/N 에서 영구히 멈췄다 — render.py 의
    # create_render_request 와 동일한 VideoRender 생성 + render_slide.delay 패턴.)
    from app.models.lecture import Lecture  # noqa: PLC0415
    from app.models.user import User  # noqa: PLC0415
    from app.models.video_render import VideoRender  # noqa: PLC0415

    segments = video.script.segments
    lecture = await db.get(Lecture, video.lecture_id)
    # 아바타 결정 순서: 강의가 고른 avatar_id → 교수자 기본 Photo Avatar 룩 →
    # 빈 문자열(heygen.create_video 가 env HEYGEN_AVATAR_ID_* 로 폴백).
    # 본인 룩을 기본으로 정해두면 강의별 선택 없이 모든 강의가 본인 얼굴로 생성된다.
    avatar_id = (lecture.avatar_id if lecture else None) or ""
    if not avatar_id:
        professor = await db.get(User, professor_id)
        if professor and professor.photo_avatar_default_look_id:
            avatar_id = professor.photo_avatar_default_look_id

    video.status = VideoStatus.rendering
    video.script.approved_at = datetime.now(tz=timezone.utc)
    video.script.approved_by_id = professor_id

    # 세그먼트 형식: {"slide_index": 0, "text": "발화 텍스트", ...}
    renders: list[tuple[str, str]] = []  # (render_id, script_text)
    for seg in segments:
        script_text = (seg.get("text") or "") if isinstance(seg, dict) else ""
        slide_number = seg.get("slide_index") if isinstance(seg, dict) else None
        render = VideoRender(
            lecture_id=video.lecture_id,
            instructor_id=professor_id,
            avatar_id=avatar_id,
            tts_provider="elevenlabs",
            script_text=script_text,
            slide_number=slide_number,
        )
        db.add(render)
        await db.flush()  # render.id 확보
        renders.append((str(render.id), script_text))

    await db.commit()
    await db.refresh(video)

    # 커밋 후 enqueue — render_slide(render_id, script_text, caller_user_id).
    # caller_user_id 로 태스크에서 instructor 일치 검증(Critical 7).
    from app.tasks.render import render_slide  # noqa: PLC0415

    for rid, text in renders:
        render_slide.delay(rid, text, str(professor_id))

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
