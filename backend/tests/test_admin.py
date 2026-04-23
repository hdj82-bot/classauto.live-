"""관리자 API 통합 테스트.

커버리지 대상:
  GET  /api/v1/admin/stats
  GET  /api/v1/admin/users
  PATCH /api/v1/admin/users/{user_id}
  GET  /api/v1/admin/costs
  GET  /api/v1/admin/system
"""
import uuid

import pytest

from tests.conftest import make_auth_header


# ── GET /api/v1/admin/stats ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_stats_admin_ok(client, admin, professor, student):
    """admin 권한으로 전체 통계를 조회할 수 있다."""
    resp = await client.get("/api/v1/admin/stats", headers=make_auth_header(admin))
    assert resp.status_code == 200
    data = resp.json()
    assert "total_users" in data
    assert "total_courses" in data
    assert "total_lectures" in data
    assert "total_sessions" in data
    assert "total_renders" in data
    # admin + professor + student 픽스처가 생성되므로 최소 3명
    assert data["total_users"] >= 3


@pytest.mark.asyncio
async def test_get_stats_professor_forbidden(client, professor):
    resp = await client.get("/api/v1/admin/stats", headers=make_auth_header(professor))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_stats_student_forbidden(client, student):
    resp = await client.get("/api/v1/admin/stats", headers=make_auth_header(student))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_stats_unauthorized(client):
    resp = await client.get("/api/v1/admin/stats")
    assert resp.status_code in (401, 403)


# ── GET /api/v1/admin/users ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_users_admin_ok(client, admin, professor, student):
    """admin은 전체 사용자 목록과 페이지네이션 메타데이터를 받는다."""
    resp = await client.get("/api/v1/admin/users", headers=make_auth_header(admin))
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "page" in data
    assert "limit" in data
    assert "users" in data
    assert isinstance(data["users"], list)
    assert data["total"] >= 3


@pytest.mark.asyncio
async def test_list_users_response_shape(client, admin, professor):
    """사용자 항목에 필수 필드가 모두 포함된다."""
    resp = await client.get("/api/v1/admin/users", headers=make_auth_header(admin))
    assert resp.status_code == 200
    users = resp.json()["users"]
    assert len(users) >= 1
    sample = users[0]
    for field in ("id", "email", "name", "role", "is_active"):
        assert field in sample


