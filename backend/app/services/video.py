"""Video / Script 서비스."""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.celery_app import celery
from app.models.video import Video, VideoScript, VideoStatus
from app.schemas.video import ScriptSegment, SubtitleSegment

logger = logging.getLogger(__name__)


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


# ── 발화 언어 변경 → 전 슬라이드 네이티브 재생성 ──────────────────────────────

_VOICE_LANGS = {"ko", "en", "zh", "ja"}


async def regenerate_script_language(
    db: AsyncSession,
    video_id: uuid.UUID,
    professor_id: uuid.UUID,
    target_lang: str,
) -> tuple[Video, VideoScript]:
    """발화 언어를 ``target_lang`` 으로 바꾸고 전 슬라이드를 그 언어로 네이티브
    재생성한다(한국어를 거친 번역이 아니라 처음부터 — 교수자 결정 2026-06-12).

    - SlideEmbedding 원본 텍스트를 입력으로 `_generate_single_script(lang=)` 호출.
      `generate_scripts` 와 동일한 ThreadPoolExecutor 병렬 패턴을 thread 로 돌려
      이벤트 루프를 막지 않는다.
    - 타임스탬프·톤·질문 핀은 보존하고 발화 text 만 교체. ai_segments 도 새 언어로
      갱신해 "기본값 복원"이 새 언어 기준이 되게 한다.
    - `lecture.voice_lang` 갱신 + 기존 `subtitle_segments` 무효화(번역 source 가
      바뀌었으므로). 프론트는 변경 즉시 자막을 다시 생성하도록 안내한다.
    - `pending_review` 상태에서만 가능.
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    import anthropic

    from app.core.config import settings
    from app.models.embedding import SlideEmbedding
    from app.models.lecture import Lecture
    from app.services.pipeline.schemas import SlideContent
    from app.services.pipeline.script_generator import _generate_single_script

    if target_lang not in _VOICE_LANGS:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"지원하지 않는 발화 언어입니다: {target_lang}",
        )

    video, script = await get_script(db, video_id)
    await assert_professor_owns_video(db, video, professor_id)

    if video.status != VideoStatus.pending_review:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{video.status.value}' 상태에서는 발화 언어를 바꿀 수 없습니다.",
        )

    segments = _dict_to_segments(script.segments)
    if not segments:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="재생성할 발화 스크립트가 없습니다.",
        )

    lecture = await db.get(Lecture, video.lecture_id)
    task_id = lecture.pipeline_task_id if lecture else None

    # 슬라이드 원본 텍스트 일괄 조회 ({slide_number(1-based): text_content})
    text_by_slide: dict[int, str] = {}
    if task_id:
        emb_result = await db.execute(
            select(
                SlideEmbedding.slide_number, SlideEmbedding.text_content
            ).where(SlideEmbedding.task_id == task_id)
        )
        text_by_slide = {row[0]: row[1] or "" for row in emb_result.all()}

    # 입력 텍스트 — 원본이 없으면 현재 발화 text 를 입력으로(재다듬기 폴백).
    slide_inputs = [
        SlideContent(
            slide_number=seg.slide_index + 1,
            texts=[text_by_slide.get(seg.slide_index + 1) or seg.text],
            speaker_notes="",
            image_paths=[],
        )
        for seg in segments
    ]

    def _regenerate_all() -> list[str]:
        client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY, timeout=30.0
        )
        out: list[str] = [""] * len(slide_inputs)
        max_workers = max(1, min(settings.SCRIPT_CONCURRENCY, len(slide_inputs)))
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(
                    _generate_single_script, client, sc, lang=target_lang
                ): i
                for i, sc in enumerate(slide_inputs)
            }
            for fut in futures:
                out[futures[fut]] = fut.result().strip()
        return out

    new_texts = await asyncio.to_thread(_regenerate_all)

    new_segments = [
        ScriptSegment(
            slide_index=seg.slide_index,
            text=new_texts[i] or seg.text,
            start_seconds=seg.start_seconds,
            end_seconds=seg.end_seconds,
            tone=seg.tone,
            question_pin_seconds=seg.question_pin_seconds,
        )
        for i, seg in enumerate(segments)
    ]
    script.segments = _segments_to_dict(new_segments)
    script.ai_segments = _segments_to_dict(new_segments)
    script.subtitle_segments = None  # 번역 source 가 바뀜 — 기존 자막 무효화
    if lecture is not None:
        lecture.voice_lang = target_lang
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
    from app.models.video_render import VideoRender  # noqa: PLC0415

    segments = video.script.segments
    lecture = await db.get(Lecture, video.lecture_id)
    # 아바타는 강의에 적용된 것만 쓴다(교수자 본인=VisionStory / 타인=HeyGen 선택이 명시적으로
    # lecture.avatar_id 에 저장됨). 과거엔 비어 있으면 교수자 기본 룩(본인 얼굴)으로
    # 폴백했는데, 그러면 타인 아바타를 골라도 "가장 최근에 만든 본인 룩"이 자동 채용되는
    # 문제가 있었다(2026-06-15 사용자 보고). 비어 있으면 create_video 가 gender 기본
    # 아바타로 처리한다 — 본인 얼굴은 강의에 본인 아바타를 적용했을 때만 쓰인다.
    avatar_id = (lecture.avatar_id if lecture else None) or ""

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

    # 교수자 사전 질문(instructor_seed) 즉시 렌더 — 영상 승인과 동시에 교수자가
    # 미리 등록한 예상 질문을 렌더해, 첫 학생 질문부터 아바타 답변이 나오게 한다.
    # qa_batch(창2)를 직접 import 하지 않고 celery 태스크 이름으로만 호출(디커플링).
    celery.send_task(
        "app.tasks.qa_batch.render_seed_questions",
        args=[str(video.lecture_id), str(professor_id)],
    )

    return video


# ── 다시 제작(재생성) ─────────────────────────────────────────────────────────


def _render_voice_matches(render, cur_voice_id, cur_voice_speed) -> bool:
    """이 render 의 음원이 강의의 현재 보이스/속도로 합성됐는지.

    render.voice_speed 가 NULL 이면 보이스 추적 이전(구버전) 렌더라 판별 불가 →
    True 로 둬 텍스트 기준으로만 비교한다(무회귀). 추적 기록이 있으면 보이스 id 와
    속도(부동소수 오차 허용)를 비교해 하나라도 다르면 False(=재합성 필요).
    """
    if getattr(render, "voice_speed", None) is None:
        return True
    if (getattr(render, "voice_id", None) or None) != (cur_voice_id or None):
        return False
    return abs(float(render.voice_speed) - float(cur_voice_speed)) < 1e-6


async def rerender_video(
    db: AsyncSession,
    video_id: uuid.UUID,
    professor_id: uuid.UUID,
) -> tuple[Video, int]:
    """이미 제작 완료(done)된 강의를 다시 제작(재생성)한다.

    approve 는 pending_review 에서만 가능(아니면 409)이라, 한 번 done 이 된
    강의는 스크립트를 고쳐도 재제작할 길이 없었다. 이 함수는 done/rendering
    상태의 강의에 대해 **변경된 구간만** 다시 합성한다 — 발화 텍스트가 그대로인
    슬라이드는 기존 음성을 재사용해 **비용이 들지 않는다**(재과금 최소화).

    구현: 기존 VideoRender 를 **삭제하지 않고**(비용 로그 cascade 보존) 슬라이드별
    최신 행과 현재 세그먼트 텍스트를 비교한다. 텍스트가 바뀐(또는 매칭 렌더가
    없거나 오디오가 없는) 슬라이드만 audio_url 을 비워 render_slide 의 TTS
    idempotency(`tts_already_done`) 를 풀어 새로 합성한다. 그 뒤 그 항목만 enqueue.

    반환: (video, 재렌더 대상 구간 수). 0 이면 변경 없음(상태 불변, 비용 0).
    """
    video = await _get_video_with_script(db, video_id)
    if video is None:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="영상을 찾을 수 없습니다.",
        )

    await assert_professor_owns_video(db, video, professor_id)

    # done(완료) 또는 rendering(진행 중 재시도) 에서만 허용. pending_review 는
    # 일반 approve 경로를 쓰면 된다.
    if video.status not in (VideoStatus.done, VideoStatus.rendering):
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{video.status.value}' 상태에서는 다시 제작할 수 없습니다. 제작 완료(done) 강의에서만 가능합니다.",
        )

    if video.script is None or not video.script.segments:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="스크립트가 비어 있습니다.",
        )

    from app.models.lecture import Lecture  # noqa: PLC0415
    from app.models.video_render import RenderStatus, VideoRender  # noqa: PLC0415

    segments = video.script.segments
    lecture = await db.get(Lecture, video.lecture_id)
    # 아바타는 강의에 적용된 것만 쓴다(approve_video 와 동일 — 본인 룩 자동 폴백 제거).
    avatar_id = (lecture.avatar_id if lecture else None) or ""

    # 기존 렌더 — 슬라이드 번호별 최신 1개(created_at 오름차순이므로 마지막이 최신).
    existing = await db.execute(
        select(VideoRender)
        .where(VideoRender.lecture_id == video.lecture_id)
        .order_by(VideoRender.created_at)
    )
    latest_by_slide: dict[int, VideoRender] = {}
    for r in existing.scalars().all():
        if r.slide_number is not None:
            latest_by_slide[int(r.slide_number)] = r

    # 강의의 현재 보이스/속도 — render 에 기록된 합성 당시 값과 비교해 음성/속도
    # 변경도 감지한다(텍스트가 그대로여도 보이스·속도를 바꿨으면 재합성해야 한다).
    cur_voice_id = (lecture.voice_id or None) if lecture else None
    cur_voice_speed = (getattr(lecture, "voice_speed", None) or 1.3) if lecture else 1.3

    # 변경된 구간만 재합성한다(재과금 최소화). 발화 텍스트·보이스·속도가 모두 그대로이고
    # 이미 완료(ready+오디오)된 슬라이드는 기존 음성을 재사용하므로 비용이 들지 않는다.
    # 바뀐 슬라이드만 audio_url 을 비워 TTS 를 새로 합성한다.
    to_enqueue: list[tuple[str, str]] = []
    reused_ready = 0  # 변경 없이 재사용된(이미 ready+음성) 슬라이드 수
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        script_text = seg.get("text") or ""
        slide_number = seg.get("slide_index")
        render = (
            latest_by_slide.get(int(slide_number))
            if slide_number is not None
            else None
        )
        # 변경 없음(텍스트+음성+속도) + 이미 완료 → 재사용(비용 0).
        if (
            render is not None
            and render.status == RenderStatus.ready
            and render.audio_url
            and (render.script_text or "") == script_text
            and _render_voice_matches(render, cur_voice_id, cur_voice_speed)
        ):
            reused_ready += 1
            continue
        if render is None:
            # 세그먼트가 늘었거나 매칭 렌더 없음 → 새 행.
            render = VideoRender(
                lecture_id=video.lecture_id,
                instructor_id=professor_id,
                avatar_id=avatar_id,
                tts_provider="elevenlabs",
                script_text=script_text,
                slide_number=slide_number,
            )
            db.add(render)
            await db.flush()
        else:
            # in-place 리셋 — audio_url 을 비워 TTS 재합성 유도(변경된 텍스트 반영).
            render.script_text = script_text
            render.audio_url = None
            render.status = RenderStatus.pending
            render.completed_at = None
            render.heygen_job_id = None
        to_enqueue.append((str(render.id), script_text))

    # 바뀐 구간이 없으면 재합성할 게 없다. 다만 **모든 슬라이드 음성이 이미 ready**
    # 인데도 Video 가 rendering 에 갇혀 있으면(마지막 슬라이드의 finalize 누락·레이스로
    # done 전환이 빠진 경우) 여기서 done 으로 승격해 미리보기·재생을 풀어준다.
    # 이게 없으면 "다시 제작"은 0(변경 없음)을 돌려주고 미리보기는 계속 '준비 중'이라
    # (slideshow is_ready = status==done) 교수자가 어느 쪽으로도 빠져나갈 수 없다.
    if not to_enqueue:
        if reused_ready > 0 and video.status == VideoStatus.rendering:
            video.status = VideoStatus.done
            await db.commit()
            await db.refresh(video)
            logger.info(
                "rerender: 모든 슬라이드 ready 인데 rendering 에 갇힌 Video 를 done 으로 승격 "
                "(video_id=%s, slides=%d)",
                video.id, reused_ready,
            )
        return video, 0

    video.status = VideoStatus.rendering
    video.script.approved_at = datetime.now(tz=timezone.utc)
    video.script.approved_by_id = professor_id

    await db.commit()
    await db.refresh(video)

    from app.tasks.render import render_slide  # noqa: PLC0415

    for rid, text in to_enqueue:
        render_slide.delay(rid, text, str(professor_id))

    return video, len(to_enqueue)


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
