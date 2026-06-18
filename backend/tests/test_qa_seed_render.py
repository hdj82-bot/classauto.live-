"""교수자 Q&A 사전 답변(instructor_seed) 즉시 렌더 테스트 (docs/planning/08 §5, 09 §5).

검증 핵심(MOCK 모드, 내부 함수 직접 호출 — 창1/창3 비의존):
- 사전 질문 pending → _render_seed_questions 제출 → _poll_seed_renders → ready.
- RAG 범위 밖 질문은 렌더하지 않고 failed.
- 영상당 렌더 한도(QA_AVATAR_TOP_CLUSTERS) 강제.
- 야간 배치(_submit_pending)는 instructor_seed 를 건너뛴다(학생 적립만 클러스터링).
"""
from __future__ import annotations

import asyncio
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.base import Base
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.qa_answer_cache import QAAnswerCache
from app.models.user import User, UserRole
from app.services.pipeline import qa_avatar
from tests.conftest import _patch_jsonb_columns


# ── 헬퍼 ──────────────────────────────────────────────────────────────────────


def _vec(*head: float) -> list[float]:
    """앞쪽 몇 개만 채운 1536차원 임베딩(나머지 0)."""
    v = [0.0] * 1536
    for i, x in enumerate(head):
        v[i] = x
    return v


@pytest.fixture
def sync_db():
    """배치(sync ORM)용 동기 SQLite 세션 — test_qa_avatar.py 와 동일 패턴."""
    _patch_jsonb_columns()
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    try:
        yield s
    finally:
        s.close()
        engine.dispose()


@pytest.fixture
def mock_render(monkeypatch):
    """MOCK 렌더 환경 — 외부 호출 0, 한도 기본값(영상당 3 / 교수자 월 6)."""
    monkeypatch.setattr(settings, "HEYGEN_MOCK", True)
    monkeypatch.setattr(settings, "HEYGEN_MOCK_VIDEO_URL", "")
    monkeypatch.setattr(settings, "QA_AVATAR_TOP_CLUSTERS", 3)
    monkeypatch.setattr(settings, "QA_AVATAR_MIN_CLUSTER_SIZE", 1)
    monkeypatch.setattr(settings, "QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR", 6)
    # 임베딩(OpenAI) 호출 차단 — 결정적 벡터 반환.
    monkeypatch.setattr(qa_avatar, "embed_question", lambda q: _vec(1.0, 0.0))


def _patch_answer(monkeypatch, *, in_scope: bool, answer: str = "사전 답변입니다."):
    """app.services.pipeline.qa.generate_seed_answer 를 결정적으로 대체(RAG·Claude 차단).

    _render_seed_questions 가 빈 답변 폴백에서
    generate_seed_answer(db, task_id, question, lang=...) → (answer, in_scope) 를
    호출하므로 원본 모듈 속성을 패치한다.
    """
    import app.services.pipeline.qa as qa_mod

    def _fake(db, task_id, question, lang="ko"):
        return (answer if in_scope else "", in_scope)

    monkeypatch.setattr(qa_mod, "generate_seed_answer", _fake)


def _seed_lecture(db) -> tuple[User, Course, Lecture]:
    prof = User(
        id=uuid.uuid4(), google_sub=f"g-{uuid.uuid4().hex[:8]}",
        email=f"{uuid.uuid4().hex[:6]}@t.ac.kr", name="교수", role=UserRole.professor,
        is_active=True,
    )
    db.add(prof)
    db.flush()
    course = Course(id=uuid.uuid4(), instructor_id=prof.id, title="강좌")
    db.add(course)
    db.flush()
    lec = Lecture(
        id=uuid.uuid4(), course_id=course.id, title="강의",
        slug=f"slug-{uuid.uuid4().hex}", order=1, pipeline_task_id="task-1",
    )
    db.add(lec)
    db.flush()
    return prof, course, lec


