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
        is_published=True,  # 한도는 '배포된 강의' 단위 — 기본 배포 상태로 생성.
    )
    db.add(lec)
    db.flush()
    return prof, course, lec


def _another_lecture(db, course, *, published: bool = True, order: int = 2) -> Lecture:
    """같은 강좌에 강의를 하나 더 생성(월 강의 한도 테스트용)."""
    lec = Lecture(
        id=uuid.uuid4(), course_id=course.id, title=f"강의{order}",
        slug=f"slug-{uuid.uuid4().hex}", order=order, pipeline_task_id=f"task-{order}",
        is_published=published,
    )
    db.add(lec)
    db.flush()
    return lec


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
    # 투명성(09 §5.2) — 캐시 클립이 맞춰진 원 질문을 payload 로 함께 내려준다.
    assert res.payload["matched_question"] == "환율이란?"
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
    # 두 질문은 같은 클러스터로 묶임(반환 행은 쓰지 않고 DB 적립만 필요).
    _pending(sync_db, lec, prof, "환율이란?", _vec(1.0, 0.0))
    _pending(sync_db, lec, prof, "환율 뜻", _vec(0.99, 0.01))
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


def test_batch_uses_talking_photo_for_self_avatar(sync_db, monkeypatch):
    """강의에 본인 아바타(talking_photo)를 적용하면 avatar_id 가 아니라 talking_photo_id 로 렌더."""
    from app.tasks import qa_batch

    monkeypatch.setattr(settings, "HEYGEN_MOCK", True)
    monkeypatch.setattr(settings, "QA_AVATAR_TOP_CLUSTERS", 3)
    monkeypatch.setattr(settings, "QA_AVATAR_MIN_CLUSTER_SIZE", 1)
    monkeypatch.setattr(settings, "QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR", 6)

    prof, _c, lec = _seed_lecture(sync_db)
    prof.photo_avatar_id = "tp-self-123"  # 본인 아바타 등록됨.
    lec.avatar_id = "tp-self-123"  # 강의에 본인 아바타를 적용 → 본인 얼굴로 판정.
    sync_db.flush()
    _pending(sync_db, lec, prof, "환율이란?", _vec(1.0, 0.0))
    sync_db.commit()

    captured: dict = {}

    async def _fake_create_video(**kwargs):
        captured.update(kwargs)
        return "mock_job_self"

    monkeypatch.setattr("app.services.pipeline.heygen.create_video", _fake_create_video)

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch.process_qa_avatar_batch(sync_db, loop)
    finally:
        loop.close()

    assert result["submitted"] == 1
    assert captured.get("talking_photo_id") == "tp-self-123"
    assert "avatar_id" not in captured


def test_batch_uses_avatar_id_for_standard_avatar(sync_db, monkeypatch):
    """강의에 표준 HeyGen 아바타를 지정하면(본인 룩 아님) avatar_id 경로를 쓴다."""
    from app.tasks import qa_batch

    monkeypatch.setattr(settings, "HEYGEN_MOCK", True)
    monkeypatch.setattr(settings, "QA_AVATAR_TOP_CLUSTERS", 3)
    monkeypatch.setattr(settings, "QA_AVATAR_MIN_CLUSTER_SIZE", 1)
    monkeypatch.setattr(settings, "QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR", 6)

    prof, _c, lec = _seed_lecture(sync_db)
    prof.photo_avatar_id = "tp-self-123"          # 본인 아바타도 있지만
    lec.avatar_id = "heygen-standard-xyz"          # 강의는 표준 아바타를 명시 지정
    sync_db.flush()
    _pending(sync_db, lec, prof, "환율이란?", _vec(1.0, 0.0))
    sync_db.commit()

    captured: dict = {}

    async def _fake_create_video(**kwargs):
        captured.update(kwargs)
        return "mock_job_std"

    monkeypatch.setattr("app.services.pipeline.heygen.create_video", _fake_create_video)

    loop = asyncio.new_event_loop()
    try:
        qa_batch.process_qa_avatar_batch(sync_db, loop)
    finally:
        loop.close()

    assert captured.get("avatar_id") == "heygen-standard-xyz"
    assert "talking_photo_id" not in captured


