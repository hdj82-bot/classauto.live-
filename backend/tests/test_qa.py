"""Q&A API 통합 테스트."""
import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest

from tests.conftest import make_auth_header


# ── 테스트 헬퍼 ───────────────────────────────────────────────────────────────

def _patch_qa_sync_session(
    pipeline_task_id: str | None = "task-test-001",
    *,
    session_user_id=None,
    session_lecture_id=None,
    session_exists: bool = True,
):
    """app.api.v1.qa.SyncSessionLocal()을 mock — 세션 권한검증 + lecture 조회 우회.

    qa.ask_question 은 execute() 를 두 번 호출한다(① LearningSession 권한 검증,
    ② Lecture 조회). side_effect 로 순서대로 응답을 돌려준다. 기본값은 '본인·해당
    강의 세션'이라 권한검증을 통과한다(테스트에서 user/lecture id 를 주입).
    """
    mock_session = None
    if session_exists:
        mock_session = MagicMock()
        mock_session.user_id = session_user_id
        mock_session.lecture_id = session_lecture_id

    mock_lecture = MagicMock()
    mock_lecture.pipeline_task_id = pipeline_task_id

    res_session = MagicMock()
    res_session.scalar_one_or_none.return_value = mock_session
    res_lecture = MagicMock()
    res_lecture.scalar_one_or_none.return_value = mock_lecture

    mock_db = MagicMock()
    mock_db.execute.side_effect = [res_session, res_lecture]

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
         _patch_qa_sync_session(session_user_id=student.id, session_lecture_id=lecture.id):
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
         _patch_qa_sync_session(session_user_id=student.id, session_lecture_id=lecture.id):
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
async def test_ask_question_rejects_foreign_session(client, student, lecture):
    """남의 세션 id 로는 RAG 호출 불가 — session.user_id 가 다르면 403."""
    with patch("app.api.v1.qa.answer_question") as ans, _patch_qa_sync_session(
        session_user_id=uuid.uuid4(), session_lecture_id=lecture.id
    ):
        resp = await client.post(
            "/api/v1/qa",
            json={
                "session_id": str(uuid.uuid4()),
                "lecture_id": str(lecture.id),
                "question": "임의 강의 캐묻기",
            },
            headers=make_auth_header(student),
        )
    assert resp.status_code == 403
    ans.assert_not_called()  # 권한 실패 시 비용 발생 호출이 없어야 한다.


@pytest.mark.asyncio
async def test_ask_question_rejects_lecture_mismatch(client, student, lecture):
    """본인 세션이라도 그 세션의 강의와 lecture_id 가 다르면 403."""
    with patch("app.api.v1.qa.answer_question") as ans, _patch_qa_sync_session(
        session_user_id=student.id, session_lecture_id=uuid.uuid4()
    ):
        resp = await client.post(
            "/api/v1/qa",
            json={
                "session_id": str(uuid.uuid4()),
                "lecture_id": str(lecture.id),
                "question": "세션과 다른 강의 캐묻기",
            },
            headers=make_auth_header(student),
        )
    assert resp.status_code == 403
    ans.assert_not_called()


@pytest.mark.asyncio
async def test_ask_question_rejects_missing_session(client, student, lecture):
    """존재하지 않는 세션 id → 403."""
    with patch("app.api.v1.qa.answer_question") as ans, _patch_qa_sync_session(
        session_exists=False
    ):
        resp = await client.post(
            "/api/v1/qa",
            json={
                "session_id": str(uuid.uuid4()),
                "lecture_id": str(lecture.id),
                "question": "없는 세션",
            },
            headers=make_auth_header(student),
        )
    assert resp.status_code == 403
    ans.assert_not_called()


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
         _patch_qa_sync_session(session_user_id=student.id, session_lecture_id=lecture.id):
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


# ── 1차 가드레일: 입력 길이 제약 (docs/planning/02 §3.1 — 텍스트 ≤ 500자) ──────


@pytest.mark.asyncio
async def test_ask_question_rejects_overlong_question(client, student, lecture):
    """501자 질문은 RAG·Claude 호출 전에 422 로 거부(서버 사이드 가드레일)."""
    with patch("app.api.v1.qa.answer_question") as ans:
        resp = await client.post(
            "/api/v1/qa",
            json={
                "session_id": str(uuid.uuid4()),
                "lecture_id": str(lecture.id),
                "question": "가" * 501,
            },
            headers=make_auth_header(student),
        )
    assert resp.status_code == 422
    ans.assert_not_called()  # 길이 초과는 비용 발생 경로에 도달하지 않아야 한다.


@pytest.mark.asyncio
async def test_ask_question_rejects_empty_question(client, student, lecture):
    """공백/빈 질문도 422 — min_length=1."""
    with patch("app.api.v1.qa.answer_question") as ans:
        resp = await client.post(
            "/api/v1/qa",
            json={
                "session_id": str(uuid.uuid4()),
                "lecture_id": str(lecture.id),
                "question": "",
            },
            headers=make_auth_header(student),
        )
    assert resp.status_code == 422
    ans.assert_not_called()


@pytest.mark.asyncio
async def test_ask_question_allows_500_char_boundary(client, student, lecture):
    """정확히 500자는 통과(경계값) — 한도 안의 정상 질문은 막지 않는다."""
    mock_result = _build_mock_qa_result("정상 답변입니다.", True, 0.002)
    with patch("app.api.v1.qa.answer_question", return_value=mock_result), \
         _patch_qa_sync_session(session_user_id=student.id, session_lecture_id=lecture.id):
        resp = await client.post(
            "/api/v1/qa",
            json={
                "session_id": str(uuid.uuid4()),
                "lecture_id": str(lecture.id),
                "question": "가" * 500,
            },
            headers=make_auth_header(student),
        )
    assert resp.status_code == 200
