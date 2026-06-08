"""교수자 Q&A 사전 답변(instructor_seed) 즉시 렌더 테스트 (docs/planning/08 §5, 09 §5).

검증 핵심(MOCK 모드, 내부 함수 직접 호출 — 창1/창3 비의존):
- 사전 질문 pending → _render_seed_questions 제출 → _poll_seed_renders → ready.
- RAG 범위 밖 질문은 렌더하지 않고 failed.
- 영상당 렌더 한도(QA_AVATAR_TOP_CLUSTERS) 강제.
- 야간 배치(_submit_pending)는 instructor_seed 를 건너뛴다(학생 적립만 클러스터링).
"""
from __future__ import annotations

import asyncio
import types
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
    """app.services.pipeline.qa.answer_question 을 결정적으로 대체(RAG·Claude 호출 차단).

    _render_seed_questions 가 함수 내부에서 import 하므로 원본 모듈 속성을 패치한다.
    """
    import app.services.pipeline.qa as qa_mod

    def _fake(db, task_id, session_id, question):
        return types.SimpleNamespace(in_scope=in_scope, answer=answer)

    monkeypatch.setattr(qa_mod, "answer_question", _fake)


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


# ── 2. 범위 밖 질문은 렌더하지 않고 failed ─────────────────────────────────────


def test_seed_out_of_scope_marked_failed(sync_db, mock_render, monkeypatch):
    from app.tasks import qa_batch

    _patch_answer(monkeypatch, in_scope=False)
    prof, _c, lec = _seed_lecture(sync_db)
    row = _seed(sync_db, lec, prof, "오늘 점심 메뉴 추천해줘")
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
    assert row.error_message == "강의 범위 밖 질문"
    assert row.heygen_job_id is None  # 범위 밖은 렌더(제출) 자체를 하지 않는다.


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
