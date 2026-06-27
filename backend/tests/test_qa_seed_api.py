"""교수자 Q&A 사전 질문 API 통합 테스트 (창3).

검증:
- PUT 저장 → GET 조회 라운드트립.
- 질문 4개 이상 → 422 (Pydantic max_length=3).
- 비소유 강의 → 404 (assert_professor_owns_lecture).
- 영상 승인 시 render_seed_questions enqueue(celery.send_task) 호출.

async/sync 브리지: 엔드포인트는 소유권만 async 세션으로 보고, seed 작업은 동기
SyncSessionLocal 로 실행한다. 테스트는 별도 동기 SQLite 엔진(StaticPool — executor
스레드 안전)을 만들어 app.api.v1.lectures.SyncSessionLocal 을 패치한다.
"""
import uuid
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.user import User, UserRole
from tests.conftest import _patch_jsonb_columns, make_auth_header


@pytest.fixture
def seed_sync_session(monkeypatch):
    """동기 seed 작업용 SQLite 엔진을 만들어 lectures.SyncSessionLocal 을 패치.

    StaticPool + check_same_thread=False 로 단일 연결을 공유해, run_in_executor
    워커 스레드에서도 안전하고 PUT→GET 사이 데이터가 유지된다(라운드트립).
    """
    _patch_jsonb_columns()
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    monkeypatch.setattr("app.api.v1.lectures.SyncSessionLocal", SessionLocal)
    yield SessionLocal
    engine.dispose()


# ── PUT 저장 / GET 조회 라운드트립 ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_put_then_get_roundtrip(client, professor, lecture, seed_sync_session):
    url = f"/api/lectures/{lecture.id}/seed-questions"

    put = await client.put(
        url,
        json={"questions": [
            {"question": "파이썬이란?", "answer": "프로그래밍 언어입니다."},
            {"question": "변수란 무엇인가?"},  # answer 생략 → 빈 답변(RAG 폴백)
            {"question": "함수의 정의는?", "answer": ""},
        ]},
        headers=make_auth_header(professor),
    )
    assert put.status_code == 200
    data = put.json()
    assert data["max"] == 3
    assert data["used_this_month"] == 0
    assert data["remaining"] >= 0
    assert len(data["questions"]) == 3
    by_q = {q["question"]: q for q in data["questions"]}
    assert set(by_q) == {"파이썬이란?", "변수란 무엇인가?", "함수의 정의는?"}
    # 교수자 답변은 그대로, 생략/빈 답변은 ""(영상 생성 시 RAG 자동 생성).
    assert by_q["파이썬이란?"]["answer"] == "프로그래밍 언어입니다."
    assert by_q["변수란 무엇인가?"]["answer"] == ""
    # 새로 등록한 질문은 아직 렌더 전 — pending · 클립/미리보기 없음.
    assert all(q["status"] == "pending" for q in data["questions"])
    assert all(q["has_clip"] is False for q in data["questions"])
    assert all(q["preview_url"] is None for q in data["questions"])

    get = await client.get(url, headers=make_auth_header(professor))
    assert get.status_code == 200
    got = get.json()
    assert {q["question"] for q in got["questions"]} == {
        "파이썬이란?", "변수란 무엇인가?", "함수의 정의는?",
    }


@pytest.mark.asyncio
async def test_put_replaces_set(client, professor, lecture, seed_sync_session):
    """PUT 은 차집합 동기화 — 빈 목록을 보내면 전부 삭제된다."""
    url = f"/api/lectures/{lecture.id}/seed-questions"
    await client.put(
        url,
        json={"questions": [{"question": "q1"}, {"question": "q2"}]},
        headers=make_auth_header(professor),
    )
    cleared = await client.put(
        url, json={"questions": []}, headers=make_auth_header(professor)
    )
    assert cleared.status_code == 200
    assert cleared.json()["questions"] == []


