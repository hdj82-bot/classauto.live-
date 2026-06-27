"""베타테스터 교수자 초대 발급·검증·소비 통합 테스트.

계정주(ADMIN_EMAILS 이메일) 교수자가 초대 링크를 발급하고, 그 링크가 지정 이메일
교수자 가입 게이트(validate_invite)를 통과시키며, 1회 사용 후 소비되는지 확인한다.
권한: 계정주 발급 OK / 일반 교수자 403.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models.invite import ProfessorInvite
from app.models.user import User, UserRole
from app.services.invite import consume_invite, validate_invite
from tests.conftest import make_auth_header

OWNER_EMAIL = "classauto101@gmail.com"


@pytest.fixture
def owner_factory(db):
    async def _make() -> User:
        user = User(
            id=uuid.uuid4(),
            google_sub=f"google-owner-{uuid.uuid4().hex[:8]}",
            email=OWNER_EMAIL,
            name="계정주",
            role=UserRole.professor,  # 계정주는 교수자 운영(이메일로 require_owner 통과)
            is_active=True,
        )
        db.add(user)
        await db.flush()
        return user

    return _make


@pytest.mark.asyncio
async def test_owner_can_issue_invite_link(client, db, owner_factory):
    owner = await owner_factory()
    resp = await client.post(
        "/api/owner/invites",
        headers=make_auth_header(owner),
        json={"email": "beta@kyonggi.ac.kr", "cohort": "2026-08"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["email"] == "beta@kyonggi.ac.kr"
    assert data["cohort"] == "2026-08"
    assert data["status"] == "active"
    # 발급된 링크에 토큰이 실려 운영자가 복사·전달할 수 있어야 한다.
    assert "/auth/invite?token=" in data["invite_url"]

    listed = await client.get("/api/owner/invites", headers=make_auth_header(owner))
    assert listed.status_code == 200
    assert any(i["email"] == "beta@kyonggi.ac.kr" for i in listed.json())


@pytest.mark.asyncio
async def test_non_owner_professor_cannot_issue(client, professor):
    resp = await client.post(
        "/api/owner/invites",
        headers=make_auth_header(professor),
        json={"email": "beta@kyonggi.ac.kr"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_invite_passes_gate_then_single_use(client, db, owner_factory):
    """발급한 초대가 지정 이메일을 통과시키고, 한 번 소비하면 재사용 불가."""
    owner = await owner_factory()
    resp = await client.post(
        "/api/owner/invites",
        headers=make_auth_header(owner),
        json={"email": "beta@kyonggi.ac.kr"},
    )
    token = resp.json()["invite_url"].split("token=")[1]

    # 다른 이메일은 거부, 지정 이메일은 통과(대소문자 무시).
    assert await validate_invite(db, token, "someone-else@x.ac.kr") is None
    inv = await validate_invite(db, token, "BETA@kyonggi.ac.kr")
    assert inv is not None

    # 소비 후에는 더 이상 통과하지 않는다(단일 사용).
    await consume_invite(db, inv, uuid.uuid4())
    assert await validate_invite(db, token, "beta@kyonggi.ac.kr") is None

    stored = (
        await db.execute(
            select(ProfessorInvite).where(ProfessorInvite.token == token)
        )
    ).scalar_one()
    assert stored.used_at is not None
