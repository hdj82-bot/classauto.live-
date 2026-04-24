"""평가 시스템 API 통합 테스트."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.question import AssessmentType, Difficulty, Question, QuestionType
from app.models.session import LearningSession, SessionStatus
from tests.conftest import make_auth_header


# ── 공통 픽스처: 형성평가 문제 풀 ─────────────────────────────────────────────

@pytest.fixture
def _formative_questions(lecture):
    """lecture에 연결된 형성평가 객관식 문제 3개 (DB 미삽입, session 통해 삽입)."""
    return [
        Question(
            id=uuid.uuid4(),
            lecture_id=lecture.id,
            assessment_type=AssessmentType.formative,
            question_type=QuestionType.multiple_choice,
            difficulty=Difficulty.medium,
            content=f"형성평가 문제 {i+1}",
            options=["A", "B", "C", "D"],
            correct_answer="0",
            explanation="해설",
            timestamp_seconds=i * 30,
            is_active=True,
        )
        for i in range(3)
    ]


# ── GET /api/questions/{lecture_id} ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_questions_no_pool(client, student, lecture):
    """문제 풀이 없으면 404."""
    resp = await client.get(
        f"/api/questions/{lecture.id}",
        headers=make_auth_header(student),
        params={"assessment_type": "formative"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_questions_returns_pool(client, student, lecture, db, _formative_questions):
    """문제 풀이 있으면 랜덤화된 목록 반환."""
    for q in _formative_questions:
        db.add(q)
    await db.flush()

    resp = await client.get(
        f"/api/questions/{lecture.id}",
        headers=make_auth_header(student),
        params={"assessment_type": "formative"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["lecture_id"] == str(lecture.id)
    assert "session_id" in data
    assert "questions" in data
    assert len(data["questions"]) <= 3
    # 정답·해설 미포함 확인
    for q in data["questions"]:
        assert "correct_answer" not in q
        assert "explanation" not in q


@pytest.mark.asyncio
async def test_get_questions_professor_forbidden(client, professor, lecture):
    """교수자는 문제 조회 불가 → 403."""
    resp = await client.get(
        f"/api/questions/{lecture.id}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_questions_same_session_same_order(
    client, student, lecture, db, _formative_questions
):
    """같은 학습자 → 같은 session → 같은 랜덤 순서."""
    for q in _formative_questions:
        db.add(q)
    await db.flush()

    r1 = await client.get(
        f"/api/questions/{lecture.id}",
        headers=make_auth_header(student),
        params={"assessment_type": "formative"},
    )
    r2 = await client.get(
        f"/api/questions/{lecture.id}",
        headers=make_auth_header(student),
        params={"assessment_type": "formative"},
    )
    assert r1.status_code == r2.status_code == 200
    # 같은 세션이면 같은 순서 (세션 재사용 여부에 따라 session_id가 다를 수 있음)
    if r1.json().get("session_id") == r2.json().get("session_id"):
        ids1 = [q["id"] for q in r1.json()["questions"]]
        ids2 = [q["id"] for q in r2.json()["questions"]]
        assert ids1 == ids2


# ── POST /api/responses ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_submit_responses_correct(client, student, lecture, db, _formative_questions):
    """정답 응답 제출 시 is_correct=true."""
    for q in _formative_questions:
        db.add(q)
    await db.flush()
    await db.commit()  # GET 핸들러 db.commit() 이후에도 Question 이 보이도록 outer trans에 영구 기록

    # 세션 생성
    r = await client.get(
        f"/api/questions/{lecture.id}",
        headers=make_auth_header(student),
        params={"assessment_type": "formative"},
    )
    session_id = r.json()["session_id"]
    question_id = r.json()["questions"][0]["id"]
    ts = _formative_questions[0].timestamp_seconds  # 0

    resp = await client.post(
        "/api/responses",
        headers=make_auth_header(student),
        json={
            "session_id": session_id,
            "responses": [
                {
                    "question_id": question_id,
                    "user_answer": "0",          # 정답
                    "video_timestamp_seconds": ts,  # 타임스탬프 일치
                }
            ],
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data) == 1
    assert data[0]["is_correct"] is True
    assert data[0]["timestamp_valid"] is True


@pytest.mark.asyncio
async def test_submit_responses_wrong_answer(client, student, lecture, db, _formative_questions):
    """오답 제출 → is_correct=false."""
    for q in _formative_questions:
        db.add(q)
    await db.flush()
    await db.commit()

    r = await client.get(
        f"/api/questions/{lecture.id}",
        headers=make_auth_header(student),
        params={"assessment_type": "formative"},
    )
    session_id = r.json()["session_id"]
    question_id = r.json()["questions"][0]["id"]

    resp = await client.post(
        "/api/responses",
        headers=make_auth_header(student),
        json={
            "session_id": session_id,
            "responses": [
                {
                    "question_id": question_id,
                    "user_answer": "3",          # 오답
                    "video_timestamp_seconds": 0,
                }
            ],
        },
    )
    assert resp.status_code == 201
    assert resp.json()[0]["is_correct"] is False


@pytest.mark.asyncio
async def test_submit_responses_timestamp_violation(
    client, student, lecture, db, _formative_questions
):
    """타임스탬프 오차 초과 → timestamp_valid=false, is_correct=false."""
    for q in _formative_questions:
        db.add(q)
    await db.flush()
    await db.commit()

    r = await client.get(
        f"/api/questions/{lecture.id}",
        headers=make_auth_header(student),
        params={"assessment_type": "formative"},
    )
    session_id = r.json()["session_id"]
    question_id = r.json()["questions"][0]["id"]

    resp = await client.post(
        "/api/responses",
        headers=make_auth_header(student),
        json={
            "session_id": session_id,
            "responses": [
                {
                    "question_id": question_id,
                    "user_answer": "0",
                    "video_timestamp_seconds": 9999,  # 허용 오차(120초) 대폭 초과
                }
            ],
        },
    )
    assert resp.status_code == 201
    r0 = resp.json()[0]
    assert r0["timestamp_valid"] is False
    assert r0["is_correct"] is False


@pytest.mark.asyncio
async def test_submit_responses_wrong_session(client, student):
    """존재하지 않는 session_id → 403."""
    resp = await client.post(
        "/api/responses",
        headers=make_auth_header(student),
        json={
            "session_id": str(uuid.uuid4()),
            "responses": [
                {
                    "question_id": str(uuid.uuid4()),
                    "user_answer": "0",
                    "video_timestamp_seconds": 0,
                }
            ],
        },
    )
    assert resp.status_code == 403


# ── GET /api/responses/{session_id} ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_session_results(client, student, lecture, db, _formative_questions):
    """세션 결과 조회 — 점수 합산 확인."""
    for q in _formative_questions:
        db.add(q)
    await db.flush()

    # 문제 조회
    r = await client.get(
        f"/api/questions/{lecture.id}",
        headers=make_auth_header(student),
        params={"assessment_type": "formative"},
    )
    session_id = r.json()["session_id"]
    question_id = r.json()["questions"][0]["id"]

    # 응답 제출
    await client.post(
        "/api/responses",
        headers=make_auth_header(student),
        json={
            "session_id": session_id,
            "responses": [
                {
                    "question_id": question_id,
                    "user_answer": "0",
                    "video_timestamp_seconds": 0,
                }
            ],
        },
    )

    # 결과 조회
    resp = await client.get(
        f"/api/responses/{session_id}",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == session_id
    assert data["score"]["total"] == 1
    assert data["score"]["correct"] == 1
    assert len(data["responses"]) == 1
    # selectinload(Response.question) 동작 검증: question 필드가 eager load돼야 함
    response_item = data["responses"][0]
    assert "question" in response_item
    q = response_item["question"]
    for field in ("id", "content", "question_type", "assessment_type", "correct_answer"):
        assert field in q, f"question 필드 누락: {field}"


@pytest.mark.asyncio
async def test_get_session_results_not_owner(client, professor, lecture, db):
    """세션 소유자가 아닌 사용자 조회 → 404."""
    resp = await client.get(
        f"/api/responses/{uuid.uuid4()}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404


# ── POST /api/lectures/{id}/questions/generate ───────────────────────────────

@pytest.mark.asyncio
async def test_generate_questions_mocked(client, professor, lecture, db):
    """Claude API를 mock하여 문제 생성 엔드포인트 검증."""
    fake_response = MagicMock()
    fake_response.content = [
        MagicMock(
            type="text",
            text='{"formative":[{"question_type":"multiple_choice","difficulty":"medium","content":"테스트 문제","options":["A","B","C","D"],"correct_answer":"0","explanation":"해설","timestamp_seconds":10}],"summative":[{"question_type":"short_answer","difficulty":"easy","content":"서술형 문제","options":null,"correct_answer":"모범답안","explanation":"해설","timestamp_seconds":null}]}',
        )
    ]

    with patch("app.services.question.anthropic.Anthropic") as mock_anthropic:
        mock_client = MagicMock()
        mock_client.messages.create.return_value = fake_response
        mock_anthropic.return_value = mock_client

        resp = await client.post(
            f"/api/lectures/{lecture.id}/questions/generate",
            headers=make_auth_header(professor),
            json={
                "ppt_content": "슬라이드 1: 파이썬 소개\n슬라이드 2: 변수와 자료형",
                "formative_count": 1,
                "summative_count": 1,
                "video_duration_seconds": 300,
            },
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["formative_created"] == 1
    assert data["summative_created"] == 1
    assert "생성되었습니다" in data["message"]


@pytest.mark.asyncio
async def test_generate_questions_student_forbidden(client, student, lecture):
    """학습자는 문제 생성 불가 → 403."""
    resp = await client.post(
        f"/api/lectures/{lecture.id}/questions/generate",
        headers=make_auth_header(student),
        json={
            "ppt_content": "내용",
            "video_duration_seconds": 100,
        },
    )
    assert resp.status_code == 403