def test_batch_uses_visionstory_for_own_face_avatar(sync_db, monkeypatch):
    """강의에 본인 룩을 적용 + VisionStory 가능 → HeyGen 이 아니라 VisionStory 로 렌더.

    본인/타인은 강의에 적용한 avatar_id 로 판정한다(전역 옵트인 아님). job id 가
    'visionstory:' 접두를 받고, HeyGen create_video 는 호출되지 않는다.
    """
    from app.tasks import qa_batch

    monkeypatch.setattr(settings, "HEYGEN_MOCK", True)
    monkeypatch.setattr(settings, "VISIONSTORY_MOCK", True)  # VisionStory 사용 가능 + 외부호출 0
    monkeypatch.setattr(settings, "QA_AVATAR_TOP_CLUSTERS", 3)
    monkeypatch.setattr(settings, "QA_AVATAR_MIN_CLUSTER_SIZE", 1)
    monkeypatch.setattr(settings, "QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR", 6)

    # 본인 얼굴 이미지 로드는 S3 의존이라 테스트에선 직접 바이트를 돌려준다.
    monkeypatch.setattr(qa_batch, "_own_face_image", lambda *a, **k: (b"IMG", "image/png"))

    # HeyGen 경로가 절대 안 쓰이는지 확인용 — 호출되면 실패.
    async def _boom_create_video(**_k):
        raise AssertionError("VisionStory 경로여야 하는데 HeyGen create_video 가 호출됨")

    monkeypatch.setattr("app.services.pipeline.heygen.create_video", _boom_create_video)

    prof, _c, lec = _seed_lecture(sync_db)
    prof.photo_avatar_default_look_id = "look-x"
    lec.avatar_id = "look-x"  # 강의에 본인 룩을 적용 → 본인 얼굴(VisionStory)로 판정.
    sync_db.flush()
    _pending(sync_db, lec, prof, "환율이란?", _vec(1.0, 0.0))
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch.process_qa_avatar_batch(sync_db, loop)
    finally:
        loop.close()

    assert result["submitted"] == 1
    rep = sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.heygen_job_id.isnot(None)
    ).first()
    assert rep is not None
    assert rep.heygen_job_id.startswith("visionstory:")


def test_batch_standard_avatar_not_overridden_by_own_face(sync_db, monkeypatch):
    """타인(표준) 아바타를 적용하면, 본인 룩·VisionStory 가 있어도 Q&A 가 본인 얼굴로 섞이지 않는다.

    2026-06-15 사용자 보고 회귀 방지: 이전엔 _submit_cluster 가 전역 qa_use_own_face 로만
    본인 얼굴을 결정해, 타인 아바타를 골라도 Q&A 가 본인 얼굴로 나갔다. 이제 강의에
    적용한 avatar_id 로 판정한다 → 표준 avatar_id 로 HeyGen 렌더(visionstory·talking_photo 아님).
    """
    from app.tasks import qa_batch

    monkeypatch.setattr(settings, "HEYGEN_MOCK", True)
    monkeypatch.setattr(settings, "VISIONSTORY_MOCK", True)  # VisionStory 사용 가능해도
    monkeypatch.setattr(settings, "QA_AVATAR_TOP_CLUSTERS", 3)
    monkeypatch.setattr(settings, "QA_AVATAR_MIN_CLUSTER_SIZE", 1)
    monkeypatch.setattr(settings, "QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR", 6)
    monkeypatch.setattr(qa_batch, "_own_face_image", lambda *a, **k: (b"IMG", "image/png"))

    prof, _c, lec = _seed_lecture(sync_db)
    prof.qa_use_own_face = True  # (구) 전역 옵트인이 켜져 있어도 무시되어야 한다.
    prof.photo_avatar_default_look_id = "look-x"
    prof.photo_avatar_id = "tp-self"
    lec.avatar_id = "heygen-standard-xyz"  # 강의엔 타인(표준) 아바타 적용.
    sync_db.flush()
    _pending(sync_db, lec, prof, "환율이란?", _vec(1.0, 0.0))
    sync_db.commit()

    captured: dict = {}

    async def _fake_create_video(**kwargs):
        captured.update(kwargs)
        return "mock_job_std"

    monkeypatch.setattr("app.services.pipeline.heygen.create_video", _fake_create_video)

    loop = asyncio.new_event_loop()
    try:
        qa_batch.process_qa_avatar_batch(sync_db, loop)
    finally:
        loop.close()

    assert captured.get("avatar_id") == "heygen-standard-xyz"
    assert "talking_photo_id" not in captured
    rep = sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.heygen_job_id.isnot(None)
    ).first()
    assert rep is not None and not rep.heygen_job_id.startswith("visionstory:")


