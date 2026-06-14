import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.course import Course
from app.models.lecture import Lecture
from app.models.user import User, UserRole
from app.models.video import Video
from app.schemas.lecture import LectureCreate, LecturePublicResponse, LectureUpdate
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

    카드 썸네일용으로 ``thumbnail_url`` 이 비어 있으면 PPT 1번 슬라이드 이미지로
    채운다(아래 ``_attach_slide_thumbnails``). 메모리상 세팅이며 commit 하지 않는다.
    """
    stmt = (
        select(Lecture)
        .join(Course, Lecture.course_id == Course.id)
        .where(Course.instructor_id == professor.id)
        .order_by(Lecture.created_at.desc())
    )
    result = await db.execute(stmt)
    lectures = list(result.scalars().all())
    await _attach_slide_thumbnails(db, lectures)
    return lectures


async def _attach_slide_thumbnails(
    db: AsyncSession, lectures: list[Lecture]
) -> None:
    """카드 썸네일을 PPT 1쪽 슬라이드 이미지로 통일하고 presign 해서 내려준다.

    슬라이드 PNG(``thumbnails/slides/*``)·기존 ``thumbnail_url``(옛 HeyGen 포스터
    ``thumbnails/{lecture_id}/*``) 모두 운영 버킷의 비공개 prefix 라 **원본 URL 은
    익명 GET 시 403** → 카드가 깨졌다. 조회 시점에 presign(서명·시간제한) URL 로
    변환한다.

    우선순위(교수자 요구 2026-06-13 — "카드에 PPT 1p 가 뜨게"):
      1. 슬라이드 1쪽 이미지가 있으면 그것을 쓴다(옛 HeyGen 포스터보다 우선).
      2. 없으면 기존 thumbnail_url 을 presign 해서 쓴다(403 해소).
    둘 다 없으면 null — 프론트가 placeholder 를 그린다(슬라이드 미생성 초안 등).

    get_db 는 commit 하지 않으므로 이 세팅은 응답 직렬화에만 쓰이고 DB 에는 영구
    저장되지 않는다(만료 URL 오염 없음). N+1 회피 — task_id IN (...) 일괄 조회.
    """
    from app.models.embedding import SlideEmbedding  # noqa: PLC0415
    from app.services.pipeline.s3 import presign_stored_s3_url  # noqa: PLC0415

    # 1) 강의별 1쪽 슬라이드 이미지 일괄 조회(pipeline_task_id 있는 것만).
    task_ids = [
        lec.pipeline_task_id
        for lec in lectures
        if getattr(lec, "pipeline_task_id", None)
    ]
    slide1_by_task: dict[str, str] = {}
    if task_ids:
        rows = (
            await db.execute(
                select(
                    SlideEmbedding.task_id, SlideEmbedding.slide_image_url
                ).where(
                    SlideEmbedding.task_id.in_(task_ids),
                    SlideEmbedding.slide_number == 1,
                )
            )
        ).all()
        for task_id, image_url in rows:
            if image_url:
                slide1_by_task[task_id] = image_url

    # 2) 썸네일 결정 — 슬라이드 1쪽 우선, 없으면 기존 썸네일. 둘 다 presign.
    for lec in lectures:
        slide1 = slide1_by_task.get(getattr(lec, "pipeline_task_id", None) or "")
        if slide1:
            lec.thumbnail_url = presign_stored_s3_url(slide1)
        elif lec.thumbnail_url:
            lec.thumbnail_url = presign_stored_s3_url(lec.thumbnail_url)


async def get_lecture_or_404(db: AsyncSession, lecture_id: uuid.UUID) -> Lecture:
    result = await db.execute(select(Lecture).where(Lecture.id == lecture_id))
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise ValueError("강의를 찾을 수 없습니다.")
    return lecture


async def get_public_lecture_by_slug(
    db: AsyncSession, slug: str, viewer_id: uuid.UUID | None = None
) -> LecturePublicResponse:
    """공개 강의 조회 + R2W2: professor_name / course_name / duration_sec 채움.

    Lecture → Course → User(instructor) 체인을 ``selectinload`` 로 함께 로드하고,
    별도 쿼리로 가장 최근에 길이 메타가 채워진 Video.duration_seconds 를 끌어
    온다. 어느 한 쪽이라도 없으면 해당 필드는 ``None`` (frontend 가 안전하게 무시).

    ``viewer_id`` 가 소유 교수자면 **미발행 강의도** 조회 가능(배포 전 미리보기).
    익명·타인은 종전처럼 ``is_published=True`` 만 보인다.
    """
    from sqlalchemy import or_  # noqa: PLC0415

    stmt = (
        select(Lecture)
        .options(selectinload(Lecture.course).selectinload(Course.instructor))
        .where(Lecture.slug == slug)
    )
    if viewer_id is not None:
        stmt = stmt.join(Course, Lecture.course_id == Course.id).where(
            or_(
                Lecture.is_published == True,  # noqa: E712
                Course.instructor_id == viewer_id,
            )
        )
    else:
        stmt = stmt.where(Lecture.is_published == True)  # noqa: E712
    result = await db.execute(stmt)
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


async def get_lecture_slideshow_by_slug(
    db: AsyncSession, slug: str, viewer_id: uuid.UUID | None = None
):
    """공개 강의의 클라이언트 슬라이드쇼 재생 데이터를 반환한다.

    본문은 MP4 가 아니라 슬라이드 이미지 + 구간 TTS 음성 + 타임라인으로 재생된다
    (docs/planning/08-cost-optimization.md). 타임라인·텍스트(VideoScript.segments)에
    슬라이드 PNG(SlideEmbedding)와 구간 음성(VideoRender.audio_url)을 슬라이드 번호로
    합쳐 내려준다. 만료 강의는 빈 슬라이드 목록을 반환한다.

    ``viewer_id`` 가 소유 교수자면 **미발행 강의도** 재생 가능(배포 전 미리보기).

    슬라이드 번호 규약:
    - segment.slide_index / VideoRender.slide_number = 0-based(approve_video 에서 동일).
    - SlideEmbedding.slide_number = 1-based(parser.py) → slide_index + 1.
    """
    from sqlalchemy import or_  # noqa: PLC0415

    from app.models.embedding import SlideEmbedding
    from app.models.video_render import RenderStatus, VideoRender
    from app.schemas.lecture import SlideshowResponse, SlideshowSlide
    from app.services.pipeline.s3 import presign_stored_s3_url

    stmt = select(Lecture).where(Lecture.slug == slug)
    if viewer_id is not None:
        stmt = stmt.join(Course, Lecture.course_id == Course.id).where(
            or_(
                Lecture.is_published == True,  # noqa: E712
                Course.instructor_id == viewer_id,
            )
        )
    else:
        stmt = stmt.where(Lecture.is_published == True)  # noqa: E712
    result = await db.execute(stmt)
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise ValueError("강의를 찾을 수 없습니다.")

    now = datetime.now(timezone.utc)
    is_expired = lecture.expires_at is not None and lecture.expires_at < now
    if is_expired:
        return SlideshowResponse(
            lecture_id=lecture.id, is_expired=True, total_seconds=0, slides=[]
        )

    # 타임라인 + 텍스트 — 가장 최근 Video 의 스크립트.
    video_result = await db.execute(
        select(Video)
        .options(selectinload(Video.script))
        .where(Video.lecture_id == lecture.id)
        .order_by(Video.created_at.desc())
    )
    video = video_result.scalars().first()
    script = video.script if video else None
    segments = (script.segments if script else None) or []
    subtitle_segments = (script.subtitle_segments if script else None) or []

    # 본문 렌더 완료 여부 — Video 가 done 으로 전환된 경우에만 학생에게 재생을 허용한다.
    # done 이 아니면(승인 전·렌더 진행 중) 음성이 아직 없어 무음으로 재생될 수 있으므로
    # is_ready=False 로 내려 플레이어가 "준비 중"을 표시하게 한다. 기본 True 가 아니라
    # 여기서 명시적으로 계산해 내려준다.
    from app.models.video import VideoStatus  # noqa: PLC0415

    is_body_ready = video is not None and video.status == VideoStatus.done

    # slide_index → 번역 자막(자막 언어가 음성과 다를 때만 채워짐).
    subtitle_by_index: dict[int, str] = {}
    for sub in subtitle_segments:
        if isinstance(sub, dict) and isinstance(sub.get("slide_index"), int):
            subtitle_by_index[sub["slide_index"]] = sub.get("text") or ""

    # slide_index → 슬라이드 PNG(SlideEmbedding.slide_number 1-based → idx+1).
    images_by_index: dict[int, str | None] = {}
    if lecture.pipeline_task_id:
        emb_result = await db.execute(
            select(SlideEmbedding.slide_number, SlideEmbedding.slide_image_url).where(
                SlideEmbedding.task_id == lecture.pipeline_task_id
            )
        )
        for slide_number, image_url in emb_result.all():
            images_by_index[int(slide_number) - 1] = image_url

    # slide_index → 구간 음성(최신 ready 렌더의 audio_url). 슬라이드별 1개.
    render_result = await db.execute(
        select(VideoRender)
        .where(
            VideoRender.lecture_id == lecture.id,
            VideoRender.status == RenderStatus.ready,
        )
        .order_by(VideoRender.created_at.desc())
    )
    audio_by_index: dict[int, str] = {}
    cues_by_index: dict[int, list] = {}
    for r in render_result.scalars().all():
        if r.slide_number is None or not r.audio_url:
            continue
        idx_r = int(r.slide_number)
        if idx_r in audio_by_index:
            continue  # 슬라이드별 최신 ready 렌더 1개만 (created_at desc 정렬)
        audio_by_index[idx_r] = r.audio_url
        # cue 는 반드시 음원을 고른 그 렌더의 것을 써야 시각이 음원과 일치한다.
        cues = getattr(r, "subtitle_cues", None)
        if isinstance(cues, list) and cues:
            cues_by_index[idx_r] = cues

    slides: list[SlideshowSlide] = []
    total_seconds = 0.0
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        idx = seg.get("slide_index")
        if not isinstance(idx, int) or idx < 0:
            continue
        end = float(seg.get("end_seconds") or 0)
        total_seconds = max(total_seconds, end)
        slides.append(
            SlideshowSlide(
                slide_index=idx,
                image_url=presign_stored_s3_url(images_by_index.get(idx)),
                audio_url=presign_stored_s3_url(audio_by_index.get(idx)),
                start_seconds=float(seg.get("start_seconds") or 0),
                end_seconds=end,
                text=seg.get("text") or "",
                subtitle_text=subtitle_by_index.get(idx),
                subtitle_cues=cues_by_index.get(idx),
            )
        )

    return SlideshowResponse(
        lecture_id=lecture.id,
        is_expired=False,
        is_ready=is_body_ready,
        total_seconds=total_seconds,
        slides=slides,
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