def _seed(db, lec, prof, question: str) -> QAAnswerCache:
    """교수자 사전 질문 행 — upsert_seed_questions 가 만드는 형태와 동일."""
    row = QAAnswerCache(
        lecture_id=lec.id, instructor_id=prof.id,
        question_text=question, answer_text=None, question_embedding=None,
        status=qa_avatar.STATUS_PENDING, origin=qa_avatar.ORIGIN_SEED,
    )
    db.add(row)
    db.flush()
    return row


def _student_pending(db, lec, prof, question: str, emb: list[float]) -> QAAnswerCache:
    row = QAAnswerCache(
        lecture_id=lec.id, instructor_id=prof.id,
        question_text=question, answer_text="텍스트 답변", question_embedding=emb,
        status=qa_avatar.STATUS_PENDING, origin=qa_avatar.ORIGIN_STUDENT,
    )
    db.add(row)
    db.flush()
    return row


# ── 1. pending → 렌더 제출 → 폴링 → ready ──────────────────────────────────────


def test_seed_render_roundtrip_to_ready(sync_db, mock_render, monkeypatch):
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    prof, _c, lec = _seed_lecture(sync_db)
    _seed(sync_db, lec, prof, "이 강의의 핵심 개념은?")
    _seed(sync_db, lec, prof, "기말 평가 방식은?")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        rendered = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
        # 제출 직후 — 두 질문 모두 rendering(질문 1건 = 단독 클러스터 1렌더).
        assert rendered["submitted"] == 2
        assert rendered["failed"] == 0
        rows = sync_db.query(QAAnswerCache).all()
        assert all(r.status == qa_avatar.STATUS_RENDERING for r in rows)
        assert all(r.heygen_job_id for r in rows)  # 단독 클러스터라 각자 대표.
        assert all(r.answer_text == "사전 답변입니다." for r in rows)

        # 폴링 — MOCK get_video_status 즉시 completed → ready.
        polled = qa_batch._poll_seed_renders(sync_db, loop, lec.id)
        assert polled["completed"] == 2
    finally:
        loop.close()

    rows = sync_db.query(QAAnswerCache).all()
    assert all(r.status == qa_avatar.STATUS_READY for r in rows)
    assert all(r.s3_video_url for r in rows)


def test_seed_render_retries_failed_questions(sync_db, mock_render, monkeypatch):
    """이미 failed 인 질문도 '다시 제작' 시 재시도된다(원인 해소 후 복구)."""
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    prof, _c, lec = _seed_lecture(sync_db)
    # 이전 시도에서 실패로 박힌 질문(예: 본인 아바타 미확보·한도).
    sync_db.add(QAAnswerCache(
        lecture_id=lec.id, instructor_id=prof.id, question_text="실패했던 질문",
        answer_text="사전 답변", status=qa_avatar.STATUS_FAILED,
        error_message="본인 아바타를 준비하지 못했습니다.",
        origin=qa_avatar.ORIGIN_SEED,
    ))
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    # 실패였던 질문이 재시도되어 제출됨(원인 해소 가정 — MOCK).
    assert result["submitted"] == 1
    row = sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.lecture_id == lec.id
    ).first()
    assert row.status == qa_avatar.STATUS_RENDERING
    assert row.error_message is None  # 재시도 시 이전 사유 초기화


# ── 1-b. 교수자 사전 대답이 있으면 RAG 를 건너뛰고 그 답변으로 렌더 ────────────


def test_seed_render_uses_instructor_answer_without_rag(sync_db, mock_render, monkeypatch):
    from app.tasks import qa_batch

    # generate_seed_answer 가 호출되면 실패 — 교수자 답변이 있으면 RAG 미호출이어야 함.
    import app.services.pipeline.qa as qa_mod

    def _boom(*_a, **_k):
        raise AssertionError("교수자 답변이 있는데 RAG(generate_seed_answer)가 호출됨")

    monkeypatch.setattr(qa_mod, "generate_seed_answer", _boom)

    prof, _c, lec = _seed_lecture(sync_db)
    row = QAAnswerCache(
        lecture_id=lec.id, instructor_id=prof.id,
        question_text="이 강의의 핵심 개념은?", answer_text="교수자가 직접 쓴 답변.",
        question_embedding=None, status=qa_avatar.STATUS_PENDING,
        origin=qa_avatar.ORIGIN_SEED,
    )
    sync_db.add(row)
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        rendered = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
        assert rendered == {"submitted": 1, "failed": 0}
        refreshed = sync_db.query(QAAnswerCache).one()
        assert refreshed.status == qa_avatar.STATUS_RENDERING
        assert refreshed.answer_text == "교수자가 직접 쓴 답변."  # RAG 로 덮어쓰지 않음
    finally:
        loop.close()