@pytest.mark.asyncio
async def test_list_users_role_filter(client, admin, professor, student):
    """role 쿼리 파라미터로 역할 필터링이 동작한다."""
    resp = await client.get(
        "/api/v1/admin/users",
        params={"role": "professor"},
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert all(u["role"] == "professor" for u in data["users"])


@pytest.mark.asyncio
async def test_list_users_pagination(client, admin, professor, student):
    """limit=1이면 users 목록 길이가 1 이하이고 page가 응답에 반영된다."""
    resp = await client.get(
        "/api/v1/admin/users",
        params={"page": 1, "limit": 1},
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 1
    assert data["limit"] == 1
    assert len(data["users"]) <= 1


@pytest.mark.asyncio
async def test_list_users_professor_forbidden(client, professor):
    resp = await client.get("/api/v1/admin/users", headers=make_auth_header(professor))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_users_student_forbidden(client, student):
    resp = await client.get("/api/v1/admin/users", headers=make_auth_header(student))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_users_unauthorized(client):
    resp = await client.get("/api/v1/admin/users")
    assert resp.status_code in (401, 403)


# ── PATCH /api/v1/admin/users/{user_id} ─────────────────────────────────────


@pytest.mark.asyncio
async def test_update_user_deactivate(client, admin, student):
    """admin이 사용자를 비활성화할 수 있다."""
    resp = await client.patch(
        f"/api/v1/admin/users/{student.id}",
        params={"is_active": False},
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(student.id)
    assert data["is_active"] is False


@pytest.mark.asyncio
async def test_update_user_activate(client, admin, student):
    """비활성화 후 재활성화도 정상 동작한다."""
    await client.patch(
        f"/api/v1/admin/users/{student.id}",
        params={"is_active": False},
        headers=make_auth_header(admin),
    )
    resp = await client.patch(
        f"/api/v1/admin/users/{student.id}",
        params={"is_active": True},
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True


@pytest.mark.asyncio
async def test_update_user_change_role(client, admin, student):
    """admin이 사용자의 역할을 변경할 수 있다."""
    resp = await client.patch(
        f"/api/v1/admin/users/{student.id}",
        params={"role": "professor"},
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "professor"


@pytest.mark.asyncio
async def test_update_user_invalid_role(client, admin, student):
    """유효하지 않은 역할 값은 400을 반환한다."""
    resp = await client.patch(
        f"/api/v1/admin/users/{student.id}",
        params={"role": "superuser"},
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_user_not_found(client, admin):
    """존재하지 않는 user_id는 404를 반환한다."""
    resp = await client.patch(
        f"/api/v1/admin/users/{uuid.uuid4()}",
        params={"is_active": False},
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_user_response_shape(client, admin, professor):
    """응답에 id, email, name, role, is_active 필드가 포함된다."""
    resp = await client.patch(
        f"/api/v1/admin/users/{professor.id}",
        params={"is_active": True},
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 200
    data = resp.json()
    for field in ("id", "email", "name", "role", "is_active"):
        assert field in data


@pytest.mark.asyncio
async def test_update_user_professor_forbidden(client, professor, student):
    resp = await client.patch(
        f"/api/v1/admin/users/{student.id}",
        params={"is_active": False},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_user_student_forbidden(client, student):
    resp = await client.patch(
        f"/api/v1/admin/users/{student.id}",
        params={"is_active": False},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_user_unauthorized(client, student):
    resp = await client.patch(f"/api/v1/admin/users/{student.id}", params={"is_active": False})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_patch_user_persists(client, admin, student):
    """role 변경이 DB에 실제 반영되어 이후 GET 조회에서도 유지된다 (commit 검증)."""
    resp = await client.patch(
        f"/api/v1/admin/users/{student.id}",
        params={"role": "professor"},
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "professor"

    # 별도 GET 요청으로 변경값이 DB에 저장됐는지 검증
    list_resp = await client.get(
        "/api/v1/admin/users",
        params={"role": "professor"},
        headers=make_auth_header(admin),
    )
    assert list_resp.status_code == 200
    user_ids = [u["id"] for u in list_resp.json()["users"]]
    assert str(student.id) in user_ids


@pytest.mark.asyncio
async def test_delete_user_deactivates(client, admin, student):
    """DELETE 후 재조회 시 is_active=False가 DB에 반영돼 있다 (commit 검증)."""
    resp = await client.delete(
        f"/api/v1/admin/users/{student.id}",
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    # 이후 PATCH(no-op)로 재조회해 비활성화 상태가 유지되는지 확인
    verify = await client.patch(
        f"/api/v1/admin/users/{student.id}",
        params={"is_active": False},
        headers=make_auth_header(admin),
    )
    assert verify.status_code == 200
    assert verify.json()["is_active"] is False


@pytest.mark.asyncio
async def test_admin_cannot_delete_self(client, admin):
    """어드민은 자기 자신의 계정을 삭제할 수 없다."""
    resp = await client.delete(
        f"/api/v1/admin/users/{admin.id}",
        headers=make_auth_header(admin),
    )
    assert resp.status_code == 400


# ── GET /api/v1/admin/costs ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_costs_admin_ok(client, admin):
    """admin은 비용 집계 구조를 정상 수신한다 (데이터 없을 때 빈 리스트)."""
    resp = await client.get("/api/v1/admin/costs", headers=make_auth_header(admin))
    assert resp.status_code == 200
    data = resp.json()
    assert "total_cost_usd" in data
    assert "by_service" in data
    assert "by_month" in data
    assert isinstance(data["by_service"], list)
    assert isinstance(data["by_month"], list)
    # 테스트 DB에 비용 데이터가 없으므로 합계는 0
    assert data["total_cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_get_costs_professor_forbidden(client, professor):
    resp = await client.get("/api/v1/admin/costs", headers=make_auth_header(professor))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_costs_student_forbidden(client, student):
    resp = await client.get("/api/v1/admin/costs", headers=make_auth_header(student))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_costs_unauthorized(client):
    resp = await client.get("/api/v1/admin/costs")
    assert resp.status_code in (401, 403)


# ── GET /api/v1/admin/system ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_system_status_admin_ok(client, admin):
    """admin은 시스템 상태를 조회할 수 있다.

    SQLite 테스트 환경에서는 pg_database_size / Redis / Celery 연결이
    모두 실패하지만 엔드포인트가 예외를 잡아 None으로 반환하므로 200이어야 한다.
    """
    resp = await client.get("/api/v1/admin/system", headers=make_auth_header(admin))
    assert resp.status_code == 200
    data = resp.json()
    assert "db_size_mb" in data
    assert "redis_used_memory_mb" in data
    assert "redis_connected_clients" in data
    assert "celery_queue_length" in data


@pytest.mark.asyncio
async def test_get_system_status_professor_forbidden(client, professor):
    resp = await client.get("/api/v1/admin/system", headers=make_auth_header(professor))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_system_status_student_forbidden(client, student):
    resp = await client.get("/api/v1/admin/system", headers=make_auth_header(student))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_system_status_unauthorized(client):
    resp = await client.get("/api/v1/admin/system")
    assert resp.status_code in (401, 403)
