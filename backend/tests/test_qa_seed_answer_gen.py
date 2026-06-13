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
from app.services.pipeline.retriever import RetrievalResult
from tests.conftest import _patch_jsonb_columns, make_auth_header


# ── generate_seed_answer 단위 ─────────────────────────────────────────────────


def test_seed_system_prompt_forbids_chinese_parenthesis():
    # 교수자 요청: 중국어/한자 용어 괄호 병기 금지가 프롬프트에 명시돼야 한다.
    p = qa_mod._seed_answer_system_prompt("한국어")
    assert "괄호" in p
    assert "大学生" in p  # 예시로 규칙을 못박았는지


def test_seed_answer_prompt_uses_lecture_language():
    # 답변은 강의 발화 언어로 작성하도록 프롬프트에 언어명이 박혀야 한다(영어 강의→English).
    assert "English" in qa_mod._seed_answer_system_prompt("English")
    assert "Chinese" in qa_mod._seed_answer_system_prompt("Chinese (Simplified)")


def test_generate_seed_answer_no_slides_no_scripts(monkeypatch):
    # 슬라이드 임베딩도 없고 스크립트 폴백도 비면 생성 불가(in_scope=False).
    monkeypatch.setattr(qa_mod, "search_similar_slides", lambda db, t, q, top_k=3: [])
    monkeypatch.setattr(qa_mod, "_script_context_for_task", lambda db, t: "")
    monkeypatch.setattr(qa_mod, "_claude_seed_call", lambda *a, **k: pytest.fail("Claude 호출됨"))

    answer, in_scope = qa_mod.generate_seed_answer(None, "task-1", "질문")
    assert answer == ""
    assert in_scope is False


def test_generate_seed_answer_falls_back_to_scripts(monkeypatch):
    # ★ 핵심: 슬라이드 임베딩이 비어도 생성된 스크립트가 있으면 그걸로 답변 생성.
    monkeypatch.setattr(qa_mod, "search_similar_slides", lambda db, t, q, top_k=3: [])
    monkeypatch.setattr(
        qa_mod, "_script_context_for_task", lambda db, t: "### 슬라이드 1\n어순 차이 설명..."
    )
    monkeypatch.setattr("anthropic.Anthropic", lambda **k: object())
    fake = types.SimpleNamespace(
        content=[types.SimpleNamespace(type="text", text="한국어와 중국어는 어순이 다릅니다.")]
    )
    captured = {}

    def _call(client, system, content):
        captured["system"] = system
        captured["content"] = content
        return fake

    monkeypatch.setattr(qa_mod, "_claude_seed_call", _call)

    answer, in_scope = qa_mod.generate_seed_answer(
        None, "task-1", "어순 차이는 왜 생기나요?", lang="en"
    )
    assert in_scope is True
    assert answer == "한국어와 중국어는 어순이 다릅니다."
    # 스크립트 컨텍스트가 프롬프트에 실렸는지.
    assert "어순 차이 설명" in captured["content"]
    # 답변 언어가 강의 발화 언어(en→English)로 시스템 프롬프트에 박혔는지.
    assert "English" in captured["system"]


def test_generate_seed_answer_low_similarity_still_generates(monkeypatch):
    # ★ 핵심 회귀: 유사도가 0.7 미만(학생 게이트라면 거부)이라도 슬라이드가 있으면
    #    교수자 사전 답변은 생성돼야 한다(스코프 게이트 제거).
    # 스크립트가 아직 없을 때(생성 전) 슬라이드 임베딩으로 폴백하는 경로를 검증한다 —
    # 스크립트 컨텍스트를 비워 슬라이드 검색 폴백을 타게 한다.
    low = RetrievalResult(slide_number=1, text_content="문법 차이", similarity=0.55)
    monkeypatch.setattr(qa_mod, "_script_context_for_task", lambda db, t: "")
    monkeypatch.setattr(qa_mod, "search_similar_slides", lambda db, t, q, top_k=3: [low])
    monkeypatch.setattr(qa_mod, "_build_context", lambda results: "슬라이드 내용")
    monkeypatch.setattr("anthropic.Anthropic", lambda **k: object())

    fake = types.SimpleNamespace(
        content=[types.SimpleNamespace(type="text", text="  大学生은 대학에 다니는 학생입니다.  ")]
    )
    monkeypatch.setattr(qa_mod, "_claude_seed_call", lambda client, system, content: fake)

    answer, in_scope = qa_mod.generate_seed_answer(None, "task-1", "어순 차이는 왜 생기나요?")
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
