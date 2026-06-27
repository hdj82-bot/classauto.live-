"""계정주(ADMIN_EMAILS) OAuth 로그인 시 역할 자가 교정 테스트.

계정주 계정이 학습자로 잘못 가입돼 있어도 교수자 로그인을 막지 않고(role_denied 없음),
역할을 교수자로 승격해야 한다. 그래야 운영자가 베타 초대 발급 등 교수자 화면에
들어갈 수 있다. 일반 학습자는 종전대로 교수자 로그인이 거부된다.
"""
from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.user import User, UserRole
from app.services.auth import save_oauth_state

OWNER_EMAIL = "classauto101@gmail.com"


def _patch_userinfo(google_sub: str, email: str):
    """콜백이 호출하는 exchange_google_code 를 고정 userinfo 로 대체."""
    async def _fake(code: str):
        return {"id": google_sub, "email": email, "name": "Owner"}

    return patch("app.api.v1.auth.exchange_google_code", side_effect=_fake)


@pytest.mark.asyncio
async def test_owner_student_promoted_to_professor_on_login(client, fake_redis, db):
    """계정주가 학습자로 존재해도 교수자 로그인 → 승격되고 role_denied 아님."""
    assert OWNER_EMAIL in settings.admin_email_set  # 기본 ADMIN_EMAILS 전제
    sub = "google-owner-promote"
    db.add(
        User(
            id=uuid.uuid4(),
            google_sub=sub,
            email=OWNER_EMAIL,
            name="Owner",
            role=UserRole.student,
            is_active=True,
        )
    )
    await db.flush()

    state = "state-owner-1"
    await save_oauth_state(state, "professor", None)

    with _patch_userinfo(sub, OWNER_EMAIL):
        resp = await client.get(
            f"/api/auth/google/callback?code=x&state={state}",
            follow_redirects=False,
        )

    # 기존 유저 경로(/auth/callback) 로 리다이렉트 — role_denied 아님.
    location = resp.headers["location"]
    assert "error=role_denied" not in location
    assert "/auth/callback" in location

    # 역할이 교수자로 자가 교정됐는지 확인.
    user = (
        await db.execute(select(User).where(User.google_sub == sub))
    ).scalar_one()
    assert user.role == UserRole.professor


@pytest.mark.asyncio
async def test_non_owner_student_still_denied_as_professor(client, fake_redis, db):
    """일반 학습자 계정이 교수자로 로그인 시도 → 종전대로 role_denied."""
    sub = "google-normal-student"
    email = "normal-student@test.ac.kr"
    assert email not in settings.admin_email_set
    db.add(
        User(
            id=uuid.uuid4(),
            google_sub=sub,
            email=email,
            name="Student",
            role=UserRole.student,
            is_active=True,
        )
    )
    await db.flush()

    state = "state-normal-1"
    await save_oauth_state(state, "professor", None)

    with _patch_userinfo(sub, email):
        resp = await client.get(
            f"/api/auth/google/callback?code=x&state={state}",
            follow_redirects=False,
        )

    assert "error=role_denied" in resp.headers["location"]
    user = (
        await db.execute(select(User).where(User.google_sub == sub))
    ).scalar_one()
    assert user.role == UserRole.student  # 승격되지 않음
