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
from app.services.invite import attach_invite_user, claim_invite, validate_invite
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
    assert await claim_invite(db, inv.id) is True
    await attach_invite_user(db, inv.id, uuid.uuid4())
    assert await validate_invite(db, token, "beta@kyonggi.ac.kr") is None

    stored = (
        await db.execute(
            select(ProfessorInvite).where(ProfessorInvite.token == token)
        )
    ).scalar_one()
    assert stored.used_at is not None


# ── 공개 초대(이메일 미지정) ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_owner_can_issue_open_invite_without_email(client, db, owner_factory):
    """상대 이메일을 몰라도 링크·QR 을 발급할 수 있다(베타테스터 모집 편의)."""
    owner = await owner_factory()
    resp = await client.post(
        "/api/owner/invites",
        headers=make_auth_header(owner),
        json={"cohort": "2026-08"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["email"] is None  # 공개 초대
    assert data["status"] == "active"
    assert "/auth/invite?token=" in data["invite_url"]


@pytest.mark.asyncio
async def test_open_invite_accepts_any_email(client, db, owner_factory):
    """공개 초대는 대상을 잠그지 않는다 — 링크를 가진 사람이면 통과."""
    owner = await owner_factory()
    resp = await client.post(
        "/api/owner/invites", headers=make_auth_header(owner), json={}
    )
    token = resp.json()["invite_url"].split("token=")[1]

    assert await validate_invite(db, token, "anyone@somewhere.ac.kr") is not None
    assert await validate_invite(db, token, "another@elsewhere.ac.kr") is not None


@pytest.mark.asyncio
async def test_empty_email_string_is_open_invite(client, owner_factory):
    """빈 문자열은 형식 오류가 아니라 공개 초대로 정규화된다(폼 미입력 케이스)."""
    owner = await owner_factory()
    resp = await client.post(
        "/api/owner/invites",
        headers=make_auth_header(owner),
        json={"email": "   "},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["email"] is None


@pytest.mark.asyncio
async def test_malformed_email_still_rejected(client, owner_factory):
    """이메일을 '지정했는데' 형식이 틀리면 여전히 거부한다(오타 방어)."""
    owner = await owner_factory()
    resp = await client.post(
        "/api/owner/invites",
        headers=make_auth_header(owner),
        json={"email": "not-an-email"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_open_invite_is_single_use_even_when_shared(client, db, owner_factory):
    """공개 초대를 남에게 공유해도 **한 사람만** 가입한다.

    이메일 잠금이 없는 공개 초대에서는 단일 사용이 마지막 방어선이다. claim 은
    `used_at IS NULL` 조건부 UPDATE 라, 두 번째 시도는 반드시 False 여야 한다.
    """
    owner = await owner_factory()
    resp = await client.post(
        "/api/owner/invites", headers=make_auth_header(owner), json={}
    )
    token = resp.json()["invite_url"].split("token=")[1]

    inv = await validate_invite(db, token, "first@x.ac.kr")
    assert inv is not None

    # 링크를 공유받은 두 번째 사람도 읽기 검증까지는 통과할 수 있다(자리를 잡지 않음).
    also_valid = await validate_invite(db, token, "second@y.ac.kr")
    assert also_valid is not None

    # 자리는 하나뿐 — 먼저 잡은 쪽만 True.
    assert await claim_invite(db, inv.id) is True
    assert await claim_invite(db, inv.id) is False

    # 이후에는 읽기 검증도 막힌다.
    assert await validate_invite(db, token, "second@y.ac.kr") is None


@pytest.mark.asyncio
async def test_claim_records_used_by_for_audit(client, db, owner_factory):
    """누가 썼는지 추적 가능해야 한다 — claim 후 used_by 연결."""
    owner = await owner_factory()
    resp = await client.post(
        "/api/owner/invites", headers=make_auth_header(owner), json={}
    )
    token = resp.json()["invite_url"].split("token=")[1]
    inv = await validate_invite(db, token, "someone@x.ac.kr")
    assert inv is not None

    user_id = uuid.uuid4()
    assert await claim_invite(db, inv.id) is True
    await attach_invite_user(db, inv.id, user_id)

    stored = (
        await db.execute(
            select(ProfessorInvite).where(ProfessorInvite.token == token)
        )
    ).scalar_one()
    assert stored.used_at is not None
    assert stored.used_by == user_id