def test_seed_render_preserves_long_instructor_answer(sync_db, mock_render, monkeypatch):
    """긴 사전 대답(>400자)이 렌더 후에도 원문 그대로 보존된다.

    이전엔 렌더가 answer_text 를 QA_AVATAR_MAX_ANSWER_CHARS(=400)로 잘라 다시 저장해,
    편집기에 답변 뒷부분이 사라졌다(2026-06-15 사용자 보고). 이제 원문을 보존한다.
    """
    from app.tasks import qa_batch

    prof, _c, lec = _seed_lecture(sync_db)
    long_answer = "A" * 700  # 옛 상한(400)보다 길고 새 상한(800) 이내
    row = QAAnswerCache(
        lecture_id=lec.id, instructor_id=prof.id,
        question_text="긴 답변이 필요한 질문?", answer_text=long_answer,
        question_embedding=None, status=qa_avatar.STATUS_PENDING,
        origin=qa_avatar.ORIGIN_SEED,
    )
    sync_db.add(row)
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        rendered = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
        assert rendered == {"submitted": 1, "failed": 0}
        refreshed = sync_db.query(QAAnswerCache).one()
        assert refreshed.answer_text == long_answer  # 400자로 잘리지 않음
    finally:
        loop.close()


# ── 1-c. 본인 아바타를 끝내 확보 못 하면 failed + 사유(무한 "대기" 방지) ─────────


def test_seed_render_fails_when_avatar_unavailable(sync_db, mock_render, monkeypatch):
    """_resolve_character 가 None(본인 아바타 등록 실패)이면 seed 를 failed + 사유로 표시.

    종전엔 렌더가 조용히 보류되어 카드가 영구 "대기"에 머물렀다. 교수자 트리거
    렌더이므로 사유를 알려 무한 대기를 없앤다.
    """
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    # MOCK 에선 _ensure_talking_photo_sync 가 항상 mock id 를 주므로, 미확보 상황을
    # 재현하려 _resolve_character 를 직접 None 으로 둔다(본인 아바타 등록 끝내 실패).
    monkeypatch.setattr(qa_batch, "_resolve_character", lambda *a, **k: None)

    prof, _c, lec = _seed_lecture(sync_db)
    r1 = _seed(sync_db, lec, prof, "질문 1")
    r2 = _seed(sync_db, lec, prof, "질문 2")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    assert result == {"submitted": 0, "failed": 2}
    for r in (r1, r2):
        sync_db.refresh(r)
        assert r.status == qa_avatar.STATUS_FAILED
        assert "본인 아바타" in (r.error_message or "")
        assert r.heygen_job_id is None  # 렌더(제출) 자체를 하지 않는다.


