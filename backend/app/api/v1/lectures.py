import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_user,
    get_current_user_optional,
    require_professor,
)
from app.db.session import SyncSessionLocal, get_db
from app.models.embedding import SlideEmbedding
from app.models.user import User
from app.models.video import Video
from app.schemas.lecture import (
    LectureCreate,
    LectureDownloadResponse,
    LecturePublicResponse,
    LectureResponse,
    LectureUpdate,
    SlideMeta,
    SlidesResponse,
    SlideshowResponse,
)
from app.schemas.seed_question import (
    GeneratedSeedQuestion,
    GenerateSeedAnswerRequest,
    GenerateSeedAnswerResponse,
    GenerateSeedQuestionsResponse,
    SeedQuestionItem,
    SeedQuestionsRequest,
    SeedQuestionsResponse,
)
from app.schemas.video import VideoStatusResponse
from app.services.lecture import (
    assert_professor_owns_lecture,
    create_lecture,
    delete_lecture,
    get_lecture_slideshow_by_slug,
    get_public_lecture_by_slug,
    list_course_lectures,
    list_my_lectures,
    update_lecture,
)
from app.services.pipeline import qa_avatar
from app.services.pipeline.budget import (
    qa_render_quota_remaining,
    qa_renders_used_this_month,
)
from app.services.pipeline.s3 import presign_stored_s3_url

router = APIRouter(tags=["lectures"])


# ── 내 전체 강의 목록 (교수자 전용) ─────────────────────────────────────────

