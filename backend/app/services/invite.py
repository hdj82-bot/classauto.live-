"""교수자 가입 초대 서비스 (베타 게이트).

계정주가 이메일을 지정해 단일 사용 초대 토큰을 발급하고, OAuth 가입 흐름이
그 토큰을 검증·소비한다. 학습자 가입은 이 게이트와 무관하다.
"""
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.invite import ProfessorInvite


def _now() -> datetime:
    return datetime.now(timezone.utc)


def invite_status(inv: ProfessorInvite) -> str:
    """active | used | expired — 표시 및 검증 공용."""
    if inv.used_at is not None:
        return "used"
    exp = inv.expires_at
    if exp is not None:
        # SQLite 등 tz 미보존 백엔드에서 naive 로 돌아오면 UTC 로 간주해
        # aware 비교(offset-naive vs offset-aware TypeError 방지).
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < _now():
            return "expired"
    return "active"


async def create_invite(
    db: AsyncSession,
    email: str,
    created_by: uuid.UUID | None,
    role: str = "professor",
    ttl_days: int | None = None,
    cohort: str | None = None,
) -> ProfessorInvite:
    """이메일 지정 단일 사용 초대 생성. 토큰은 추측 불가한 난수.

    ``cohort`` 는 베타 코호트 태그(예: "2026-08") — 가입 시 교수자 users.cohort 로
    전파한다(없으면 NULL).
    """
    days = settings.PROFESSOR_INVITE_TTL_DAYS if ttl_days is None else ttl_days
    expires_at = _now() + timedelta(days=days) if days and days > 0 else None
    inv = ProfessorInvite(
        id=uuid.uuid4(),
        token=secrets.token_urlsafe(32),
        email=email.strip().lower(),
        role=role,
        created_by=created_by,
        expires_at=expires_at,
        cohort=cohort,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return inv


async def get_invite_by_token(
    db: AsyncSession, token: str
) -> ProfessorInvite | None:
    if not token:
        return None
    result = await db.execute(
        select(ProfessorInvite).where(ProfessorInvite.token == token)
    )
    return result.scalar_one_or_none()


async def validate_invite(
    db: AsyncSession, token: str | None, email: str
) -> ProfessorInvite | None:
    """token + email 이 일치하고 미사용·미만료면 invite 반환, 아니면 None.

    이메일은 대소문자 무시 비교(초대 발급·소비 모두 소문자 정규화).
    """
    if not token:
        return None
    inv = await get_invite_by_token(db, token)
    if inv is None:
        return None
    if invite_status(inv) != "active":
        return None
    if inv.email != (email or "").strip().lower():
        return None
    return inv


async def consume_invite(
    db: AsyncSession, inv: ProfessorInvite, user_id: uuid.UUID
) -> None:
    """초대를 사용 처리(단일 사용 표시). 호출자가 이미 validate 한 invite 를 넘긴다."""
    inv.used_at = _now()
    inv.used_by = user_id
    await db.commit()


async def list_invites(db: AsyncSession) -> list[ProfessorInvite]:
    result = await db.execute(
        select(ProfessorInvite).order_by(ProfessorInvite.created_at.desc())
    )
    return list(result.scalars().all())


async def delete_invite(db: AsyncSession, invite_id: uuid.UUID) -> bool:
    """미사용 초대 취소(행 삭제). 존재하면 True. 이미 사용된 초대도 삭제 가능."""
    inv = await db.get(ProfessorInvite, invite_id)
    if inv is None:
        return False
    await db.delete(inv)
    await db.commit()
    return True