def test_seed_render_own_face_visionstory_never_registers_heygen(
    sync_db, mock_render, monkeypatch
):
    """본인 얼굴 + VisionStory 강의의 seed 렌더는 HeyGen talking_photo 를 만들지 않는다.

    회귀(2026-06-16 사용자 보고): 사전점검이 provider 와 무관하게 _resolve_character 를
    호출해, 본인 얼굴 강의에서 _ensure_talking_photo_sync 가 HeyGen 에 사진 아바타를
    등록했다. VisionStory 로 이전(HeyGen 아바타 전량 삭제)한 뒤에도 ‘다시 제작’마다
    HeyGen 에 아바타가 되살아나 3개 한도(401028)로 Q&A 가 통째로 실패했다.
    """
    import app.services.pipeline.visionstory as vs_mod
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    monkeypatch.setattr(settings, "VISIONSTORY_MOCK", True)

    prof, _c, lec = _seed_lecture(sync_db)
    # 강의에 본인 얼굴(=교수자 talking_photo_id)을 적용 → 본인 얼굴 경로.
    prof.photo_avatar_id = "tp-own"
    lec.avatar_id = "tp-own"
    # VisionStory 가 쓸 본인 얼굴 이미지는 확보된다고 가정(S3 다운로드 우회).
    monkeypatch.setattr(
        qa_batch, "_own_face_image", lambda *a, **k: (b"img", "image/png")
    )

    # 핵심 단언 — HeyGen talking_photo 등록은 절대 호출되면 안 된다.
    def _must_not_register(*_a, **_k):
        raise AssertionError("VisionStory 경로인데 HeyGen talking_photo 를 등록함")

    monkeypatch.setattr(qa_batch, "_ensure_talking_photo_sync", _must_not_register)

    async def _mk_avatar(*_a, **_k):
        return "vs-avatar-1"

    async def _mk_video(*_a, **_k):
        return "vs-video-1"

    monkeypatch.setattr(vs_mod, "create_avatar", _mk_avatar)
    monkeypatch.setattr(vs_mod, "submit_talking_video", _mk_video)

    _seed(sync_db, lec, prof, "이 강의의 핵심 개념은?")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    assert result["submitted"] == 1
    row = (
        sync_db.query(QAAnswerCache)
        .filter(QAAnswerCache.origin == qa_avatar.ORIGIN_SEED)
        .first()
    )
    assert row.status == qa_avatar.STATUS_RENDERING
    # VisionStory 로 제출됐다는 표식(접두) — HeyGen 경로가 아니다.
    assert (row.heygen_job_id or "").startswith("visionstory:")


def test_own_face_look_id_prefers_lecture_designated_look():
    """VisionStory 본인 룩 선택 — 강의에 지정한 룩(lecture.avatar_id)을 기본 룩보다 우선.

    회귀(2026-06-16 사용자 보고): 강의마다 다른 룩을 골라도 답변 영상이 늘 기본 룩
    얼굴로 나왔다("내가 지정한 아바타가 아니다"). 지정 룩을 우선 쓴다.
    """
    from app.tasks import qa_batch

    class _Prof:
        photo_avatar_default_look_id = "default-look"
        profile_image_url = "https://s3/profile.jpg"

    class _Lec:
        avatar_id = "designated-look"

    # 강의에 지정한 룩이 있으면 그것을 쓴다(기본 룩이 아니라).
    assert qa_batch._own_face_look_id(_Prof(), _Lec()) == "designated-look"
    # 강의 아바타 미지정 → 교수자 기본 룩으로 폴백.
    class _LecNone:
        avatar_id = None
    assert qa_batch._own_face_look_id(_Prof(), _LecNone()) == "default-look"
    # lecture 인자 없음 → 기본 룩(무회귀).
    assert qa_batch._own_face_look_id(_Prof(), None) == "default-look"
    # source_key 도 지정 룩을 반영(다른 룩 선택 시 VisionStory 아바타 재생성 유도).
    assert qa_batch._own_face_source_key(_Prof(), _Lec()) == "designated-look"


def test_resolve_character_falls_back_to_standard_avatar(sync_db, monkeypatch):
    """본인 얼굴(Talking Photo) 미확보 시 표준 아바타로 폴백해 Q&A 가 막히지 않는다."""
    from app.models.lecture import VoiceGender
    from app.tasks import qa_batch

    # 본인 얼굴 등록이 끝내 실패하는 상황(HeyGen 한도 등) — None 반환.
    monkeypatch.setattr(qa_batch, "_ensure_talking_photo_sync", lambda *a, **k: None)
    monkeypatch.setattr(settings, "HEYGEN_AVATAR_ID_MALE", "std-avatar-male")

    prof, _c, lec = _seed_lecture(sync_db)
    # 강의에 본인 룩(look-x)을 적용 → 본인 얼굴 경로. 단 Talking Photo 확보 실패 가정.
    prof.photo_avatar_default_look_id = "look-x"
    lec.avatar_id = "look-x"
    lec.voice_gender = VoiceGender.male
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        character = qa_batch._resolve_character(sync_db, loop, lec, prof)
    finally:
        loop.close()

    # talking_photo 가 아니라 표준 avatar 로 폴백 → 렌더는 진행된다.
    assert character == {"avatar_id": "std-avatar-male"}