@router.get(
    "/api/me/lectures",
    response_model=list[LectureResponse],
    summary="내 전체 강의 목록 (교수자 전용)",
)
async def get_my_lectures(
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """현재 교수자가 소유한 모든 강의를 강좌 구분 없이 한 번에 반환한다.

    교수자 대시보드·보관함·스튜디오 등이 ``GET /api/courses`` 후 강좌별
    ``GET /api/courses/{id}/lectures`` 를 강좌 수만큼 호출하던 fan-out 워터폴을
    단일 호출로 대체하기 위한 엔드포인트. 응답 모양은 강좌별 목록과 동일한
    ``LectureResponse`` (각 항목에 course_id 포함).
    """
    return await list_my_lectures(db, professor)


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


# ── 교수자 Q&A 사전 질문 (영상당 ≤3) ─────────────────────────────────────────
#
# 교수자가 영상 생성 전 예상 질문을 미리 등록해, 첫 영상처럼 학생 질문 축적이
# 없을 때도 첫 학생 질문부터 아바타 답변이 나오게 한다. 저장은 origin=instructor_seed
# 행으로 쌓이고(qa_avatar.upsert_seed_questions), 영상 승인 시 즉시 렌더된다(창2 배치).
#
# async/sync 브리지: qa_avatar·budget 은 동기(Session) 함수다. 소유권 검증만 async
# 세션으로 하고, seed 작업은 별도 동기 세션에서 실행한다(qa.py ask_question 패턴).


def _seed_questions_response(sdb, instructor_id, rows) -> SeedQuestionsResponse:
    """현재 사전 질문 행 + 이번 달 렌더 한도/사용량을 응답으로 투영.

    answer 는 교수자가 입력한 사전 대답(없으면 ""=RAG 자동 생성 예정).
    preview_url 은 ready 인 행의 클립 presigned URL(점검용 재생).
    """
    items = [
        SeedQuestionItem(
            id=str(r.id),
            question=r.question_text,
            answer=r.answer_text or "",
            status=r.status,
            has_clip=bool(r.s3_video_url),
            preview_url=(
                presign_stored_s3_url(r.s3_video_url) if r.s3_video_url else None
            ),
        )
        for r in rows
    ]
    return SeedQuestionsResponse(
        questions=items,
        max=qa_avatar.SEED_QUESTIONS_MAX,
        used_this_month=qa_renders_used_this_month(sdb, instructor_id),
        remaining=qa_render_quota_remaining(sdb, instructor_id),
    )


@router.get(
    "/api/lectures/{lecture_id}/seed-questions",
    response_model=SeedQuestionsResponse,
    summary="교수자 Q&A 사전 질문 조회 (소유 교수자 전용)",
)
async def get_seed_questions(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """이 강의에 등록된 교수자 사전 질문(instructor_seed)을 결정적 순서로 반환한다.

    비소유 강의는 ``assert_professor_owns_lecture`` 가 404 로 거부한다.
    """
    await assert_professor_owns_lecture(db, lecture_id, professor.id)
    instructor_id = professor.id
    loop = asyncio.get_event_loop()

    def _work():
        with SyncSessionLocal() as sdb:
            rows = qa_avatar.list_seed_questions(sdb, lecture_id)
            return _seed_questions_response(sdb, instructor_id, rows)

    return await loop.run_in_executor(None, _work)


@router.put(
    "/api/lectures/{lecture_id}/seed-questions",
    response_model=SeedQuestionsResponse,
    summary="교수자 Q&A 사전 질문 저장 (소유 교수자 전용)",
)
async def put_seed_questions(
    lecture_id: uuid.UUID,
    body: SeedQuestionsRequest,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """사전 질문(+답변) 집합을 ``questions`` 로 맞춘다(차집합 동기화). 4개 이상이면 422.

    같은 질문 기존 행은 보존(답변 동일 시 렌더된 클립 유지), 답변이 바뀐 행은 재렌더
    대기로 되돌림, 빠진 행은 삭제, 새 행은 pending 으로 추가. 답변을 비우면 영상 생성
    시 RAG 로 자동 생성된다. 비소유 강의는 404.
    """
    await assert_professor_owns_lecture(db, lecture_id, professor.id)
    instructor_id = professor.id
    items = [(q.question, q.answer) for q in body.questions]
    loop = asyncio.get_event_loop()

    def _work():
        with SyncSessionLocal() as sdb:
            rows = qa_avatar.upsert_seed_questions(
                sdb, lecture_id, instructor_id, items
            )
            sdb.commit()
            return _seed_questions_response(sdb, instructor_id, rows)

    return await loop.run_in_executor(None, _work)


@router.post(
    "/api/lectures/{lecture_id}/seed-questions/generate-answer",
    response_model=GenerateSeedAnswerResponse,
    summary="사전 질문 답변 AI 자동 생성 (검토용, 소유 교수자 전용)",
)
async def generate_seed_answer_endpoint(
    lecture_id: uuid.UUID,
    body: GenerateSeedAnswerRequest,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """질문 1건의 답변을 강의 자료(PPT) 기반으로 즉시 생성해 돌려준다(저장은 안 함).

    교수자가 "AI 답변 자동 생성"으로 받아 검토·수정 후 PUT 으로 저장한다. 답변에는
    중국어 괄호 병기 등 음성 표기 규칙이 적용된다(generate_seed_answer). 비소유 404,
    파이프라인 미처리면 400.
    """
    from app.models.lecture import Lecture  # noqa: PLC0415
    from app.services.pipeline.qa import generate_seed_answer  # noqa: PLC0415

    await assert_professor_owns_lecture(db, lecture_id, professor.id)

    lecture = await db.get(Lecture, lecture_id)
    task_id = lecture.pipeline_task_id if lecture else None
    if not task_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="강의 파이프라인이 아직 처리되지 않았습니다.",
        )

    question = body.question
    loop = asyncio.get_event_loop()

    def _work() -> GenerateSeedAnswerResponse:
        with SyncSessionLocal() as sdb:
            answer, in_scope = generate_seed_answer(sdb, task_id, question)
            return GenerateSeedAnswerResponse(answer=answer, in_scope=in_scope)

    return await loop.run_in_executor(None, _work)


@router.post(
    "/api/lectures/{lecture_id}/seed-questions/generate",
    response_model=GenerateSeedQuestionsResponse,
    summary="핵심 질문 + 사전 답변 자동 생성 (검토용, 소유 교수자 전용)",
)
async def generate_seed_questions_endpoint(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """강의 스크립트에서 학생이 자주 물을 핵심 질문 3개와 각 사전 답변을 자동 생성한다.

    "질문과 답변 자동 생성" 버튼이 호출 → 교수자가 받은 질문·답변을 검토·수정 후
    PUT 으로 저장한다(여기서는 저장하지 않음). 발화 언어(`lecture.voice_lang`)로
    작성되므로 영어 강의면 질문·답변도 영어. 비소유 404, 파이프라인 미처리면 400.
    """
    from app.models.lecture import Lecture  # noqa: PLC0415
    from app.services.pipeline.qa import generate_seed_questions  # noqa: PLC0415

    await assert_professor_owns_lecture(db, lecture_id, professor.id)

    lecture = await db.get(Lecture, lecture_id)
    task_id = lecture.pipeline_task_id if lecture else None
    if not task_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="강의 파이프라인이 아직 처리되지 않았습니다.",
        )
    voice_lang = (lecture.voice_lang if lecture else None) or "ko"
    loop = asyncio.get_event_loop()

    def _work() -> GenerateSeedQuestionsResponse:
        with SyncSessionLocal() as sdb:
            pairs = generate_seed_questions(sdb, task_id, n=3, lang=voice_lang)
            return GenerateSeedQuestionsResponse(
                questions=[GeneratedSeedQuestion(**p) for p in pairs]
            )

    return await loop.run_in_executor(None, _work)


@router.post(
    "/api/lectures/{lecture_id}/seed-questions/render",
    response_model=SeedQuestionsResponse,
    summary="사전 질문 아바타 클립 즉시 렌더 시작 (소유 교수자 전용)",
)
async def render_seed_questions_endpoint(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """등록된 사전 질문의 아바타 답변 클립 렌더를 지금 시작한다(전체 영상 생성과 별개).

    렌더는 비동기(celery)로 진행되며, 진척은 GET 폴링으로 확인한다. 저장(PUT)은
    호출 직전에 끝낸 상태를 가정한다. 비소유 404, 파이프라인 미처리면 400.
    """
    from app.celery_app import celery  # noqa: PLC0415
    from app.models.lecture import Lecture  # noqa: PLC0415

    await assert_professor_owns_lecture(db, lecture_id, professor.id)

    lecture = await db.get(Lecture, lecture_id)
    if not lecture or not lecture.pipeline_task_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="강의 파이프라인이 아직 처리되지 않았습니다.",
        )

    celery.send_task(
        "app.tasks.qa_batch.render_seed_questions",
        args=[str(lecture_id), str(professor.id)],
    )

    instructor_id = professor.id
    loop = asyncio.get_event_loop()

    def _work() -> SeedQuestionsResponse:
        with SyncSessionLocal() as sdb:
            rows = qa_avatar.list_seed_questions(sdb, lecture_id)
            return _seed_questions_response(sdb, instructor_id, rows)

    return await loop.run_in_executor(None, _work)


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
    #    slide_image_url 은 step1 에서 LibreOffice 로 렌더한 슬라이드 PNG 의 S3
    #    URL. 렌더 실패한 슬라이드는 NULL — 프론트는 fallback mock 으로 그린다.
    pending_titles: dict[int, str | None] = {}
    slide_image_urls: dict[int, str | None] = {}
    if lecture.pipeline_task_id:
        emb_result = await db.execute(
            select(
                SlideEmbedding.slide_number,
                SlideEmbedding.text_content,
                SlideEmbedding.slide_image_url,
            )
            .where(SlideEmbedding.task_id == lecture.pipeline_task_id)
            .order_by(SlideEmbedding.slide_number.asc())
        )
        for slide_number, text_content, image_url in emb_result.all():
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
        # DB 의 영구형 S3 URL → presigned (버킷이 thumbnails/slides/ 를 공개하지
        # 않아 익명 GET 이 403 — 조회 시점에 IAM 서명 URL 로 변환). NULL 은 그대로.
        image_url = presign_stored_s3_url(slide_image_urls.get(idx))
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
    viewer: User | None = Depends(get_current_user_optional),
):
    """
    인증 없이 접근 가능한 공개 엔드포인트입니다.

    - `is_published=true` 인 강의만 반환됩니다.
    - 단, 토큰이 소유 교수자면 미발행 강의도 반환(배포 전 미리보기).
    - `expires_at`이 현재 시각보다 과거이면 `is_expired=true`, `video_url=null` 로 반환됩니다.
    """
    try:
        return await get_public_lecture_by_slug(
            db, slug, viewer_id=viewer.id if viewer else None
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get(
    "/api/lectures/{slug}/slideshow",
    response_model=SlideshowResponse,
    summary="공개 강의 슬라이드쇼 재생 데이터 (인증 불필요)",
)
async def get_lecture_slideshow(
    slug: str,
    db: AsyncSession = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
):
    """학생 플레이어용 슬라이드쇼 데이터(슬라이드 이미지 + 구간 음성 + 타임라인).

    본문은 MP4 가 아니라 이 데이터로 클라이언트가 동기 재생한다
    (docs/planning/08-cost-optimization.md). 만료 강의는 빈 슬라이드 목록을 반환한다.
    소유 교수자는 미발행 강의도 재생 가능(배포 전 미리보기).
    """
    try:
        return await get_lecture_slideshow_by_slug(
            db, slug, viewer_id=viewer.id if viewer else None
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get(
    "/api/lectures/{slug}/seed-questions/public",
    summary="학생 플레이어용 추천(사전 제작) 질문 — 클립 보유분만",
)
async def get_public_seed_questions(
    slug: str,
    db: AsyncSession = Depends(get_db),
    viewer: User | None = Depends(get_current_user_optional),
):
    """교수자가 사전 제작한 예상 질문 중 **렌더 완료(클립 보유)** 항목만 반환한다.

    학생 Q&A 패널의 "추천 질문"으로 노출되며, 클릭하면 미리 만든 Q&A 아바타
    영상을 재생한다(실시간 RAG 가 아니라 사전 제작 클립). 발행 강의는 누구나,
    소유 교수자는 미발행이어도 조회 가능(배포 전 미리보기). ``status=ready`` +
    ``s3_video_url`` 있는 행만 내려준다.
    """
    try:
        pub = await get_public_lecture_by_slug(
            db, slug, viewer_id=viewer.id if viewer else None
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    lecture_id = pub.id
    loop = asyncio.get_event_loop()

    def _work():
        with SyncSessionLocal() as sdb:
            rows = qa_avatar.list_seed_questions(sdb, lecture_id)
            return [
                {
                    "id": str(r.id),
                    "question": r.question_text,
                    "video_url": presign_stored_s3_url(r.s3_video_url),
                }
                for r in rows
                if r.status == "ready" and r.s3_video_url
            ]

    questions = await loop.run_in_executor(None, _work)
    return {"questions": questions}


# ── 강의 mp4 on-demand 다운로드 (교수자) ──────────────────────────────────────

@router.post(
    "/api/lectures/{lecture_id}/download",
    response_model=LectureDownloadResponse,
    summary="강의 mp4 다운로드 합성 요청 (교수자 전용)",
)
async def request_lecture_download(
    lecture_id: uuid.UUID,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """본문 슬라이드쇼를 mp4 로 합성 요청한다(on-demand·캐시).

    이미 ``ready`` 면 바로 URL 을 돌려주고, 진행 중이면 ``building`` 을 반환한다.
    ``force=true`` 면 캐시를 무시하고 다시 합성한다.
    """
    lecture = await assert_professor_owns_lecture(db, lecture_id, professor.id)

    if not force and lecture.mp4_status == "ready" and lecture.mp4_url:
        return LectureDownloadResponse(
            status="ready", url=presign_stored_s3_url(lecture.mp4_url)
        )
    if not force and lecture.mp4_status == "building":
        return LectureDownloadResponse(status="building", url=None)

    lecture.mp4_status = "building"
    if force:
        lecture.mp4_url = None
    await db.commit()

    from app.tasks.export import compose_lecture_mp4  # noqa: PLC0415

    compose_lecture_mp4.delay(str(lecture_id), str(professor.id))
    return LectureDownloadResponse(status="building", url=None)


@router.get(
    "/api/lectures/{lecture_id}/download",
    response_model=LectureDownloadResponse,
    summary="강의 mp4 다운로드 상태 (교수자 전용)",
)
async def get_lecture_download(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(require_professor),
):
    """mp4 다운로드 합성 상태/URL. ready 면 presigned URL 을 함께 돌려준다."""
    lecture = await assert_professor_owns_lecture(db, lecture_id, professor.id)
    status_val = lecture.mp4_status or "none"
    url = (
        presign_stored_s3_url(lecture.mp4_url)
        if status_val == "ready"
        else None
    )
    return LectureDownloadResponse(status=status_val, url=url)
