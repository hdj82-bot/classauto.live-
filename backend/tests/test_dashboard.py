"""교수자 대시보드 API 통합 테스트."""
import pytest

from tests.conftest import make_auth_header


# ── 출석 분석 ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_attendance(client, professor, lecture):
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/attendance",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_attendance_student_forbidden(client, student, lecture):
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/attendance",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_attendance_unauthorized(client, lecture):
    resp = await client.get(f"/api/v1/dashboard/{lecture.id}/attendance")
    assert resp.status_code in (401, 403)


# ── 정답률 분석 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_scores(client, professor, lecture):
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/scores",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_scores_student_forbidden(client, student, lecture):
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/scores",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


# ── 참여도 분석 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_engagement(client, professor, lecture):
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/engagement",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200


# ── Q&A 로그 ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_qa_logs(client, professor, lecture):
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/qa",
        params={"page": 1, "limit": 10},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_qa_logs_pagination(client, professor, lecture):
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/qa",
        params={"page": 1, "limit": 200},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200


# ── 비용 미터 ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_cost(client, professor, lecture):
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/cost",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