def test_resolve_character_defaults_to_standard_when_not_opted_in(sync_db, monkeypatch):
    """옵트인 OFF(기본)면 본인 룩이 있어도 표준 아바타로 렌더 — 슬롯 소모 0(확장성)."""
    from app.tasks import qa_batch

    # 옵트인이 아니면 talking_photo 등록을 시도조차 하면 안 된다(슬롯 보호).
    def _must_not_register(*_a, **_k):
        raise AssertionError("옵트인 OFF 인데 talking_photo 등록을 시도함")

    monkeypatch.setattr(qa_batch, "_ensure_talking_photo_sync", _must_not_register)

    prof, _c, lec = _seed_lecture(sync_db)
    prof.qa_use_own_face = False  # 기본값(명시)
    prof.photo_avatar_default_look_id = "look-x"  # 본인 룩이 있어도
    lec.avatar_id = None
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        character = qa_batch._resolve_character(sync_db, loop, lec, prof)
    finally:
        loop.close()

    # 표준 아바타 경로 — avatar_id 키(값 None 이면 create_video 가 gender 로 기본 선택).
    assert character is not None and "talking_photo_id" not in character
    assert "avatar_id" in character


# ── 2. 범위 밖 질문은 렌더하지 않고 failed ─────────────────────────────────────


def test_seed_no_slides_marked_failed(sync_db, mock_render, monkeypatch):
    from app.tasks import qa_batch

    # in_scope=False = 강의 슬라이드/임베딩 없음(생성 불가).
    _patch_answer(monkeypatch, in_scope=False)
    prof, _c, lec = _seed_lecture(sync_db)
    row = _seed(sync_db, lec, prof, "슬라이드가 없는 강의의 질문")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    assert result["submitted"] == 0
    assert result["failed"] == 1
    sync_db.refresh(row)
    assert row.status == qa_avatar.STATUS_FAILED
    assert row.error_message == "강의 자료를 찾지 못했습니다."
    assert row.heygen_job_id is None  # 자료 없으면 렌더(제출) 자체를 하지 않는다.


# ── 3. 영상당 렌더 한도(QA_AVATAR_TOP_CLUSTERS) ────────────────────────────────


def test_seed_render_caps_per_lecture(sync_db, mock_render, monkeypatch):
    """한 영상에 4개를 등록해도 영상당 한도(3)까지만 제출, 초과분은 pending 유지."""
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    prof, _c, lec = _seed_lecture(sync_db)
    for i in range(4):
        _seed(sync_db, lec, prof, f"질문 {i}")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    assert result["submitted"] == 3
    rendered = sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.lecture_id == lec.id,
        QAAnswerCache.heygen_job_id.isnot(None),
    ).count()
    assert rendered == 3
    pending = sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.status == qa_avatar.STATUS_PENDING
    ).count()
    assert pending == 1


def test_seed_render_caps_across_calls(sync_db, mock_render, monkeypatch):
    """이미 이번 달 렌더가 있으면 영상당 남은 한도만큼만 추가 제출(누적 합산)."""
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    prof, _c, lec = _seed_lecture(sync_db)
    # 이번 달 이미 2렌더 제출됨(heygen_job_id 보유) → 영상당 남은 한도 1.
    for i in range(2):
        sync_db.add(QAAnswerCache(
            lecture_id=lec.id, instructor_id=prof.id, question_text=f"이전 {i}",
            status=qa_avatar.STATUS_RENDERING, heygen_job_id=f"prev-{i}",
            origin=qa_avatar.ORIGIN_SEED,
        ))
    _seed(sync_db, lec, prof, "신규 질문 A")
    _seed(sync_db, lec, prof, "신규 질문 B")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    assert result["submitted"] == 1  # 영상당 3 - 기존 2 = 1.


