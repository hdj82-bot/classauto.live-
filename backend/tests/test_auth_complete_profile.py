"""POST /api/auth/complete-profile 통합 테스트.

R2W2 (BACKEND_ASKS.W4 #3) — pre-OAuth 힌트 (name / locale) 수용 동작 검증.
기존 호출자 호환성 (school/department/student_number 만 보내는 경우) 도 회귀 보호.

pytest.ini 의 ``asyncio_mode = auto`` 가 ``async def test_*`` 를 자동으로
``@pytest.mark.asyncio`` 로 처리하므로 별도 마커는 생략한다.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.core.security import create_temp_token
from app.models.user import User, UserRole

pytestmark = pytest.mark.asyncio


# ── 헬퍼 ──────────────────────────────────────────────────────────────────────


def _temp_token(role: str, *, sub="google-new-001", email="new@test.ac.kr", name="신규 유저"):
    return create_temp_token(google_sub=sub, email=email, name=name, role=role)


# ── 학습자 — 기존 호환 ───────────────────────────────────────────────────────


async def test_complete_profile_student_legacy_body_still_works(client, db):
    """student_number 만 보내는 기존 클라이언트 (name/locale 미전송) — 회귀 보호."""
    token = _temp_token("student", sub="google-stu-legacy", email="legacy@test.ac.kr")

    resp = await client.post(
        "/api/auth/complete-profile",
        json={"temp_token": token, "student_number": "20240007"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" not in data  # 쿠키로 내려감

    user = (
        await db.execute(select(User).where(User.email == "legacy@test.ac.kr"))
    ).scalar_one()
    # form name 이 없을 때는 Google 의 name 그대로 유지
    assert user.name == "신규 유저"
    assert user.student_number == "20240007"
    assert user.role == UserRole.student


# ── 학습자 — name override (form 입력값이 Google name 보다 우선) ──────────────


async def test_complete_profile_student_form_name_overrides_google(client, db):
    token = _temp_token(
        "student", sub="google-stu-002", email="form-name@test.ac.kr",
        name="Google Display Name",
    )
    resp = await client.post(
        "/api/auth/complete-profile",
        json={
            "temp_token": token,
            "name": "한국어 이름",
            "student_number": "20240008",
        },
    )
    assert resp.status_code == 201
    user = (
        await db.execute(select(User).where(User.email == "form-name@test.ac.kr"))
    ).scalar_one()
    assert user.name == "한국어 이름"


async def test_complete_profile_blank_name_falls_back_to_google_name(client, db):
    """공백/빈 문자열 name 은 미입력으로 정규화 — Google name 유지."""
    token = _temp_token(
        "student", sub="google-stu-003", email="blank-name@test.ac.kr",
        name="원래 이름",
    )
    resp = await client.post(
        "/api/auth/complete-profile",
        json={
            "temp_token": token,
            "name": "   ",  # whitespace only
            "student_number": "20240009",
        },
    )
    assert resp.status_code == 201
    user = (
        await db.execute(select(User).where(User.email == "blank-name@test.ac.kr"))
    ).scalar_one()
    assert user.name == "원래 이름"


# ── 학습자 — locale 힌트 ─────────────────────────────────────────────────────


async def test_complete_profile_accepts_locale_ko(client, db):
    """locale="ko" 수용. 현재 컬럼 미존재 — 통과만 검증 (logger 출력)."""
    token = _temp_token("student", sub="google-stu-004", email="locale-ko@test.ac.kr")
    resp = await client.post(
        "/api/auth/complete-profile",
        json={
            "temp_token": token,
            "locale": "ko",
            "student_number": "20240010",
        },
    )
    assert resp.status_code == 201


async def test_complete_profile_accepts_locale_en(client, db):
    token = _temp_token("student", sub="google-stu-005", email="locale-en@test.ac.kr")
    resp = await client.post(
        "/api/auth/complete-profile",
        json={
            "temp_token": token,
            "locale": "en",
            "student_number": "20240011",
        },
    )
    assert resp.status_code == 201


async def test_complete_profile_rejects_invalid_locale(client):
    """locale 은 ko/en 만 허용 — pydantic Literal 검증으로 422."""
    token = _temp_token("student", sub="google-stu-006")
    resp = await client.post(
        "/api/auth/complete-profile",
        json={
            "temp_token": token,
            "locale": "fr",  # 미지원
            "student_number": "20240012",
        },
    )
    assert resp.status_code == 422


async def test_complete_profile_rejects_too_long_name(client):
    """name 은 100자 이하 — pydantic max_length 검증으로 422."""
    token = _temp_token("student", sub="google-stu-007")
    resp = await client.post(
        "/api/auth/complete-profile",
        json={
            "temp_token": token,
            "name": "가" * 101,
            "student_number": "20240013",
        },
    )
    assert resp.status_code == 422


# ── 교수자 — 기존 호환 ───────────────────────────────────────────────────────


async def test_complete_profile_professor_legacy_body_still_works(client, db):
    """기존 교수자 가입 — school/department 만 — 회귀 보호."""
    token = _temp_token(
        "professor", sub="google-prof-100", email="prof-legacy@test.ac.kr",
        name="기본 교수",
    )
    resp = await client.post(
        "/api/auth/complete-profile",
        json={
            "temp_token": token,
            "school": "서울대",
            "department": "중어중문학과",
        },
    )
    assert resp.status_code == 201
    user = (
        await db.execute(select(User).where(User.email == "prof-legacy@test.ac.kr"))
    ).scalar_one()
    assert user.role == UserRole.professor
    assert user.school == "서울대"
    assert user.department == "중어중문학과"
    # form name 미전송 → Google name 그대로
    assert user.name == "기본 교수"


async def test_complete_profile_professor_with_form_name(client, db):
    """교수자도 동일하게 form name override 동작."""
    token = _temp_token(
        "professor", sub="google-prof-101", email="prof-name@test.ac.kr",
        name="구글 이름",
    )
    resp = await client.post(
        "/api/auth/complete-profile",
        json={
            "temp_token": token,
            "name": "교수 본명",
            "school": "경기대",
            "department": "중어중문학과",
            "locale": "ko",
        },
    )
    assert resp.status_code == 201
    user = (
        await db.execute(select(User).where(User.email == "prof-name@test.ac.kr"))
    ).scalar_one()
    assert user.name == "교수 본명"


# ── 검증 분기 (기존 422 동작 보존) ────────────────────────────────────────────


async def test_complete_profile_professor_missing_school(client):
    """교수자 가입에 school 누락 → 422 (기존 동작 회귀)."""
    token = _temp_token("professor", sub="google-prof-102")
    resp = await client.post(
        "/api/auth/complete-profile",
        json={
            "temp_token": token,
            "department": "중어중문학과",
        },
    )
    assert resp.status_code == 422


async def test_complete_profile_student_missing_student_number(client):
    """학습자 가입에 student_number 누락 → 422 (기존 동작 회귀).

    name / locale 만 보내고 student_number 가 없으면 여전히 422 — student_number
    는 학습자 가입의 도메인 필수값.
    """
    token = _temp_token("student", sub="google-stu-008")
    resp = await client.post(
        "/api/auth/complete-profile",
        json={
            "temp_token": token,
            "name": "학생 이름",
            "locale": "ko",
        },
    )
    assert resp.status_code == 422


async def test_complete_profile_invalid_temp_token(client):
    """위조된 temp_token → 401 (기존 동작 회귀)."""
    resp = await client.post(
        "/api/auth/complete-profile",
        json={
            "temp_token": "totally.fake.jwt",
            "student_number": "20240099",
        },
    )
    assert resp.status_code == 401
