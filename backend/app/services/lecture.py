import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.course import Course
from app.models.embedding import SlideEmbedding
from app.models.lecture import Lecture
from app.models.user import User, UserRole
from app.models.video import Video, VideoScript
from app.models.video_render import RenderStatus, VideoRender
from app.schemas.lecture import (
    LectureCreate,
    LecturePlayResponse,
    LecturePublicResponse,
    LectureUpdate,
    PlaySegment,
)
from app.services.pipeline.s3 import presign_stored_s3_url
from app.services.render import cancel_in_flight_renders_for_lecture
from app.utils.slug import slugify

logger = logging.getLogger(__name__)

try:
    import sentry_sdk
except ImportError:  # pragma: no cover
    sentry_sdk = None  # type: ignore[assignment]


# ── 소유권 검증 헬퍼 ───────────────────────────────────────────────────────────

async def assert_professor_owns_lecture(
    db: AsyncSession, lecture_id: uuid.UUID, user_id: uuid.UUID
) -> Lecture:
    """Lecture JOIN Course로 course.instructor_id == user_id 검증. 없으면 404."""
    stmt = (
        select(Lecture)
        .join(Course, Lecture.course_id == Course.id)
        .where(Lecture.id == lecture_id, Course.instructor_id == user_id)
    )
    result = await db.execute(stmt)
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")
    return lecture


async def assert_professor_owns_video(
    db: AsyncSession, video_id: uuid.UUID, user_id: uuid.UUID
) -> Video:
    """Video → Lecture → Course 체인으로 instructor_id 검증. 없으면 404."""
    stmt = (
        select(Video)
        .options(selectinload(Video.script))
        .join(Lecture, Video.lecture_id == Lecture.id)
        .join(Course, Lecture.course_id == Course.id)
        .where(Video.id == video_id, Course.instructor_id == user_id)
    )
    result = await db.execute(stmt)
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="영상을 찾을 수 없습니다.")
    return video


# ── 조회 ──────────────────────────────────────────────────────────────────────