def test_unlimited_account_bypasses_per_lecture_cap(sync_db, mock_render, monkeypatch):
    """무제한 계정은 강의당 월 캡(3)을 면제 — 등록한 사전 질문을 전부 렌더한다."""
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    prof, _c, lec = _seed_lecture(sync_db)
    # 이 교수자를 무제한 화이트리스트에 넣는다.
    prof.email = "unlimited@t.ac.kr"
    monkeypatch.setattr(settings, "QA_AVATAR_UNLIMITED_EMAILS", "unlimited@t.ac.kr")
    # 이번 달 이미 3렌더(캡 소진) — 일반 계정이면 limit=0 이지만 무제한은 무시.
    for i in range(3):
        sync_db.add(QAAnswerCache(
            lecture_id=lec.id, instructor_id=prof.id, question_text=f"이전 {i}",
            status=qa_avatar.STATUS_RENDERING, heygen_job_id=f"prev-{i}",
            origin=qa_avatar.ORIGIN_SEED,
        ))
    for i in range(4):
        _seed(sync_db, lec, prof, f"신규 질문 {i}")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    # 캡(3)에 안 막히고 신규 4개 전부 제출.
    assert result["submitted"] == 4


def test_limit_zero_marks_failed_with_quota_message(sync_db, mock_render, monkeypatch):
    """한도 0(일반 계정·캡 소진)이면 질문을 '대기'로 방치하지 않고 사유와 함께 failed."""
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    prof, _c, lec = _seed_lecture(sync_db)  # 일반 계정(무제한 아님)
    # 이번 달 이미 3렌더 → 영상당 남은 한도 0.
    for i in range(3):
        sync_db.add(QAAnswerCache(
            lecture_id=lec.id, instructor_id=prof.id, question_text=f"이전 {i}",
            status=qa_avatar.STATUS_RENDERING, heygen_job_id=f"prev-{i}",
            origin=qa_avatar.ORIGIN_SEED,
        ))
    row = _seed(sync_db, lec, prof, "추가 질문")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    assert result == {"submitted": 0, "failed": 1}
    sync_db.refresh(row)
    assert row.status == qa_avatar.STATUS_FAILED
    assert "한도" in (row.error_message or "")  # 조용한 '대기' 가 아니라 사유 표시


def test_failed_renders_do_not_consume_lecture_cap(sync_db, mock_render, monkeypatch):
    """실패한 Q&A 렌더는 영상당 한도를 소모하지 않는다 — 재시도가 '한도 소진'으로 안 막힘.

    회귀(2026-06-16 사용자 결정): 종전엔 실패 렌더도 heygen_job_id 보유로 카운트돼,
    한 영상의 3렌더가 모두 실패하면 limit=0 → 재시도가 전부 '한도 소진'으로 막혔다
    (잘못 만들면 영상 통째로 다시 만들어야 하는 구조). 실패는 한도에서 제외한다.
    """
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    prof, _c, lec = _seed_lecture(sync_db)  # 일반 계정(무제한 아님)
    # 직전 시도에서 3개(영상당 캡=3)가 모두 failed(제출 표식 heygen_job_id 보유)로 박힘.
    for i in range(3):
        sync_db.add(QAAnswerCache(
            lecture_id=lec.id, instructor_id=prof.id, question_text=f"질문 {i}",
            answer_text="사전 답변", status=qa_avatar.STATUS_FAILED,
            error_message="이전 실패", heygen_job_id=f"job-old-{i}",
            origin=qa_avatar.ORIGIN_SEED,
        ))
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    # 실패가 한도를 소모하지 않으므로 3개 모두 재시도 제출(한도 소진 차단 없음).
    assert result == {"submitted": 3, "failed": 0}
    rows = sync_db.query(QAAnswerCache).all()
    assert all(r.status == qa_avatar.STATUS_RENDERING for r in rows)
    # 재시도는 새 job 으로 제출 — 옛 실패 job_id 는 비워졌다.
    assert all(
        r.heygen_job_id and not r.heygen_job_id.startswith("job-old") for r in rows
    )


