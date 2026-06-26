"""Q&A 아바타 렌더 비용 기록 테스트 (운영자 비용 대시보드 과소집계 해소).

qa_batch._record_qa_render_cost 는 완료된 QA 렌더(HeyGen/VisionStory) 비용을
platform_cost_logs(CostLog, category=AVATAR_QA)에 별도 세션으로 적재한다. QA 렌더는
VideoRender 가 없어 render_cost_logs 에 못 들어가므로 이 경로로만 회계에 잡힌다.
"""
from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.base import Base
from app.models.cost_log import CostCategory, CostLog
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.user import User, UserRole
from tests.conftest import _patch_jsonb_columns


@pytest.fixture
def sync_factory(monkeypatch):
    """qa_batch.SyncSessionLocal 을 인메모리 SQLite 세션 팩토리로 교체."""
    _patch_jsonb_columns()
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    from app.tasks import qa_batch

    monkeypatch.setattr(qa_batch, "SyncSessionLocal", Session)
    try:
        yield Session
    finally:
        engine.dispose()


def _lecture(db) -> uuid.UUID:
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
        slug=f"slug-{uuid.uuid4().hex}", order=1,
    )
    db.add(lec)
    db.commit()
    return lec.id


def test_records_heygen_qa_cost(sync_factory, monkeypatch):
    from app.tasks import qa_batch

    monkeypatch.setattr(settings, "HEYGEN_COST_USD_PER_SECOND", 0.01)
    s = sync_factory()
    lec_id = _lecture(s)
    rep = SimpleNamespace(id=uuid.uuid4(), lecture_id=lec_id, cluster_key="ck1")

    qa_batch._record_qa_render_cost(rep, is_vs=False, duration=60, mock=False)

    rows = s.execute(select(CostLog).where(CostLog.lecture_id == lec_id)).scalars().all()
    assert len(rows) == 1
    assert rows[0].category == CostCategory.avatar_qa
    assert rows[0].model == "heygen"
    assert rows[0].cost_usd == pytest.approx(0.6)  # 60s × 0.01
    s.close()


def test_records_visionstory_qa_cost(sync_factory, monkeypatch):
    from app.tasks import qa_batch

    monkeypatch.setattr(settings, "VISIONSTORY_COST_USD_PER_SECOND", 0.02)
    s = sync_factory()
    lec_id = _lecture(s)
    rep = SimpleNamespace(id=uuid.uuid4(), lecture_id=lec_id, cluster_key=None)

    qa_batch._record_qa_render_cost(rep, is_vs=True, duration=30, mock=False)

    row = s.execute(select(CostLog).where(CostLog.lecture_id == lec_id)).scalars().one()
    assert row.model == "visionstory"
    assert row.cost_usd == pytest.approx(0.6)  # 30s × 0.02
    s.close()


def test_mock_records_nothing(sync_factory):
    from app.tasks import qa_batch

    s = sync_factory()
    lec_id = _lecture(s)
    rep = SimpleNamespace(id=uuid.uuid4(), lecture_id=lec_id, cluster_key="ck")

    qa_batch._record_qa_render_cost(rep, is_vs=False, duration=60, mock=True)

    rows = s.execute(select(CostLog).where(CostLog.lecture_id == lec_id)).scalars().all()
    assert rows == []
    s.close()


def test_no_lecture_id_records_nothing(sync_factory):
    from app.tasks import qa_batch

    s = sync_factory()
    rep = SimpleNamespace(id=uuid.uuid4(), lecture_id=None, cluster_key="ck")
    # lecture_id 없으면 조용히 skip(예외 없음).
    qa_batch._record_qa_render_cost(rep, is_vs=False, duration=60, mock=False)
    assert s.execute(select(CostLog)).scalars().all() == []
    s.close()


def test_visionstory_none_duration_uses_answer_length_fallback(sync_factory, monkeypatch):
    """H1: VisionStory 상태 응답엔 duration 이 없어(None) 종전엔 본인 얼굴 렌더가 전부
    $0 으로 기록됐다. 답변 길이로 렌더 길이를 추정해 0 이 아닌 비용을 적재해야 한다."""
    from app.tasks import qa_batch

    monkeypatch.setattr(settings, "VISIONSTORY_COST_USD_PER_SECOND", 0.02)
    monkeypatch.setattr(settings, "QA_AVATAR_VOICE_SPEED", 1.0)
    monkeypatch.setattr(settings, "QA_AVATAR_MAX_ANSWER_CHARS", 400)
    s = sync_factory()
    lec_id = _lecture(s)
    # 100자 답변 → 100 / (5자/초 × 1.0배속) = 20초 → 20 × 0.02 = $0.40 (종전 $0)
    rep = SimpleNamespace(
        id=uuid.uuid4(), lecture_id=lec_id, cluster_key=None, answer_text="가" * 100,
    )
    qa_batch._record_qa_render_cost(rep, is_vs=True, duration=None, mock=False)

    row = s.execute(select(CostLog).where(CostLog.lecture_id == lec_id)).scalars().one()
    assert row.model == "visionstory"
    assert row.cost_usd == pytest.approx(0.4)
    assert row.cost_usd > 0  # 핵심: 더 이상 $0 으로 과소집계되지 않는다.
    s.close()


def test_estimate_qa_render_seconds_from_answer_length(monkeypatch):
    from app.tasks import qa_batch

    monkeypatch.setattr(settings, "QA_AVATAR_VOICE_SPEED", 1.0)
    monkeypatch.setattr(settings, "QA_AVATAR_MAX_ANSWER_CHARS", 400)
    rep = SimpleNamespace(answer_text="나" * 50)  # 50 / (5×1.0) = 10초
    assert qa_batch._estimate_qa_render_seconds(rep) == pytest.approx(10.0)
    # 렌더는 400자 상한으로 잘리므로 추정도 상한을 넘지 않는다.
    rep_long = SimpleNamespace(answer_text="다" * 1000)
    assert qa_batch._estimate_qa_render_seconds(rep_long) == pytest.approx(80.0)  # 400/(5×1)
    # 빈 답변도 최소 1초(0 방지).
    assert qa_batch._estimate_qa_render_seconds(SimpleNamespace(answer_text="")) == 1.0
