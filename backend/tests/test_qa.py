"""Q&A API 통합 테스트."""
import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest

from tests.conftest import make_auth_header


# ── 테스트 헬퍼 ───────────────────────────────────────────────────────────────

def _patch_qa_sync_session(pipeline_task_id: str | None = "task-test-001"):
    """app.api.v1.qa.SyncSessionLocal()을 mock해 lecture 조회/QALog INSERT를 우회."""
    mock_lecture = MagicMock()
    mock_lecture.pipeline_task_id = pipeline_task_id

    mock_db = MagicMock()
    mock_db.execute.return_value.scalar_one_or_none.return_value = mock_lecture

    @contextmanager
    def _factory():
        yield mock_db

    return patch("app.api.v1.qa.SyncSessionLocal", _factory)


def _build_mock_qa_result(answer: str, in_scope: bool, cost_usd: float):
    """answer_question() 반환값 mock — qa.py의 후속 직렬화/QALog INSERT가 통과하도록 필드 채움."""
    return MagicMock(
        answer=answer,
        in_scope=in_scope,
        cost_usd=cost_usd,
        top_slides=[],
        input_tokens=0,
        output_tokens=0,
    )


# ── Q&A 질문 ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ask_question_success(client, student, lecture):
    mock_result = _build_mock_qa_result("파이썬은 인터프리터 언어입니다.", True, 0.003)

    with patch("app.api.v1.qa.answer_question", return_value=mock_result), \
         _patch_qa_sync_session():
        resp = await client.post(
            "/api/v1/qa",
            json={
                "session_id": str(uuid.uuid4()),
                "lecture_id": str(lecture.id),
                "question": "파이썬이란 무엇인가요?",
            },
            headers=make_auth_header(student),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["answer"] == "파이썬은 인터프리터 언어입니다."
    assert data["in_scope"] is True
    assert data["cost_usd"] == 0.003


@pytest.mark.asyncio
async def test_ask_question_out_of_scope(client, student, lecture):
    mock_result = _build_mock_qa_result("강의 범위 밖의 질문입니다.", False, 0.001)

    with patch("app.api.v1.qa.answer_question", return_value=mock_result), \
         _patch_qa_sync_session():
        resp = await client.post(
            "/api/v1/qa",
            json={
                "session_id": str(uuid.uuid4()),
                "lecture_id": str(lecture.id),
                "question": "오늘 날씨가 어때요?",
            },
            headers=make_auth_header(student),
        )
    assert resp.status_code == 200
    assert resp.json()["in_scope"] is False


@pytest.mark.asyncio
async def test_ask_question_professor_forbidden(client, professor, lecture):
    resp = await client.post(
        "/api/v1/qa",
        json={
            "session_id": str(uuid.uuid4()),
            "lecture_id": str(lecture.id),
            "question": "테스트",
        },
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_ask_question_service_error(client, student, lecture):
    with patch("app.api.v1.qa.answer_question", side_effect=Exception("API error")), \
         _patch_qa_sync_session():
        resp = await client.post(
            "/api/v1/qa",
            json={
                "session_id": str(uuid.uuid4()),
                "lecture_id": str(lecture.id),
                "question": "에러 테스트",
            },
            headers=make_auth_header(student),
        )
    assert resp.status_code == 500


@pytest.mark.asyncio
async def test_ask_question_missing_fields(client, student):
    resp = await client.post(
        "/api/v1/qa",
        json={"question": "필드 누락 테스트"},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 422