# ── 상한 422 ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_put_rejects_more_than_three(client, professor, lecture, seed_sync_session):
    """질문 4개 → Pydantic max_length=3 위반 → 422."""
    resp = await client.put(
        f"/api/lectures/{lecture.id}/seed-questions",
        json={"questions": [
            {"question": "q1"}, {"question": "q2"},
            {"question": "q3"}, {"question": "q4"},
        ]},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 422


# ── 소유권 404 ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_non_owner_404(client, db, lecture, seed_sync_session):
    other = User(
        id=uuid.uuid4(),
        google_sub="g-other-prof",
        email="other-prof@t.ac.kr",
        name="다른 교수",
        role=UserRole.professor,
        is_active=True,
    )
    db.add(other)
    await db.flush()

    resp = await client.get(
        f"/api/lectures/{lecture.id}/seed-questions",
        headers=make_auth_header(other),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_put_non_owner_404(client, db, lecture, seed_sync_session):
    other = User(
        id=uuid.uuid4(),
        google_sub="g-other-prof-2",
        email="other-prof-2@t.ac.kr",
        name="다른 교수2",
        role=UserRole.professor,
        is_active=True,
    )
    db.add(other)
    await db.flush()

    resp = await client.put(
        f"/api/lectures/{lecture.id}/seed-questions",
        json={"questions": [{"question": "몰래 등록"}]},
        headers=make_auth_header(other),
    )
    assert resp.status_code == 404


# ── 영상 승인 시 render_seed_questions enqueue ────────────────────────────────


@pytest.mark.asyncio
async def test_approve_enqueues_render_seed_questions(
    client, professor, lecture, video_pending
):
    """approve 는 render_slide enqueue 직후 render_seed_questions 를 send_task 로 부른다.

    브로커 호출 없이 enqueue 여부만 검증 — render_slide 와 celery.send_task 를 모킹.
    """
    lecture_id = str(lecture.id)
    prof_id = str(professor.id)

    with patch("app.tasks.render.render_slide"), \
         patch("app.services.video.celery.send_task") as mock_send:
        resp = await client.post(
            f"/api/videos/{video_pending.id}/approve",
            headers=make_auth_header(professor),
        )

    assert resp.status_code == 200
    mock_send.assert_called_once_with(
        "app.tasks.qa_batch.render_seed_questions",
        args=[lecture_id, prof_id],
    )


# ── force 강제 재생성 ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_force_render_resets_ready_clips_before_enqueue(
    client, professor, lecture, db, seed_sync_session
):
    """force=true 면 render enqueue 전에 ready 클립을 pending 으로 되돌린다(강제 재생성).

    아바타를 같은 값으로 다시 골라 '다시 제작'이 변경을 못 잡을 때, 현재 아바타/음성
    으로 답변 영상을 강제로 다시 만드는 경로(2026-06-16 사용자 결정).
    """
    from app.models.qa_answer_cache import QAAnswerCache
    from app.services.pipeline import qa_avatar

    lecture.pipeline_task_id = "task-1"  # 엔드포인트 통과 조건
    row = QAAnswerCache(
        lecture_id=lecture.id, instructor_id=professor.id,
        question_text="질문", answer_text="답변",
        status=qa_avatar.STATUS_READY, heygen_job_id="job-old",
        s3_video_url="https://s3/old.mp4", origin=qa_avatar.ORIGIN_SEED,
    )
    db.add(row)
    await db.flush()

    with patch("app.celery_app.celery.send_task") as mock_send:
        resp = await client.post(
            f"/api/lectures/{lecture.id}/seed-questions/render?force=true",
            headers=make_auth_header(professor),
        )

    assert resp.status_code == 200
    mock_send.assert_called_once()  # 렌더 태스크는 그대로 enqueue
    await db.refresh(row)
    assert row.status == qa_avatar.STATUS_PENDING  # ready → pending 강제 리셋
    assert row.heygen_job_id is None
    assert row.s3_video_url is None


@pytest.mark.asyncio
async def test_render_without_force_keeps_ready_clips(
    client, professor, lecture, db, seed_sync_session
):
    """force 없이는 ready 클립을 건드리지 않는다(기존 동작 — 변경분만 렌더 태스크가 판단)."""
    from app.models.qa_answer_cache import QAAnswerCache
    from app.services.pipeline import qa_avatar

    lecture.pipeline_task_id = "task-1"
    row = QAAnswerCache(
        lecture_id=lecture.id, instructor_id=professor.id,
        question_text="질문", answer_text="답변",
        status=qa_avatar.STATUS_READY, heygen_job_id="job-keep",
        s3_video_url="https://s3/keep.mp4", origin=qa_avatar.ORIGIN_SEED,
    )
    db.add(row)
    await db.flush()

    with patch("app.celery_app.celery.send_task") as mock_send:
        resp = await client.post(
            f"/api/lectures/{lecture.id}/seed-questions/render",
            headers=make_auth_header(professor),
        )

    assert resp.status_code == 200
    mock_send.assert_called_once()
    await db.refresh(row)
    assert row.status == qa_avatar.STATUS_READY  # 강제 아니므로 보존
    assert row.heygen_job_id == "job-keep"
