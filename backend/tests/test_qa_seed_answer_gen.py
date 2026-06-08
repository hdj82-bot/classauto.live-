"""사전 답변 AI 생성 + 사전 아바타 렌더 트리거 테스트 (창1).

검증:
- generate_seed_answer: 범위 밖 → ("", False), 범위 안 → (생성답변, True).
- 전용 시스템 프롬프트가 중국어 괄호 병기 금지 규칙을 포함.
- POST .../seed-questions/generate-answer: 200 / 400(파이프라인 미처리) / 404(비소유).
- POST .../seed-questions/render: 200 + render_seed_questions send_task 호출 / 400.
"""
import types
import uuid
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.user import User, UserRole
from app.services.pipeline import qa as qa_mod
from tests.conftest import _patch_jsonb_columns, make_auth_header


# ── generate_seed_answer 단위 ─────────────────────────────────────────────────


def test_seed_system_prompt_forbids_chinese_parenthesis():
    # 교수자 요청: 중국어/한자 용어 괄호 병기 금지가 프롬프트에 명시돼야 한다.
    p = qa_mod.SEED_ANSWER_SYSTEM_PROMPT
    assert "괄호" in p
    assert "大学生" in p  # 예시로 규칙을 못박았는지


def test_generate_seed_answer_out_of_scope(monkeypatch):
    monkeypatch.setattr(qa_mod, "search_similar_slides", lambda db, t, q, top_k=3: [])
    monkeypatch.setattr(qa_mod, "is_in_scope", lambda results: False)
    # 범위 밖이면 Claude 를 부르지 않아야 한다.
    monkeypatch.setattr(qa_mod, "_claude_seed_call", lambda *a, **k: pytest.fail("Claude 호출됨"))

    answer, in_scope = qa_mod.generate_seed_answer(None, "task-1", "범위 밖 질문")
    assert answer == ""
    assert in_scope is False


def test_generate_seed_answer_in_scope(monkeypatch):
    monkeypatch.setattr(qa_mod, "search_similar_slides", lambda db, t, q, top_k=3: ["slide"])
    monkeypatch.setattr(qa_mod, "is_in_scope", lambda results: True)
    monkeypatch.setattr(qa_mod, "_build_context", lambda results: "슬라이드 내용")
    # Anthropic 클라이언트 생성 시 API 키 검증을 우회(네트워크 호출 없음).
    monkeypatch.setattr("anthropic.Anthropic", lambda **k: object())

    fake = types.SimpleNamespace(
        content=[types.SimpleNamespace(type="text", text="  大学生은 대학에 다니는 학생입니다.  ")]
    )
    monkeypatch.setattr(qa_mod, "_claude_seed_call", lambda client, content: fake)

    answer, in_scope = qa_mod.generate_seed_answer(None, "task-1", "大学生이 뭔가요?")
    assert in_scope is True
    assert answer == "大学生은 대학에 다니는 학생입니다."  # trim 됨


# ── 엔드포인트 ────────────────────────────────────────────────────────────────


@pytest.fixture
def seed_sync_session(monkeypatch):
    """동기 seed 작업용 SQLite 엔진 — lectures.SyncSessionLocal 패치(executor 스레드 안전)."""
    _patch_jsonb_columns()
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    monkeypatch.setattr("app.api.v1.lectures.SyncSessionLocal", SessionLocal)
    yield SessionLocal
    engine.dispose()


@pytest.mark.asyncio
async def test_generate_answer_endpoint_ok(client, db, professor, lecture, seed_sync_session):
    lecture.pipeline_task_id = "task-1"
    await db.flush()

    with patch(
        "app.services.pipeline.qa.generate_seed_answer",
        return_value=("大学生은 대학생입니다.", True),
    ):
        resp = await client.post(
            f"/api/lectures/{lecture.id}/seed-questions/generate-answer",
            json={"question": "大学生이 뭔가요?"},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["answer"] == "大学生은 대학생입니다."
    assert data["in_scope"] is True
    # 괄호 병기가 없는지(가드) — 응답엔 한자 괄호 패턴이 없어야 한다.
    assert "(" not in data["answer"]


@pytest.mark.asyncio
async def test_generate_answer_endpoint_400_without_pipeline(
    client, db, professor, lecture, seed_sync_session
):
    lecture.pipeline_task_id = None
    await db.flush()
    resp = await client.post(
        f"/api/lectures/{lecture.id}/seed-questions/generate-answer",
        json={"question": "질문"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_generate_answer_endpoint_404_non_owner(
    client, db, lecture, seed_sync_session
):
    other = User(
        id=uuid.uuid4(), google_sub="g-other-gen", email="other-gen@t.ac.kr",
        name="다른 교수", role=UserRole.professor, is_active=True,
    )
    db.add(other)
    await db.flush()
    resp = await client.post(
        f"/api/lectures/{lecture.id}/seed-questions/generate-answer",
        json={"question": "질문"},
        headers=make_auth_header(other),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_render_endpoint_enqueues_and_ok(
    client, db, professor, lecture, seed_sync_session
):
    lecture.pipeline_task_id = "task-1"
    await db.flush()
    lecture_id, prof_id = str(lecture.id), str(professor.id)

    with patch("app.celery_app.celery.send_task") as mock_send:
        resp = await client.post(
            f"/api/lectures/{lecture.id}/seed-questions/render",
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 200
    mock_send.assert_called_once_with(
        "app.tasks.qa_batch.render_seed_questions",
        args=[lecture_id, prof_id],
    )
    # 응답은 현재 사전 질문 목록(폴링 시작용).
    assert "questions" in resp.json()


@pytest.mark.asyncio
async def test_render_endpoint_400_without_pipeline(
    client, db, professor, lecture, seed_sync_session
):
    lecture.pipeline_task_id = None
    await db.flush()
    with patch("app.celery_app.celery.send_task") as mock_send:
        resp = await client.post(
            f"/api/lectures/{lecture.id}/seed-questions/render",
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 400
    mock_send.assert_not_called()
