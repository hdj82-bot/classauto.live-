import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_professor
from app.db.session import get_db
from app.models.embedding import SlideEmbedding
from app.models.user import User
from app.models.video import Video
from app.schemas.lecture import (
    LectureCreate,
    LecturePublicResponse,
    LectureResponse,
    LectureUpdate,
    SlideMeta,
    SlidesResponse,
)
from app.schemas.video import VideoStatusResponse
from app.services.lecture import (
    assert_professor_owns_lecture,
    create_lecture,
    delete_lecture,
    get_public_lecture_by_slug,
    list_course_lectures,
    update_lecture,
)

router = APIRouter(tags=["lectures"])


# ── 강좌별 강의 목록 ──────────────────────────────────────────────────────────

@router.get(
    "/api/courses/{course_id}/lectures",
    response_model=list[LectureResponse],
    summary="강좌별 강의 목록",
)
async def get_course_lectures(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    - **교수자(소유자)**: 미게시 포함 전체 강의 목록
    - **학습자 / 타 교수자**: 게시된 강의만
    """
    try:
        return await list_course_lectures(db, course_id, user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ── 강의 생성 ─────────────────────────────────────────────────────────────────

@router.post(
    "/api/lectures",
    response_model=LectureResponse,
    status_code=status.HTTP_201_CREATED,
    summary="강의 생성 (교수자 전용)",
)
async def post_lecture(
    body: LectureCreate,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """
    강의를 생성합니다. 제목에서 slug가 자동 생성됩니다.

    - `expires_at`: 설정 시 해당 시각 이후 video_url이 공개 엔드포인트에서 숨겨집니다.
    - `order`: 강좌 내 노출 순서 (낮을수록 앞)
    """
    try:
        return await create_lecture(db, professor, body)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


# ── 강의 수정 ─────────────────────────────────────────────────────────────────

@router.patch(
    "/api/lectures/{lecture_id}",
    response_model=LectureResponse,
    summary="강의 수정 (소유 교수자 전용)",
)
async def patch_lecture(
    lecture_id: uuid.UUID,
    body: LectureUpdate,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """변경할 필드만 포함해서 보내면 됩니다 (PATCH 방식)."""
    try:
        return await update_lecture(db, lecture_id, professor, body)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


# ── 강의 삭제 ─────────────────────────────────────────────────────────────────

@router.delete(
    "/api/lectures/{lecture_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="강의 삭제 (소유 교수자 전용)",
)
async def delete_lecture_endpoint(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """강의 삭제. 진행 중인 HeyGen 렌더 잡은 best-effort 로 취소된 뒤 row 가 제거됩니다.
    cascade 로 child (video_renders, sessions, questions ...) 도 함께 삭제됩니다.
    """
    try:
        await delete_lecture(db, lecture_id, professor)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    return None


# ── 강의의 영상 조회 (교수자 전용) ───────────────────────────────────────────

@router.get(
    "/api/lectures/{lecture_id}/video",
    response_model=VideoStatusResponse,
    summary="강의에 연결된 영상 조회 (교수자 전용)",
)
async def get_lecture_video(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """lecture_id로 연결된 Video의 id·status를 반환합니다."""
    await assert_professor_owns_lecture(db, lecture_id, professor.id)
    result = await db.execute(
        select(Video).where(Video.lecture_id == lecture_id)
    )
    video = result.scalars().first()
    if video is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="이 강의에 연결된 영상이 아직 생성되지 않았습니다.",
        )
    return VideoStatusResponse(
        id=video.id,
        status=video.status.value,
        updated_at=video.updated_at,
    )


# ── 슬라이드 메타 조회 (편집기 즉시 렌더용) ─────────────────────────────────


_SLIDE_TITLE_MAX_LEN = 40


def _truncate_title(text: str) -> str | None:
    """슬라이드 카드 라벨용으로 첫 줄을 잘라 반환. 비어 있으면 None."""
    if not text:
        return None
    first_line = text.strip().splitlines()[0].strip()
    if not first_line:
        return None
    if len(first_line) <= _SLIDE_TITLE_MAX_LEN:
        return first_line
    return first_line[: _SLIDE_TITLE_MAX_LEN - 1] + "…"


@router.get(
    "/api/lectures/{lecture_id}/slides",
    response_model=SlidesResponse,
    summary="강의 슬라이드 메타 조회 (편집기 즉시 렌더용)",
)
async def get_lecture_slides(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """슬라이드 메타(순번 + 임시 제목 + status)를 반환합니다.

    이 엔드포인트는 ``GET /api/videos/{id}/script`` 와 분리되어 있어, AI 스크립트
    생성을 기다리지 않고 좌측 슬라이드 목록 + 중앙 미리보기 영역을 먼저 렌더할
    수 있게 한다. ``status`` 는 슬라이드 단위로 산출된다:

    - ``ready``: 해당 인덱스에 대한 ``VideoScript.segments`` 가 도착함.
    - ``pending``: PPTX 파싱·임베딩까진 끝났지만 스크립트는 아직 생성 중.

    어떤 출처도 없으면 빈 리스트 — 프론트는 그 상태를 "PPTX 파싱 대기" 스켈레톤
    으로 표시한다.
    """
    lecture = await assert_professor_owns_lecture(db, lecture_id, professor.id)

    # 1) VideoScript.segments — 이미 생성된 슬라이드 (status=ready)
    video_result = await db.execute(
        select(Video)
        .options(selectinload(Video.script))
        .where(Video.lecture_id == lecture_id)
        .order_by(Video.created_at.desc())
    )
    video = video_result.scalars().first()

    ready_titles: dict[int, str | None] = {}
    if video is not None and video.script is not None:
        for seg in video.script.segments or []:
            idx = seg.get("slide_index")
            if not isinstance(idx, int) or idx < 0:
                continue
            ready_titles[idx] = _truncate_title(seg.get("text") or "")

    # 2) SlideEmbedding (step2 결과) — 임시 제목 fallback + slide_count 추정.
    #    pipeline_task_id 가 비어 있으면 파싱조차 시작하지 않은 단계.
    #
    # slide_image_url 컬럼은 창 2 (모델·마이그레이션) 가 별도 브랜치에서 추가
    # 한다. 본 브랜치가 창 2 보다 먼저 배포되더라도 500 이 나지 않도록 컬럼
    # 존재 여부를 hasattr 로 감지해 select 절을 분기한다. 없을 때는 image_url
    # 을 None 으로 두며, 프론트는 DefaultSlideMock 으로 그린다.
    pending_titles: dict[int, str | None] = {}
    slide_image_urls: dict[int, str | None] = {}
    if lecture.pipeline_task_id:
        has_image_col = hasattr(SlideEmbedding, "slide_image_url")
        columns = [SlideEmbedding.slide_number, SlideEmbedding.text_content]
        if has_image_col:
            columns.append(SlideEmbedding.slide_image_url)

        try:
            emb_result = await db.execute(
                select(*columns)
                .where(SlideEmbedding.task_id == lecture.pipeline_task_id)
                .order_by(SlideEmbedding.slide_number.asc())
            )
            rows = emb_result.all()
        except AttributeError:
            # 모델 import 시점/세션 상태에 따라 다른 경로로 실패하는 극단 케이스 —
            # 안전하게 image_url 없이 다시 시도.
            has_image_col = False
            emb_result = await db.execute(
                select(SlideEmbedding.slide_number, SlideEmbedding.text_content)
                .where(SlideEmbedding.task_id == lecture.pipeline_task_id)
                .order_by(SlideEmbedding.slide_number.asc())
            )
            rows = emb_result.all()

        for row in rows:
            slide_number = row[0]
            text_content = row[1]
            image_url = row[2] if has_image_col and len(row) > 2 else None
            # SlideEmbedding.slide_number 는 1-based (parser.py 참고),
            # API 응답은 0-based 로 통일 (ScriptSegment.slide_index 와 동일).
            idx = int(slide_number) - 1
            if idx < 0:
                continue
            pending_titles[idx] = _truncate_title(text_content or "")
            slide_image_urls[idx] = image_url

    all_indices = sorted(set(ready_titles) | set(pending_titles))
    slides: list[SlideMeta] = []
    for idx in all_indices:
        image_url = slide_image_urls.get(idx)
        if idx in ready_titles:
            title = ready_titles[idx] or pending_titles.get(idx)
            slides.append(
                SlideMeta(index=idx, title=title, status="ready", image_url=image_url)
            )
        else:
            slides.append(
                SlideMeta(
                    index=idx,
                    title=pending_titles.get(idx),
                    status="pending",
                    image_url=image_url,
                )
            )

    return SlidesResponse(lecture_id=lecture_id, slides=slides)


# ── 공개 강의 조회 (인증 불필요) ──────────────────────────────────────────────

@router.get(
    "/api/lectures/{slug}/public",
    response_model=LecturePublicResponse,
    summary="슬러그로 공개 강의 조회",
)
async def get_public_lecture(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """
    인증 없이 접근 가능한 공개 엔드포인트입니다.

    - `is_published=true` 인 강의만 반환됩니다.
    - `expires_at`이 현재 시각보다 과거이면 `is_expired=true`, `video_url=null` 로 반환됩니다.
    """
    try:
        return await get_public_lecture_by_slug(db, slug)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
