"""베타 신청 API 통합 테스트.

- 제출: 공개(비로그인) POST /api/beta-applications.
- 운영자 조회/상태변경: require_owner — admin(또는 ADMIN_EMAILS) 만.
"""
from __future__ import annotations

import pytest

from tests.conftest import make_auth_header

VALID = {
    "name": "하두진",
    "school": "경기대학교",
    "department": "중어중문학과",
    "professor_title": "교수",
    "email": "Prof@kyonggi.AC.kr",
    "subject": "현대중국사회의이해",
    "student_count": "60",
    "start_timing": "nextSemester",
    "channel": "referral",
    "message": "베타 참여 희망합니다.",
}


@pytest.mark.asyncio
async def test_public_submit_ok(client):
    """비로그인 방문자가 신청 → 201, 이메일은 소문자 정규화."""
    resp = await client.post("/api/beta-applications", json=VALID)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["email"] == "prof@kyonggi.ac.kr"
    assert data["status"] == "new"
    assert data["school"] == "경기대학교"


@pytest.mark.asyncio
async def test_submit_rejects_bad_enum_and_email(client):
    for bad in (
        {**VALID, "start_timing": "someday"},
        {**VALID, "channel": "tiktok"},
        {**VALID, "email": "not-an-email"},
    ):
        resp = await client.post("/api/beta-applications", json=bad)
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_owner_can_list_and_filter(client, admin):
    await client.post("/api/beta-applications", json=VALID)
    await client.post(
        "/api/beta-applications", json={**VALID, "email": "b@x.ac.kr"}
    )
    resp = await client.get(
        "/api/admin/beta-applications", headers=make_auth_header(admin)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert data["new_count"] == 2
    assert len(data["applications"]) == 2
    # 최신순 — created_at desc.
    assert {a["email"] for a in data["applications"]} == {
        "prof@kyonggi.ac.kr",
        "b@x.ac.kr",
    }


@pytest.mark.asyncio
async def test_list_forbidden_for_non_owner(client, professor, student):
    for u in (professor, student):
        resp = await client.get(
            "/api/admin/beta-applications", headers=make_auth_header(u)
        )
        assert resp.status_code == 403
    assert (await client.get("/api/admin/beta-applications")).status_code in (401, 403)


@pytest.mark.asyncio
async def test_owner_updates_status(client, admin):
    created = (await client.post("/api/beta-applications", json=VALID)).json()
    resp = await client.patch(
        f"/api/admin/beta-applications/{created['id']}",
        headers=make_auth_header(admin),
        json={"status": "approved"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"

    # new_count 가 줄어든다(approved 로 빠짐).
    listing = (
        await client.get(
            "/api/admin/beta-applications", headers=make_auth_header(admin)
        )
    ).json()
    assert listing["new_count"] == 0
