"""교수자 가입 초대 서비스 (베타 게이트).

계정주가 단일 사용 초대 토큰을 발급하고, OAuth 가입 흐름이 그 토큰을 검증·소비한다.
학습자 가입은 이 게이트와 무관하다.

초대는 두 형태다 — **공개 초대**(email 미지정: 링크를 연 첫 1명이 가입)와
**이메일 지정 초대**(그 이메일만 가입). 공개 초대는 이메일 잠금이 없어 토큰이 곧
자격증명이므로, 단일 사용을 원자적으로 보장하는 ``claim_invite`` 가 핵심이다.
"""
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
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
    email: str | None,
    created_by: uuid.UUID | None,
    role: str = "professor",
    ttl_days: int | None = None,
    cohort: str | None = None,
) -> ProfessorInvite:
    """단일 사용 초대 생성. 토큰은 추측 불가한 난수(``secrets.token_urlsafe(32)``).

    ``email`` 이 None 이면 **공개 초대** — 대상을 잠그지 않고 링크를 연 첫 1명이
    가입한다. 값이 있으면 그 이메일의 Google 계정만 가입할 수 있다.

    ``cohort`` 는 베타 코호트 태그(예: "2026-08") — 가입 시 교수자 users.cohort 로
    전파한다(없으면 NULL).
    """
    days = settings.PROFESSOR_INVITE_TTL_DAYS if ttl_days is None else ttl_days
    expires_at = _now() + timedelta(days=days) if days and days > 0 else None
    normalized_email = (email or "").strip().lower() or None
    inv = ProfessorInvite(
        id=uuid.uuid4(),
        token=secrets.token_urlsafe(32),
        email=normalized_email,
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
    """미사용·미만료 초대면 반환, 아니면 None.

    - **공개 초대**(``inv.email is None``): 이메일을 대조하지 않는다. 링크를 가진
      사람이면 누구나 통과하고, 실제 1인 제한은 ``claim_invite`` 가 건다.
    - **이메일 지정 초대**: Google 이메일과 일치해야 한다(대소문자 무시 — 발급·소비
      양쪽에서 소문자 정규화).

    주의: 이 함수는 **읽기 검증일 뿐 자리를 잡지 않는다.** 같은 링크를 동시에 연 두
    사람은 둘 다 여기를 통과할 수 있으므로, 가입을 확정하기 직전에 반드시
    ``claim_invite`` 로 원자적 소비를 시도해야 한다.
    """
    if not token:
        return None
    inv = await get_invite_by_token(db, token)
    if inv is None:
        return None
    if invite_status(inv) != "active":
        return None
    if inv.email is not None and inv.email != (email or "").strip().lower():
        return None
    return inv


async def claim_invite(db: AsyncSession, invite_id: uuid.UUID) -> bool:
    """초대를 **원자적으로** 사용 처리한다. 성공(내가 첫 사용자)이면 True.

    `used_at IS NULL` 을 WHERE 에 넣은 조건부 UPDATE 라, 같은 초대를 동시에 노린
    요청이 여럿이어도 DB 가 한 건만 갱신한다(나머지는 rowcount 0 → False).

    파이썬 쪽에서 `if status == active: inv.used_at = now()` 로 처리하면 두 요청이
    모두 검사를 통과한 뒤 각자 UPDATE 를 날려 **한 초대로 두 명이 가입**한다.
    공개 초대는 이메일 잠금이 없어 이 경합이 곧 게이트 무력화이므로 조건부 UPDATE 가
    필수다.

    ``used_by`` 는 유저 생성 후에 ``attach_invite_user`` 로 채운다 — 자리를 먼저
    잡아야 그 사이에 다른 사람이 끼어들지 못한다.
    """
    result = await db.execute(
        update(ProfessorInvite)
        .where(ProfessorInvite.id == invite_id, ProfessorInvite.used_at.is_(None))
        .values(used_at=_now())
    )
    await db.commit()
    return (result.rowcount or 0) == 1


async def attach_invite_user(
    db: AsyncSession, invite_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    """claim 으로 잡아 둔 초대에 실제 가입한 유저를 연결한다(감사 추적용)."""
    await db.execute(
        update(ProfessorInvite)
        .where(ProfessorInvite.id == invite_id)
        .values(used_by=user_id)
    )
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