# ── 3-b. C-2: 강의당 아바타 제작(렌더 패스) 횟수 상한 ──────────────────────────


def test_rerender_pass_counts_as_one_regardless_of_clusters(
    sync_db, mock_render, monkeypatch
):
    """한 번의 제작이 클러스터/클립 3개를 렌더해도 강의 카운터는 +1 만 증가(패스=1)."""
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    prof, _c, lec = _seed_lecture(sync_db)
    for i in range(3):  # 질문 1건 = 단독 클러스터 → 3 제출
        _seed(sync_db, lec, prof, f"질문 {i}")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    assert result["submitted"] == 3
    sync_db.refresh(lec)
    assert lec.avatar_render_count == 1  # 클립 3개여도 패스는 1


def test_rerender_cap_blocks_after_max(sync_db, mock_render, monkeypatch):
    """상한(여기선 2)에 도달하면 다음 제작은 렌더 없이 failed + 사유로 차단된다."""
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    monkeypatch.setattr(settings, "AVATAR_RERENDER_MAX_PER_LECTURE", 2)
    prof, _c, lec = _seed_lecture(sync_db)
    _seed(sync_db, lec, prof, "질문")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        # 패스 1·2 — 성공(각 +1) → count 2 도달.
        for _ in range(2):
            # 다음 패스를 위해 ready/rendering 을 pending 으로 되돌릴 필요 없이,
            # _render_seed_questions 는 pending+failed 만 잡으므로 새 질문을 매번 추가.
            r = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
            assert r["submitted"] >= 1
            # 다음 패스용 새 질문(이전 질문은 rendering 으로 빠짐).
            _seed(sync_db, lec, prof, f"추가 {_}")
            sync_db.commit()
        sync_db.refresh(lec)
        assert lec.avatar_render_count == 2

        # 패스 3 — 상한 도달 → 차단.
        blocked = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    assert blocked["submitted"] == 0
    assert blocked.get("blocked") == "rerender_cap"
    sync_db.refresh(lec)
    assert lec.avatar_render_count == 2  # 차단된 패스는 카운트하지 않음
    # 차단된 패스의 pending 질문은 사유와 함께 failed.
    pendings = sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.status == qa_avatar.STATUS_PENDING
    ).count()
    assert pendings == 0
    blocked_row = sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.status == qa_avatar.STATUS_FAILED
    ).first()
    assert blocked_row is not None
    assert "제작 횟수" in (blocked_row.error_message or "")


def test_failed_submit_pass_does_not_increment_count(sync_db, mock_render, monkeypatch):
    """제출이 전부 실패한 패스(본인 아바타 미확보 등)는 강의 카운터를 올리지 않는다."""
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    monkeypatch.setattr(qa_batch, "_resolve_character", lambda *a, **k: None)
    prof, _c, lec = _seed_lecture(sync_db)
    _seed(sync_db, lec, prof, "질문")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    assert result["submitted"] == 0
    sync_db.refresh(lec)
    assert lec.avatar_render_count == 0  # 비용 미발생 → 상한 미소모


def test_unlimited_account_bypasses_rerender_cap(sync_db, mock_render, monkeypatch):
    """면제 계정은 상한에 막히지 않고, 카운터도 올리지 않는다(무제한)."""
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=True)
    monkeypatch.setattr(settings, "AVATAR_RERENDER_MAX_PER_LECTURE", 1)
    prof, _c, lec = _seed_lecture(sync_db)
    prof.email = "unlimited@t.ac.kr"
    monkeypatch.setattr(settings, "QA_AVATAR_UNLIMITED_EMAILS", "unlimited@t.ac.kr")
    lec.avatar_render_count = 5  # 이미 상한 초과 상태여도
    _seed(sync_db, lec, prof, "질문")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch._render_seed_questions(sync_db, loop, lec.id, prof.id)
    finally:
        loop.close()

    assert result["submitted"] == 1  # 상한 무시(면제)
    sync_db.refresh(lec)
    assert lec.avatar_render_count == 5  # 면제 계정은 카운트 증가 안 함


