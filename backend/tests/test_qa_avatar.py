"""아바타 Q&A 캐시 + 야간 배치 단위/통합 테스트 (docs/planning/08 §5, 09 §5).

검증 핵심(단독·창1 비의존):
- /qa/ask 텍스트 즉시 반환 + (캐시 적중 시) avatar 포함 / 미적중이면 적립.
- qa_batch 가 MOCK 모드에서 pending → ready 클립을 자체 폴링으로 완성.
- 교수자 월 렌더 한도(budget.assert_qa_render_budget).
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
    """배치(sync ORM)·캐시 조회용 동기 SQLite 세션."""
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


def _pending(db, lec, prof, question: str, emb: list[float], answer="답변입니다.") -> QAAnswerCache:
    row = QAAnswerCache(
        lecture_id=lec.id, instructor_id=prof.id,
        question_text=question, answer_text=answer,
        question_embedding=emb, status=qa_avatar.STATUS_PENDING,
    )
    db.add(row)
    db.flush()
    return row


# ── 순수 헬퍼 ─────────────────────────────────────────────────────────────────


def test_cosine_similarity_basics():
    assert qa_avatar.cosine_similarity(_vec(1, 0), _vec(1, 0)) == pytest.approx(1.0)
    assert qa_avatar.cosine_similarity(_vec(1, 0), _vec(0, 1)) == pytest.approx(0.0)
    assert qa_avatar.cosine_similarity([], _vec(1, 0)) == 0.0


def test_cluster_pending_groups_similar_separates_dissimilar(sync_db):
    prof, _course, lec = _seed_lecture(sync_db)
    a1 = _pending(sync_db, lec, prof, "환율이란?", _vec(1.0, 0.0))
    a2 = _pending(sync_db, lec, prof, "환율 뜻", _vec(0.99, 0.01))
    b1 = _pending(sync_db, lec, prof, "GDP란?", _vec(0.0, 1.0))

    clusters = qa_avatar.cluster_pending([a1, a2, b1], threshold=0.9)
    sizes = sorted(c.size for c in clusters)
    assert sizes == [1, 2]
    big = max(clusters, key=lambda c: c.size)
    ids = {m.id for m in big.members}
    assert ids == {a1.id, a2.id}


def test_cluster_representative_prefers_hit_count(sync_db):
    prof, _c, lec = _seed_lecture(sync_db)
    a1 = _pending(sync_db, lec, prof, "q1", _vec(1.0, 0.0))
    a2 = _pending(sync_db, lec, prof, "q2", _vec(0.98, 0.02))
    a2.hit_count = 5
    sync_db.flush()
    clusters = qa_avatar.cluster_pending([a1, a2], threshold=0.9)
    assert clusters[0].representative().id == a2.id


# ── resolve_avatar_for_question ───────────────────────────────────────────────


def test_resolve_out_of_scope_no_accrual(sync_db):
    prof, _c, lec = _seed_lecture(sync_db)
    res = qa_avatar.resolve_avatar_for_question(
        sync_db, lecture_id=lec.id, instructor_id=prof.id,
        question="범위 밖", answer="범위 밖", in_scope=False,
    )
    assert res.payload is None and res.cache_hit is False
    assert sync_db.query(QAAnswerCache).count() == 0


def test_resolve_miss_accrues_pending(sync_db, monkeypatch):
    prof, _c, lec = _seed_lecture(sync_db)
    # ready 캐시가 없으므로 미적중 → pending 적립.
    monkeypatch.setattr(qa_avatar, "get_embeddings", lambda texts: [_vec(0.0, 1.0)])
    res = qa_avatar.resolve_avatar_for_question(
        sync_db, lecture_id=lec.id, instructor_id=prof.id,
        question="새 질문", answer="텍스트 답변", in_scope=True,
    )
    assert res.payload is None and res.cache_hit is False
    rows = sync_db.query(QAAnswerCache).all()
    assert len(rows) == 1
    assert rows[0].status == qa_avatar.STATUS_PENDING
    assert rows[0].answer_text == "텍스트 답변"


def test_resolve_hit_returns_avatar_and_increments(sync_db, monkeypatch):
    prof, _c, lec = _seed_lecture(sync_db)
    ready = QAAnswerCache(
        lecture_id=lec.id, instructor_id=prof.id,
        question_text="환율이란?", answer_text="환율은...",
        question_embedding=_vec(1.0, 0.0),
        status=qa_avatar.STATUS_READY, s3_video_url="https://s3/qa.mp4",
        cluster_key="ck1", hit_count=0,
    )
    sync_db.add(ready)
    sync_db.flush()

    # 유사한 질문(임베딩 거의 동일) → 적중.
    monkeypatch.setattr(qa_avatar, "get_embeddings", lambda texts: [_vec(0.99, 0.01)])
    res = qa_avatar.resolve_avatar_for_question(
        sync_db, lecture_id=lec.id, instructor_id=prof.id,
        question="환율 뜻이 뭐죠", answer="환율은...", in_scope=True,
    )
    assert res.cache_hit is True
    assert res.payload["status"] == "ready"
    assert res.payload["video_url"] == "https://s3/qa.mp4"
    assert res.payload["cache_id"] == str(ready.id)
    sync_db.refresh(ready)
    assert ready.hit_count == 1
    # 적중은 새 pending 을 만들지 않는다.
    assert sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.status == qa_avatar.STATUS_PENDING
    ).count() == 0


# ── 야간 배치 (MOCK) ──────────────────────────────────────────────────────────


def test_batch_pending_to_ready_in_mock(sync_db, monkeypatch):
    from app.tasks import qa_batch

    monkeypatch.setattr(settings, "HEYGEN_MOCK", True)
    monkeypatch.setattr(settings, "HEYGEN_MOCK_VIDEO_URL", "")
    monkeypatch.setattr(settings, "QA_AVATAR_TOP_CLUSTERS", 3)
    monkeypatch.setattr(settings, "QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR", 6)
    monkeypatch.setattr(settings, "QA_AVATAR_MIN_CLUSTER_SIZE", 1)

    prof, _c, lec = _seed_lecture(sync_db)
    a1 = _pending(sync_db, lec, prof, "환율이란?", _vec(1.0, 0.0))
    a2 = _pending(sync_db, lec, prof, "환율 뜻", _vec(0.99, 0.01))  # a1 과 같은 클러스터
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch.process_qa_avatar_batch(sync_db, loop)
    finally:
        loop.close()

    assert result["submitted"] == 1       # 클러스터 1개
    assert result["completed"] == 1       # MOCK 즉시 완료
    rows = sync_db.query(QAAnswerCache).all()
    assert all(r.status == qa_avatar.STATUS_READY for r in rows)
    assert all(r.s3_video_url for r in rows)
    # 대표 1개만 heygen_job_id, 형제는 같은 클립 공유.
    reps = [r for r in rows if r.heygen_job_id]
    assert len(reps) == 1
    assert {r.s3_video_url for r in rows} == {reps[0].s3_video_url}


def test_batch_respects_monthly_render_cap(sync_db, monkeypatch):
    from app.tasks import qa_batch

    monkeypatch.setattr(settings, "HEYGEN_MOCK", True)
    monkeypatch.setattr(settings, "QA_AVATAR_TOP_CLUSTERS", 3)
    monkeypatch.setattr(settings, "QA_AVATAR_MIN_CLUSTER_SIZE", 1)
    monkeypatch.setattr(settings, "QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR", 2)

    prof, _c, lec = _seed_lecture(sync_db)
    # 서로 다른(비유사) 4개 클러스터 → 한도 2 라 2건만 제출.
    _pending(sync_db, lec, prof, "q1", _vec(1.0, 0.0))
    _pending(sync_db, lec, prof, "q2", _vec(0.0, 1.0))
    _pending(sync_db, lec, prof, "q3", _vec(0.0, 0.0, 1.0))
    _pending(sync_db, lec, prof, "q4", _vec(0.0, 0.0, 0.0, 1.0))
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch.process_qa_avatar_batch(sync_db, loop)
    finally:
        loop.close()

    assert result["submitted"] == 2
    ready = sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.status == qa_avatar.STATUS_READY
    ).count()
    pending = sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.status == qa_avatar.STATUS_PENDING
    ).count()
    assert ready == 2 and pending == 2


def test_qa_render_budget_quota(sync_db):
    from app.services.pipeline import budget
    from app.services.pipeline.budget import QARenderQuotaError

    prof, _c, lec = _seed_lecture(sync_db)
    # 한도 1: 첫 렌더는 통과, 한 건 제출 후 차단.
    import app.core.config as cfg
    orig = cfg.settings.QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR
    cfg.settings.QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR = 1
    try:
        budget.assert_qa_render_budget(sync_db, prof.id)  # 통과
        # 렌더 1건 생성(heygen_job_id 보유) → 한도 소진.
        r = QAAnswerCache(
            lecture_id=lec.id, instructor_id=prof.id, question_text="q",
            status=qa_avatar.STATUS_RENDERING, heygen_job_id="job-1",
        )
        sync_db.add(r)
        sync_db.flush()
        with pytest.raises(QARenderQuotaError):
            budget.assert_qa_render_budget(sync_db, prof.id)
    finally:
        cfg.settings.QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR = orig