def test_batch_respects_monthly_lecture_cap(sync_db, monkeypatch):
    """교수자 월 한도는 '배포된 강의' 단위(09 §5 개정 2026-06-14).

    cap=2 면 배포 강의 2개까지만 Q&A 렌더하고 3번째 강의는 건너뛴다(클립 수 무관).
    """
    from app.tasks import qa_batch

    monkeypatch.setattr(settings, "HEYGEN_MOCK", True)
    monkeypatch.setattr(settings, "QA_AVATAR_TOP_CLUSTERS", 3)
    monkeypatch.setattr(settings, "QA_AVATAR_MIN_CLUSTER_SIZE", 1)
    monkeypatch.setattr(settings, "QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR", 2)

    prof, course, lec1 = _seed_lecture(sync_db)
    lec2 = _another_lecture(sync_db, course, order=2)
    lec3 = _another_lecture(sync_db, course, order=3)
    # 같은 교수자의 배포된 강의 3개, 각 1개 질문 → 한도 2 라 강의 2개만 렌더.
    _pending(sync_db, lec1, prof, "q1", _vec(1.0, 0.0))
    _pending(sync_db, lec2, prof, "q2", _vec(0.0, 1.0))
    _pending(sync_db, lec3, prof, "q3", _vec(0.0, 0.0, 1.0))
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        result = qa_batch.process_qa_avatar_batch(sync_db, loop)
    finally:
        loop.close()

    # 배포 강의 2개만 렌더, 3번째 강의 질문은 pending 유지.
    assert result["submitted"] == 2
    distinct_rendered = {
        r.lecture_id
        for r in sync_db.query(QAAnswerCache)
        .filter(QAAnswerCache.heygen_job_id.isnot(None))
        .all()
    }
    assert len(distinct_rendered) == 2
    pending = sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.status == qa_avatar.STATUS_PENDING
    ).count()
    assert pending == 1


def test_unpublished_render_does_not_consume_quota(sync_db):
    """미배포 강의 렌더는 월 강의 사용량(used_this_month)을 올리지 않는다.

    제작 중 강의를 디버깅하며 여러 번 렌더해도, 실제 배포 전까지는 한도를 소모하지
    않는다(실제 배포한 강의만 카운트). 또한 한 강의에 클립이 여러 개여도 강의는 1로
    센다. 배포 즉시 그 강의가 사용량에 잡힌다.
    """
    from app.services.pipeline import budget

    prof, _course, lec = _seed_lecture(sync_db)
    lec.is_published = False  # 제작 중으로 되돌림
    sync_db.flush()
    # 이 강의에 렌더(클립) 2건 제출됨.
    for i in range(2):
        sync_db.add(QAAnswerCache(
            lecture_id=lec.id, instructor_id=prof.id, question_text=f"q{i}",
            status=qa_avatar.STATUS_RENDERING, heygen_job_id=f"job-{i}",
        ))
    sync_db.flush()
    # 미배포 → 사용량 0.
    assert budget.qa_renders_used_this_month(sync_db, prof.id) == 0

    # 배포하면 그 강의가 1로 잡힌다(클립 2개여도 강의는 1).
    lec.is_published = True
    sync_db.flush()
    assert budget.qa_renders_used_this_month(sync_db, prof.id) == 1