async def list_course_lectures(
    db: AsyncSession, course_id: uuid.UUID, user: User
) -> list[Lecture]:
    """교수자(소유자)는 전체, 그 외는 게시된 강의만 반환."""
    stmt = select(Lecture).where(Lecture.course_id == course_id)

    # 강좌 소유자 확인
    course_result = await db.execute(select(Course).where(Course.id == course_id))
    course = course_result.scalar_one_or_none()
    if not course:
        raise ValueError("강좌를 찾을 수 없습니다.")

    is_owner = (user.role == UserRole.professor and course.instructor_id == user.id)
    if not is_owner:
        stmt = stmt.where(Lecture.is_published == True)  # noqa: E712

    stmt = stmt.order_by(Lecture.order, Lecture.created_at)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_my_lectures(db: AsyncSession, professor: User) -> list[Lecture]:
    """교수자 본인이 소유한 모든 강의를 강좌 구분 없이 한 번에 반환.

    프론트가 ``GET /api/courses`` 후 강좌별 ``GET /api/courses/{id}/lectures`` 를
    N번 호출하던 fan-out 워터폴을 단일 JOIN 쿼리로 대체한다. 소유 범위는
    Course.instructor_id 로 한정(미게시 포함 — 본인 소유라서). 최신순 정렬.
    """
    stmt = (
        select(Lecture)
        .join(Course, Lecture.course_id == Course.id)
        .where(Course.instructor_id == professor.id)
        .order_by(Lecture.created_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_lecture_or_404(db: AsyncSession, lecture_id: uuid.UUID) -> Lecture:
    result = await db.execute(select(Lecture).where(Lecture.id == lecture_id))
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise ValueError("강의를 찾을 수 없습니다.")
    return lecture


async def get_public_lecture_by_slug(
    db: AsyncSession, slug: str
) -> LecturePublicResponse:
    """공개 강의 조회 + R2W2: professor_name / course_name / duration_sec 채움.

    Lecture → Course → User(instructor) 체인을 ``selectinload`` 로 함께 로드하고,
    별도 쿼리로 가장 최근에 길이 메타가 채워진 Video.duration_seconds 를 끌어
    온다. 어느 한 쪽이라도 없으면 해당 필드는 ``None`` (frontend 가 안전하게 무시).
    """
    result = await db.execute(
        select(Lecture)
        .options(selectinload(Lecture.course).selectinload(Course.instructor))
        .where(Lecture.slug == slug, Lecture.is_published == True)  # noqa: E712
    )
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise ValueError("강의를 찾을 수 없습니다.")

    now = datetime.now(timezone.utc)
    is_expired = lecture.expires_at is not None and lecture.expires_at < now

    # ── R2W2 부가 정보 ────────────────────────────────────────────────────
    professor_name = (
        lecture.course.instructor.name
        if lecture.course and lecture.course.instructor
        else None
    )
    course_name = lecture.course.title if lecture.course else None
    duration_sec = await _resolve_lecture_duration_seconds(db, lecture.id)

    return LecturePublicResponse(
        id=lecture.id,
        course_id=lecture.course_id,
        title=lecture.title,
        description=lecture.description,
        thumbnail_url=lecture.thumbnail_url,
        slug=lecture.slug,
        is_expired=is_expired,
        video_url=None if is_expired else lecture.video_url,
        professor_name=professor_name,
        course_name=course_name,
        duration_sec=duration_sec,
    )


async def _resolve_lecture_duration_seconds(
    db: AsyncSession, lecture_id: uuid.UUID
) -> int | None:
    """강의에 연결된 가장 최근 Video.duration_seconds (없으면 None).

    Lecture 당 보통 하나의 Video 가 활성이지만, 모델이 1:N 을 허용하므로
    ``duration_seconds is not None`` 인 row 중 가장 최근 ``created_at`` 을 채택.
    Video 자체가 없거나 모두 길이 메타 누락이면 ``None`` — 학생 진입 페이지의
    duration UI 가 자연스럽게 숨김 처리된다.
    """
    stmt = (
        select(Video.duration_seconds)
        .where(
            Video.lecture_id == lecture_id,
            Video.duration_seconds.is_not(None),
        )
        .order_by(Video.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# ── 학생 재생 타임라인 (계약 A) ────────────────────────────────────────────────


async def _resolve_lecture_by_ref(
    db: AsyncSession, ref: str | uuid.UUID
) -> Lecture:
    """학생 재생용 강의를 id(UUID) 또는 slug 로 조회한다.

    학생 플레이어 라우트가 slug 기반이라(/lecture/[slug], /{slug}/public) 둘 다
    허용한다. ``/public`` 과 동일하게 **게시된(is_published) 강의만** 노출한다 —
    미게시 강의는 학생에게 보이면 안 되며(교수자 미리보기는 /professor/lecture/[id]
    별도 경로), 미게시·미존재는 동일하게 404(ValueError) 로 처리한다.
    """
    lid: uuid.UUID | None
    if isinstance(ref, uuid.UUID):
        lid = ref
    else:
        try:
            lid = uuid.UUID(str(ref))
        except (ValueError, AttributeError, TypeError):
            lid = None
    if lid is not None:
        stmt = select(Lecture).where(
            Lecture.id == lid, Lecture.is_published == True  # noqa: E712
        )
    else:
        stmt = select(Lecture).where(
            Lecture.slug == str(ref), Lecture.is_published == True  # noqa: E712
        )
    lecture = (await db.execute(stmt)).scalar_one_or_none()
    if not lecture:
        raise ValueError("강의를 찾을 수 없습니다.")
    return lecture


async def get_lecture_play_timeline(
    db: AsyncSession, lecture_ref: str | uuid.UUID
) -> LecturePlayResponse:
    """학생 플레이어용 "슬라이드 PNG + 구간 TTS + 타임라인" 을 조립한다.

    ``lecture_ref`` 는 UUID 또는 slug (플레이어가 라우트 slug 를 그대로 넘긴다).
    소스 3종을 slide_index(0-based) 로 합친다:
      - VideoScript.segments  : 재생 순서·발화 텍스트·구간 길이(타임라인)
      - SlideEmbedding         : 슬라이드 PNG (slide_number 는 1-based → idx = n-1)
      - VideoRender(ready)     : 구간 TTS 오디오 (slide_number 는 0-based = slide_index)

    image_url / audio_url 은 presign 해서 내려준다(영구 S3 URL 은 익명 GET 403).
    만료된 강의는 segments=[] + is_expired=True.
    """
    lecture = await _resolve_lecture_by_ref(db, lecture_ref)
    lecture_id = lecture.id  # 이하 조인 쿼리는 항상 UUID id 로 수행

    now = datetime.now(timezone.utc)
    # SQLite 등에서 DateTime(timezone=True) 가 naive 로 돌아올 수 있어 UTC 로 보정.
    expires_at = lecture.expires_at
    is_expired = False
    if expires_at is not None:
        exp = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
        is_expired = exp < now
    language = getattr(lecture, "voice_lang", None) or "ko"
    if is_expired:
        return LecturePlayResponse(
            lecture_id=lecture.id,
            title=lecture.title,
            language=language,
            segments=[],
            is_expired=True,
            expires_at=lecture.expires_at,
        )

    # 1) 타임라인 — 가장 최근 Video 의 스크립트
    video = (
        await db.execute(
            select(Video)
            .options(selectinload(Video.script))
            .where(Video.lecture_id == lecture_id)
            .order_by(Video.created_at.desc())
        )
    ).scalars().first()
    script: VideoScript | None = video.script if video else None
    segments_src = (script.segments or []) if script else []
    subtitle_src = (script.subtitle_segments or []) if script else []

    # 2) 슬라이드 PNG (1-based slide_number → 0-based idx)
    image_by_idx: dict[int, str | None] = {}
    if lecture.pipeline_task_id:
        rows = await db.execute(
            select(SlideEmbedding.slide_number, SlideEmbedding.slide_image_url)
            .where(SlideEmbedding.task_id == lecture.pipeline_task_id)
        )
        for slide_number, image_url in rows.all():
            if isinstance(slide_number, int):
                image_by_idx[slide_number - 1] = image_url

    # 3) 구간 TTS 오디오 (ready 렌더만, slide_index 별 최신)
    audio_by_idx: dict[int, str | None] = {}
    renders = await db.execute(
        select(VideoRender)
        .where(
            VideoRender.lecture_id == lecture_id,
            VideoRender.status == RenderStatus.ready,
        )
        .order_by(VideoRender.created_at.asc())
    )
    for render in renders.scalars().all():
        if render.slide_number is not None and render.audio_url:
            audio_by_idx[render.slide_number] = render.audio_url  # 최신이 덮어씀

    # 4) 자막 (slide_index 별)
    caption_by_idx: dict[int, str | None] = {}
    for sub in subtitle_src:
        if isinstance(sub, dict):
            caption_by_idx[sub.get("slide_index")] = sub.get("text")

    # 5) 조립
    out: list[PlaySegment] = []
    for i, seg in enumerate(segments_src):
        if not isinstance(seg, dict):
            continue
        slide_index = seg.get("slide_index")
        start = seg.get("start_seconds")
        end = seg.get("end_seconds")
        duration = (
            float(end) - float(start)
            if isinstance(start, (int, float)) and isinstance(end, (int, float))
            else None
        )
        out.append(
            PlaySegment(
                index=i,
                slide_index=slide_index if isinstance(slide_index, int) else i,
                image_url=presign_stored_s3_url(image_by_idx.get(slide_index)),
                audio_url=presign_stored_s3_url(
                    audio_by_idx.get(slide_index), expiration=86400
                ),
                text=seg.get("text"),
                duration_seconds=duration,
                caption=caption_by_idx.get(slide_index),
            )
        )

    return LecturePlayResponse(
        lecture_id=lecture.id,
        title=lecture.title,
        language=language,
        segments=out,
        is_expired=False,
        expires_at=lecture.expires_at,
    )


# ── 생성 / 수정 ───────────────────────────────────────────────────────────────

async def create_lecture(
    db: AsyncSession, instructor: User, data: LectureCreate
) -> Lecture:
    # 강좌 소유권 확인
    course_result = await db.execute(
        select(Course).where(Course.id == data.course_id)
    )
    course = course_result.scalar_one_or_none()
    if not course:
        raise ValueError("강좌를 찾을 수 없습니다.")
    if course.instructor_id != instructor.id:
        raise PermissionError("해당 강좌에 강의를 추가할 권한이 없습니다.")

    slug = slugify(data.title)

    lecture = Lecture(
        id=uuid.uuid4(),
        course_id=data.course_id,
        title=data.title,
        description=data.description,
        video_url=data.video_url,
        thumbnail_url=data.thumbnail_url,
        slug=slug,
        order=data.order,
        expires_at=data.expires_at,
        voice_gender=data.voice_gender,
    )
    db.add(lecture)
    await db.commit()
    await db.refresh(lecture)
    return lecture


async def delete_lecture(
    db: AsyncSession, lecture_id: uuid.UUID, instructor: User
) -> None:
    """강의 삭제 — 진행 중인 HeyGen 렌더 잡을 취소한 뒤 DB row 제거.

    pre-delete 훅:
      1) 해당 lecture 의 VideoRender 중 in-flight 상태 select
      2) heygen.cancel_video(job_id) wrapper 호출 (services/render.py)
      3) DB 상태 → cancelled + cancelled_at 기록
      4) 정상 삭제. 취소 호출이 실패해도 삭제는 진행 (Sentry warning).
    """
    lecture = await get_lecture_or_404(db, lecture_id)
    course_result = await db.execute(
        select(Course).where(Course.id == lecture.course_id)
    )
    course = course_result.scalar_one_or_none()
    if not course or course.instructor_id != instructor.id:
        raise PermissionError("이 강의를 삭제할 권한이 없습니다.")

    # pre-delete: 진행 중 HeyGen 잡 취소. 실패해도 삭제는 계속.
    try:
        await cancel_in_flight_renders_for_lecture(db, lecture_id)
    except Exception as exc:
        logger.warning(
            "lecture %s 삭제 전 render cancel 훅 실패 (삭제는 진행): %s",
            lecture_id, exc,
        )
        if sentry_sdk is not None:
            sentry_sdk.capture_message(
                f"cancel_in_flight_renders raised in delete_lecture: lecture_id={lecture_id} ({exc})",
                level="warning",
            )

    await db.delete(lecture)
    await db.commit()


async def update_lecture(
    db: AsyncSession, lecture_id: uuid.UUID, instructor: User, data: LectureUpdate
) -> Lecture:
    lecture = await get_lecture_or_404(db, lecture_id)

    # 강좌 소유권 확인
    course_result = await db.execute(
        select(Course).where(Course.id == lecture.course_id)
    )
    course = course_result.scalar_one_or_none()
    if not course or course.instructor_id != instructor.id:
        raise PermissionError("이 강의를 수정할 권한이 없습니다.")

    update_data = data.model_dump(exclude_unset=True)

    # 자막 언어가 바뀌면 기존 자막(이전 언어로 번역된 subtitle_segments)은 무효 —
    # 비워서 다음 조회 시 새 언어로 다시 번역하도록 한다. subtitle_segments 에는
    # 언어 표시가 없어, 안 비우면 옛 언어 텍스트가 새 언어 라벨로 표시되는 혼란이 생긴다.
    subtitle_lang_changed = (
        "subtitle_lang" in update_data
        and update_data["subtitle_lang"] != lecture.subtitle_lang
    )

    for field, value in update_data.items():
        setattr(lecture, field, value)

    if subtitle_lang_changed:
        await _clear_subtitle_segments(db, lecture_id)

    await db.commit()
    await db.refresh(lecture)
    return lecture


async def _clear_subtitle_segments(db: AsyncSession, lecture_id: uuid.UUID) -> None:
    """강의에 연결된 영상 스크립트의 자막(subtitle_segments)을 비운다(있으면)."""
    from app.models.video import VideoScript

    video = (
        await db.execute(select(Video).where(Video.lecture_id == lecture_id))
    ).scalar_one_or_none()
    if not video:
        return
    script = (
        await db.execute(select(VideoScript).where(VideoScript.video_id == video.id))
    ).scalar_one_or_none()
    if script and script.subtitle_segments:
        script.subtitle_segments = None
