"""베타 운영자 콘솔(스펙 13 · A~G) 통합 테스트.

커버리지:
  A  GET /api/v1/admin/beta-overview, /users/{id}/usage
  B  GET /api/v1/admin/costs (render + platform 합산)
  D  GET /api/v1/admin/funnel
  E  감사 로그 (역할변경/삭제/초대 생성·삭제) + GET /api/v1/admin/audit
  F  POST /api/v1/feedback + GET/PATCH /api/v1/admin/feedback
  G  코호트 전파 + 동의 게이트(교수자 한정) + 학생 가입 회귀

pytest.ini 의 ``asyncio_mode = auto`` 로 async test 는 자동 마킹된다.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.security import create_temp_token
from app.models.cost_log import CostCategory, CostLog
from app.models.invite import ProfessorInvite
from app.models.session import LearningSession, SessionStatus
from app.models.user import User, UserRole
from app.models.video_render import RenderCostLog, RenderStatus, VideoRender
from tests.conftest import make_auth_header

pytestmark = pytest.mark.asyncio


# ── 헬퍼 ──────────────────────────────────────────────────────────────────────


async def _add_render_cost(db, lecture, professor, cost, *, service="heygen", when=None):
    render = VideoRender(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        instructor_id=professor.id,
        avatar_id="av",
        status=RenderStatus.ready,
    )
    db.add(render)
    await db.flush()
    log = RenderCostLog(
        id=uuid.uuid4(),
        video_render_id=render.id,
        service=service,
        operation="video_render",
        cost_usd=cost,
        created_at=when or datetime.now(timezone.utc),
    )
    db.add(log)
    await db.flush()
    return render


async def _add_platform_cost(db, lecture, cost, *, category=CostCategory.llm_qa, when=None):
    log = CostLog(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        category=category,
        cost_usd=cost,
        created_at=when or datetime.now(timezone.utc),
    )
    db.add(log)
    await db.flush()
    return log


# ── B: /costs 두 비용 테이블 통합 ─────────────────────────────────────────────


async def test_costs_merges_render_and_platform(client, admin, db, professor, lecture):
    """total_cost_usd = render_cost_logs + platform_cost_logs 합이어야 한다."""
    await _add_render_cost(db, lecture, professor, 2.5, service="heygen")
    await _add_platform_cost(db, lecture, 1.0, category=CostCategory.llm_qa)

    resp = await client.get("/api/v1/admin/costs", headers=make_auth_header(admin))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_cost_usd"] == 3.5
    # source 구분이 남는다 — render/platform 각각 존재.
    sources = {row["source"] for row in data["by_service"]}
    assert sources == {"render", "platform"}
    by_name = {row["service"]: row["cost_usd"] for row in data["by_service"]}
    assert by_name["heygen"] == 2.5
    assert by_name["LLM_QA"] == 1.0


# ── A: beta-overview ──────────────────────────────────────────────────────────


async def test_beta_overview_rollup(client, admin, db, professor, course, lecture):
    """교수자별 강의/지출 롤업 — 두 비용 테이블 합산 + 강의 수."""
    await _add_render_cost(db, lecture, professor, 3.0, service="heygen")
    await _add_platform_cost(db, lecture, 2.0)

    resp = await client.get("/api/v1/admin/beta-overview", headers=make_auth_header(admin))
    assert resp.status_code == 200
    data = resp.json()
    row = next(r for r in data["instructors"] if r["id"] == str(professor.id))
    assert row["spend_total_usd"] == 5.0
    assert row["spend_this_month_usd"] == 5.0
    assert row["lectures_count"] == 1
    assert row["published_lectures_count"] == 1  # lecture 픽스처 is_published=True
    assert row["renders_count"] == 1
    assert row["last_active_at"] is not None


async def test_beta_overview_cohort_filter(client, admin, db, professor, course, lecture):
    """cohort 필터 — 해당 코호트 교수자만 반환."""
    professor.cohort = "2026-08"
    await db.flush()
    hit = await client.get(
        "/api/v1/admin/beta-overview",
        params={"cohort": "2026-08"},
        headers=make_auth_header(admin),
    )
    assert any(r["id"] == str(professor.id) for r in hit.json()["instructors"])
    miss = await client.get(
        "/api/v1/admin/beta-overview",
        params={"cohort": "2026-09"},
        headers=make_auth_header(admin),
    )
    assert all(r["id"] != str(professor.id) for r in miss.json()["instructors"])


async def test_beta_overview_forbidden_for_professor(client, professor):
    resp = await client.get("/api/v1/admin/beta-overview", headers=make_auth_header(professor))
    assert resp.status_code == 403


# ── A: users/{id}/usage 드릴다운 ──────────────────────────────────────────────


async def test_user_usage_drilldown(client, admin, db, professor, course, lecture):
    await _add_render_cost(db, lecture, professor, 4.0)
    resp = await client.get(
        f"/api/v1/admin/users/{professor.id}/usage", headers=make_auth_header(admin)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(professor.id)
    assert data["lectures_count"] == 1
    assert data["lectures"][0]["id"] == str(lecture.id)
    assert data["spend_total_usd"] == 4.0
    assert len(data["monthly_spend"]) == 1


async def test_user_usage_404(client, admin):
    resp = await client.get(
        f"/api/v1/admin/users/{uuid.uuid4()}/usage", headers=make_auth_header(admin)
    )
    assert resp.status_code == 404


# ── D: funnel ─────────────────────────────────────────────────────────────────


async def test_funnel_counts_and_conversion(
    client, admin, db, professor, student, course, lecture
):
    """5단계 카운트 + 전이율. 초대(used)·강좌·발행강의·학생세션을 만든다."""
    db.add(
        ProfessorInvite(
            id=uuid.uuid4(),
            token="tok-funnel-1",
            email=professor.email,
            role="professor",
            used_at=datetime.now(timezone.utc),
            used_by=professor.id,
        )
    )
    db.add(
        LearningSession(
            id=uuid.uuid4(),
            user_id=student.id,
            lecture_id=lecture.id,
            status=SessionStatus.in_progress,
        )
    )
    await db.flush()

    resp = await client.get("/api/v1/admin/funnel", headers=make_auth_header(admin))
    assert resp.status_code == 200
    steps = {s["step"]: s for s in resp.json()["steps"]}
    assert steps["invited"]["count"] == 1
    assert steps["signed_up"]["count"] == 1
    assert steps["created_course"]["count"] == 1  # course 픽스처
    assert steps["published_lecture"]["count"] == 1  # lecture is_published=True
    assert steps["ran_student_session"]["count"] == 1
    # 모든 단계가 1 → 전이율 100%
    assert steps["signed_up"]["conversion_from_prev_pct"] == 100.0


async def test_funnel_forbidden(client, student):
    resp = await client.get("/api/v1/admin/funnel", headers=make_auth_header(student))
    assert resp.status_code == 403


# ── E: 감사 로그 ──────────────────────────────────────────────────────────────


async def test_audit_logs_role_change_and_delete(client, admin, db, student):
    # 역할 변경
    await client.patch(
        f"/api/v1/admin/users/{student.id}",
        params={"role": "professor"},
        headers=make_auth_header(admin),
    )
    # 다른 유저 삭제 (자기 자신 삭제는 막혀 있으므로 student 사용)
    await client.delete(
        f"/api/v1/admin/users/{student.id}", headers=make_auth_header(admin)
    )

    resp = await client.get("/api/v1/admin/audit", headers=make_auth_header(admin))
    assert resp.status_code == 200
    actions = [log["action"] for log in resp.json()["logs"]]
    assert "user.update_role" in actions
    assert "user.delete" in actions
    # actor 이메일 스냅샷이 남는다.
    role_log = next(l for l in resp.json()["logs"] if l["action"] == "user.update_role")
    assert role_log["actor_email"] == admin.email
    assert role_log["detail"]["to"] == "professor"


async def test_audit_logs_invite_create_delete(client, admin, db):
    """초대 생성·삭제가 감사 로그에 남는다 (owner = admin 역할)."""
    created = await client.post(
        "/api/owner/invites",
        json={"email": "audit-invitee@test.ac.kr", "cohort": "2026-09"},
        headers=make_auth_header(admin),
    )
    assert created.status_code == 201
    invite_id = created.json()["id"]
    assert created.json()["cohort"] == "2026-09"

    deleted = await client.delete(
        f"/api/owner/invites/{invite_id}", headers=make_auth_header(admin)
    )
    assert deleted.status_code == 204

    resp = await client.get(
        "/api/v1/admin/audit",
        params={"action": "invite.create"},
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1
    assert all(l["action"] == "invite.create" for l in resp.json()["logs"])


async def test_audit_forbidden(client, professor):
    resp = await client.get("/api/v1/admin/audit", headers=make_auth_header(professor))
    assert resp.status_code == 403


# ── F: 피드백 ─────────────────────────────────────────────────────────────────


async def test_feedback_submit_and_list(client, admin, professor, student, lecture):
    """교수·학생 모두 제출 가능, 운영자 목록에 노출."""
    p = await client.post(
        "/api/v1/feedback",
        json={"category": "bug", "message": "교수 피드백", "lecture_id": str(lecture.id)},
        headers=make_auth_header(professor),
    )
    assert p.status_code == 201
    assert p.json()["role"] == "professor"

    s = await client.post(
        "/api/v1/feedback",
        json={"category": "idea", "message": "학생 피드백"},
        headers=make_auth_header(student),
    )
    assert s.status_code == 201

    lst = await client.get("/api/v1/admin/feedback", headers=make_auth_header(admin))
    assert lst.status_code == 200
    assert lst.json()["total"] >= 2

    # role 필터
    only_student = await client.get(
        "/api/v1/admin/feedback",
        params={"role": "student"},
        headers=make_auth_header(admin),
    )
    assert all(f["role"] == "student" for f in only_student.json()["feedback"])


async def test_feedback_requires_auth(client):
    resp = await client.post(
        "/api/v1/feedback", json={"category": "bug", "message": "익명"}
    )
    assert resp.status_code in (401, 403)


async def test_feedback_list_forbidden_for_non_admin(client, professor):
    resp = await client.get("/api/v1/admin/feedback", headers=make_auth_header(professor))
    assert resp.status_code == 403


async def test_feedback_status_update(client, admin, professor):
    created = await client.post(
        "/api/v1/feedback",
        json={"category": "other", "message": "상태변경 테스트"},
        headers=make_auth_header(professor),
    )
    fid = created.json()["id"]
    resp = await client.patch(
        f"/api/v1/admin/feedback/{fid}",
        json={"status": "resolved"},
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "resolved"


async def test_feedback_invalid_category(client, professor):
    resp = await client.post(
        "/api/v1/feedback",
        json={"category": "INVALID", "message": "x"},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 422


# ── G: 동의 게이트 + 학생 가입 회귀 ───────────────────────────────────────────


def _prof_temp_token(email, invite_token):
    return create_temp_token(
        google_sub="google-consent-1",
        email=email,
        name="동의 교수",
        role="professor",
        invite=invite_token,
    )


async def test_professor_signup_blocked_without_consent(client, db):
    """교수자: 유효 초대가 있어도 동의 없이는 가입 불가(422). 학생 흐름과 무관."""
    from app.services.invite import create_invite

    email = "consent-needed@test.ac.kr"
    inv = await create_invite(db, email=email, created_by=None, cohort="2026-08")
    token = _prof_temp_token(email, inv.token)
    resp = await client.post(
        "/api/auth/complete-profile",
        json={
            "temp_token": token,
            "school": "경기대",
            "department": "중어중문학과",
            "beta_consented": False,
        },
    )
    assert resp.status_code == 422
    assert (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none() is None


async def test_student_signup_unaffected_by_consent(client, db):
    """학생 가입은 동의 게이트와 무관 — beta_consented 없이도 성공(회귀 보호)."""
    token = create_temp_token(
        google_sub="google-student-consent",
        email="student-free@test.ac.kr",
        name="자유 학생",
        role="student",
    )
    resp = await client.post(
        "/api/auth/complete-profile",
        json={"temp_token": token, "student_number": "20250001"},
    )
    assert resp.status_code == 201
    user = (
        await db.execute(select(User).where(User.email == "student-free@test.ac.kr"))
    ).scalar_one()
    assert user.role == UserRole.student
    assert user.cohort is None
    assert user.beta_consented_at is None