def test_batch_caps_renders_per_lecture_across_nights(sync_db, monkeypatch):
    """영상당 렌더 한도(09 §5: 영상당 3렌더)는 여러 밤 배치 누적분까지 합산해 강제된다.

    교수자 월 한도(6)는 넉넉하지만, 한 영상이 밤마다 클러스터를 쌓아 3을 넘기지
    못하게 한다. 6개 비유사 질문(=6 클러스터) 중 1차 배치는 3개만 렌더하고, 남은
    3개가 pending 으로 남아도 2차 배치는 그 영상에 0개만 추가한다.
    """
    from app.tasks import qa_batch

    monkeypatch.setattr(settings, "HEYGEN_MOCK", True)
    monkeypatch.setattr(settings, "QA_AVATAR_TOP_CLUSTERS", 3)
    monkeypatch.setattr(settings, "QA_AVATAR_MIN_CLUSTER_SIZE", 1)
    monkeypatch.setattr(settings, "QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR", 6)

    prof, _c, lec = _seed_lecture(sync_db)
    # 서로 비유사한 6개 질문 → 6개 단독 클러스터(같은 영상).
    for i in range(6):
        head = [0.0] * 6
        head[i] = 1.0
        _pending(sync_db, lec, prof, f"q{i}", _vec(*head))
    sync_db.commit()

    loop = asyncio.new_event_loop()
    try:
        first = qa_batch.process_qa_avatar_batch(sync_db, loop)
        # 1차에서 3개 렌더·완료 → 남은 3개는 그대로 pending.
        assert first["submitted"] == 3
        # 2차 배치 — 영상 한도(3) 소진이라 추가 제출 0.
        second = qa_batch.process_qa_avatar_batch(sync_db, loop)
    finally:
        loop.close()

    assert second["submitted"] == 0
    # 이 영상에 실제 제출된 렌더(heygen_job_id 보유)는 정확히 3건.
    rendered = sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.lecture_id == lec.id,
        QAAnswerCache.heygen_job_id.isnot(None),
    ).count()
    assert rendered == 3
    # 한도 때문에 렌더되지 못한 질문은 pending 으로 남아 다음 달/한도 회복을 기다린다.
    pending = sync_db.query(QAAnswerCache).filter(
        QAAnswerCache.status == qa_avatar.STATUS_PENDING
    ).count()
    assert pending == 3


def test_qa_render_budget_quota(sync_db, monkeypatch):
    from app.services.pipeline import budget
    from app.services.pipeline.budget import QARenderQuotaError

    prof, course, lec = _seed_lecture(sync_db)  # 배포된 강의
    # 한도 1(배포 강의 1개): 첫 강의는 통과, 두 번째 새 강의는 차단.
    monkeypatch.setattr(settings, "QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR", 1)

    budget.assert_qa_render_budget(sync_db, prof.id, lec.id)  # 통과(used=0)
    # lec 에 렌더 1건(heygen_job_id) → 배포 강의 1개 사용 = 한도 소진.
    sync_db.add(QAAnswerCache(
        lecture_id=lec.id, instructor_id=prof.id, question_text="q",
        status=qa_avatar.STATUS_RENDERING, heygen_job_id="job-1",
    ))
    sync_db.flush()
    # 같은 강의는 이미 한도 집합에 포함 → 추가 렌더(클립) 허용(새 슬롯 아님).
    budget.assert_qa_render_budget(sync_db, prof.id, lec.id)
    # 새(다른) 배포 강의는 한도 초과로 차단.
    lec2 = _another_lecture(sync_db, course)
    with pytest.raises(QARenderQuotaError):
        budget.assert_qa_render_budget(sync_db, prof.id, lec2.id)


def test_qa_unlimited_account_bypasses_quota(sync_db, monkeypatch):
    """무제한 화이트리스트 계정(테스트 계정·계정주)은 강의 한도를 면제받는다."""
    from app.services.pipeline import budget

    monkeypatch.setattr(settings, "QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR", 1)
    monkeypatch.setattr(settings, "QA_AVATAR_UNLIMITED_EMAILS", "VIP@x.com , other@x.com")

    prof, course, lec = _seed_lecture(sync_db)
    prof.email = "vip@x.com"  # 대소문자 무시 매칭
    sync_db.flush()
    assert budget.instructor_has_unlimited_qa(sync_db, prof.id) is True

    # 이미 배포 강의 1개 렌더(한도 소진 상태)여도 무제한 계정은 새 강의 통과.
    sync_db.add(QAAnswerCache(
        lecture_id=lec.id, instructor_id=prof.id, question_text="q",
        status=qa_avatar.STATUS_RENDERING, heygen_job_id="job-1",
    ))
    sync_db.flush()
    lec2 = _another_lecture(sync_db, course)
    budget.assert_qa_render_budget(sync_db, prof.id, lec2.id)  # 차단 없이 통과
    assert budget.qa_render_quota_remaining(sync_db, prof.id) == budget._UNLIMITED_REMAINING
