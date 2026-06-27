"""교수자 대시보드 API 통합 테스트."""
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lecture import Lecture
from app.models.course import Course
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


# ── 대시보드 요약 배치 ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dashboard_summary(client, professor, lecture):
    """내 전체 강의의 5개 메트릭(attendance/scores/engagement/qa/cost)을 한 번에."""
    resp = await client.get(
        "/api/v1/dashboard/summary",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "lectures" in data
    assert len(data["lectures"]) == 1
    item = data["lectures"][0]
    assert item["lecture_id"] == str(lecture.id)
    for key in ("attendance", "scores", "engagement", "qa", "cost"):
        assert key in item


@pytest.mark.asyncio
async def test_dashboard_summary_student_forbidden(client, student):
    """교수자 전용 — 학습자는 403."""
    resp = await client.get(
        "/api/v1/dashboard/summary",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_attendance_explicit_deadline_override(client, professor, lecture):
    """live_deadline_min 쿼리 파라미터로 기준을 명시적으로 덮어쓸 수 있다."""
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/attendance",
        params={"live_deadline_min": 60},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_attendance_per_lecture_deadline(
    client, professor, db: AsyncSession, course: Course
):
    """강의에 live_deadline_minutes가 설정된 경우 해당 값이 사용된다."""
    lec = Lecture(
        id=uuid.uuid4(),
        course_id=course.id,
        title="마감 45분 강의",
        slug="deadline-45-test-xyz9999",
        order=2,
        is_published=True,
        live_deadline_minutes=45,
    )
    db.add(lec)
    await db.flush()

    resp = await client.get(
        f"/api/v1/dashboard/{lec.id}/attendance",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200


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


# ── 성취율 추이 (스펙 11 §C) ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_trend_empty(client, professor, lecture):
    """스냅샷이 없으면 points 는 빈 배열(수집 전)."""
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/trend",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["lecture_id"] == str(lecture.id)
    assert data["points"] == []


@pytest.mark.asyncio
async def test_get_trend_student_forbidden(client, student, lecture):
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/trend",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_trend_returns_ordered_points(client, professor, db, lecture):
    """스냅샷 2일치 → points 가 날짜 오름차순으로, 필드 매핑이 정확히 반환."""
    from datetime import timedelta

    from app.models.cohort_metric import CohortDailyMetric
    from app.services.cohort_metrics import today_kst

    today = today_kst()
    yesterday = today - timedelta(days=1)
    db.add_all([
        CohortDailyMetric(
            lecture_id=lecture.id, metric_date=yesterday,
            completion_rate=40.0, attendance_rate=50.0, avg_accuracy=60.0,
            qa_count=3, active_learners=10,
        ),
        CohortDailyMetric(
            lecture_id=lecture.id, metric_date=today,
            completion_rate=70.0, attendance_rate=80.0, avg_accuracy=75.0,
            qa_count=7, active_learners=12,
        ),
    ])
    await db.flush()

    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/trend",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    points = resp.json()["points"]
    assert len(points) == 2
    assert points[0]["date"] == yesterday.isoformat()
    assert points[1]["date"] == today.isoformat()
    assert points[1]["completionRate"] == 70.0
    assert points[1]["avgAccuracy"] == 75.0
    assert points[1]["qaCount"] == 7
    assert points[1]["activeLearners"] == 12


# ── 현황 KPI + 전주 대비 델타 (스펙 11 §B) ────────────────────────────────────

@pytest.mark.asyncio
async def test_get_kpi_empty(client, professor, lecture):
    """스냅샷이 없으면 kpis 는 빈 배열."""
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/kpi",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["as_of"] is None
    assert data["kpis"] == []


@pytest.mark.asyncio
async def test_get_kpi_student_forbidden(client, student, lecture):
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/kpi",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_kpi_week_over_week_delta(client, professor, db, lecture):
    """7일 이전 스냅샷이 있으면 전주 대비 델타가 계산된다."""
    from datetime import timedelta

    from app.models.cohort_metric import CohortDailyMetric
    from app.services.cohort_metrics import today_kst

    today = today_kst()
    last_week = today - timedelta(days=7)
    db.add_all([
        CohortDailyMetric(
            lecture_id=lecture.id, metric_date=last_week,
            completion_rate=50.0, attendance_rate=60.0, avg_accuracy=70.0,
            qa_count=4, active_learners=8,
        ),
        CohortDailyMetric(
            lecture_id=lecture.id, metric_date=today,
            completion_rate=65.0, attendance_rate=55.0, avg_accuracy=80.0,
            qa_count=10, active_learners=9,
        ),
    ])
    await db.flush()

    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/kpi",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["as_of"] == today.isoformat()
    assert data["prev_as_of"] == last_week.isoformat()
    by_key = {k["key"]: k for k in data["kpis"]}
    assert by_key["completionRate"]["current"] == 65.0
    assert by_key["completionRate"]["delta"] == 15.0  # 65 - 50
    assert by_key["attendanceRate"]["delta"] == -5.0  # 55 - 60
    assert by_key["qaCount"]["delta"] == 6  # 10 - 4


@pytest.mark.asyncio
async def test_get_kpi_no_prev_snapshot_null_delta(client, professor, db, lecture):
    """전주 스냅샷이 없으면 현재값만, 델타는 null."""
    from app.models.cohort_metric import CohortDailyMetric
    from app.services.cohort_metrics import today_kst

    db.add(CohortDailyMetric(
        lecture_id=lecture.id, metric_date=today_kst(),
        completion_rate=42.0, attendance_rate=0.0, avg_accuracy=0.0,
        qa_count=0, active_learners=1,
    ))
    await db.flush()

    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/kpi",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["prev_as_of"] is None
    by_key = {k["key"]: k for k in data["kpis"]}
    assert by_key["completionRate"]["current"] == 42.0
    assert by_key["completionRate"]["delta"] is None


# ── 소유권 검증 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_professor_cannot_access_other_lecture_dashboard(client, db, lecture):
    """다른 교수자가 소유한 강의 대시보드에 접근 시 404 반환."""
    from app.models.user import User, UserRole

    other_prof = User(
        id=uuid.uuid4(),
        google_sub="google-prof-other",
        email="other_prof@test.ac.kr",
        name="다른 교수",
        role=UserRole.professor,
        school="다른대학교",
        department="수학과",
        is_active=True,
    )
    db.add(other_prof)
    await db.flush()

    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/attendance",
        headers=make_auth_header(other_prof),
    )
    assert resp.status_code == 404