# ── 4. 야간 배치(_submit_pending)는 instructor_seed 를 건너뛴다 ─────────────────


def test_nightly_batch_skips_seed(sync_db, mock_render):
    from app.tasks import qa_batch

    prof, _c, lec = _seed_lecture(sync_db)
    # 학생 적립 1건(임베딩 보유) + 교수자 사전 질문 2건.
    _student_pending(sync_db, lec, prof, "학생 질문", _vec(1.0, 0.0))
    s1 = _seed(sync_db, lec, prof, "사전 질문 1")
    s2 = _seed(sync_db, lec, prof, "사전 질문 2")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        submitted = qa_batch._submit_pending(loop, sync_db)
        sync_db.commit()
    finally:
        loop.close()

    # 학생 클러스터 1건만 제출 — 사전 질문은 클러스터링 대상이 아니다.
    assert submitted == 1
    sync_db.refresh(s1)
    sync_db.refresh(s2)
    assert s1.status == qa_avatar.STATUS_PENDING
    assert s2.status == qa_avatar.STATUS_PENDING
    assert s1.heygen_job_id is None and s2.heygen_job_id is None


# ── 웹훅으로 사전 질문 클립 완료(슬라이드와 동일 경로) ─────────────────────────


def _rendering_seed(db, lec, prof, job_id: str) -> QAAnswerCache:
    row = QAAnswerCache(
        lecture_id=lec.id, instructor_id=prof.id,
        question_text="이 강의의 핵심 개념은?", answer_text="사전 답변.",
        question_embedding=None, status=qa_avatar.STATUS_RENDERING,
        origin=qa_avatar.ORIGIN_SEED, heygen_job_id=job_id,
        cluster_key=uuid.uuid4().hex,
    )
    db.add(row)
    db.flush()
    return row


def test_seed_webhook_success_marks_ready(sync_db, monkeypatch):
    from app.api.v1 import webhooks

    async def _fake_upload(url, lecture_id, *a):  # noqa: ANN001
        return ("s3://qa/clip.mp4", 0.0)

    monkeypatch.setattr(webhooks.s3_svc, "upload_from_url", _fake_upload)

    prof, _c, lec = _seed_lecture(sync_db)
    row = _rendering_seed(sync_db, lec, prof, "heygen-seed-1")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        out = loop.run_until_complete(
            webhooks._handle_seed_clip_webhook(
                sync_db, "heygen-seed-1", "avatar_video.success",
                {"url": "https://heygen/clip.mp4", "duration": 5.0},
            )
        )
    finally:
        loop.close()

    assert out is not None and out["status"] == "processed"
    sync_db.refresh(row)
    assert row.status == qa_avatar.STATUS_READY
    assert row.s3_video_url == "s3://qa/clip.mp4"


def test_seed_webhook_fail_marks_failed(sync_db, monkeypatch):
    from app.api.v1 import webhooks

    prof, _c, lec = _seed_lecture(sync_db)
    row = _rendering_seed(sync_db, lec, prof, "heygen-seed-2")
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        out = loop.run_until_complete(
            webhooks._handle_seed_clip_webhook(
                sync_db, "heygen-seed-2", "avatar_video.fail",
                {"error": "HeyGen 오류"},
            )
        )
    finally:
        loop.close()

    assert out is not None and out["status"] == "processed"
    sync_db.refresh(row)
    assert row.status == qa_avatar.STATUS_FAILED


def test_seed_webhook_unknown_job_returns_none(sync_db):
    from app.api.v1 import webhooks

    loop = asyncio.new_event_loop()
    try:
        out = loop.run_until_complete(
            webhooks._handle_seed_clip_webhook(
                sync_db, "no-such-job", "avatar_video.success", {"url": "x"},
            )
        )
    finally:
        loop.close()
    # 매칭되는 seed 가 없으면 None → 호출부가 'unknown video_id' 로 흘려보낸다.
    assert out is None
