"""Q&A API 통합 테스트."""
import uuid
from unittest.mock import patch, MagicMock

import pytest

from tests.conftest import make_auth_header


# ── Q&A 질문 ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ask_question_success(client, student):
    mock_result = MagicMock()
    mock_result.answer = "파이썬은 인터프리터 언어입니다."
    mock_result.in_scope = True
    mock_result.cost_usd = 0.003

    with patch("app.api.v1.qa.answer_question", return_value=mock_result):
        resp = await client.post(
            "/api/v1/qa",
            json={
                "session_id": str(uuid.uuid4()),
                "task_id": str(uuid.uuid4()),
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
async def test_ask_question_out_of_scope(client, student):
    mock_result = MagicMock()
    mock_result.answer = "강의 범위 밖의 질문입니다."
    mock_result.in_scope = False
    mock_result.cost_usd = 0.001

    with patch("app.api.v1.qa.answer_question", return_value=mock_result):
        resp = await client.post(
            "/api/v1/qa",
            json={
                "session_id": str(uuid.uuid4()),
                "task_id": str(uuid.uuid4()),
                "question": "오늘 날씨가 어때요?",
            },
            headers=make_auth_header(student),
        )
    assert resp.status_code == 200
    assert resp.json()["in_scope"] is False


@pytest.mark.asyncio
async def test_ask_question_professor_forbidden(client, professor):
    resp = await client.post(
        "/api/v1/qa",
        json={
            "session_id": str(uuid.uuid4()),
            "task_id": str(uuid.uuid4()),
            "question": "테스트",
        },
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_ask_question_service_error(client, student):
    with patch("app.api.v1.qa.answer_question", side_effect=Exception("API error")):
        resp = await client.post(
            "/api/v1/qa",
            json={
                "session_id": str(uuid.uuid4()),
                "task_id": str(uuid.uuid4()),
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
