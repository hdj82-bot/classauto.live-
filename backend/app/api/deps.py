import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import get_redis
from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)

_BL_PREFIX = "bl:"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 정보가 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 Access Token입니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access Token이 아닙니다.",
        )

    jti = payload.get("jti")
    if jti:
        r = get_redis()
        if await r.exists(f"{_BL_PREFIX}{jti}"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="로그아웃된 토큰입니다.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    result = await db.execute(
        select(User).where(User.id == uuid.UUID(payload["sub"]))
    )
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="존재하지 않거나 비활성화된 유저입니다.",
        )
    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """토큰이 있으면 사용자를, 없거나 무효하면 ``None`` 을 반환(에러 없음).

    익명 접근을 허용하되 로그인 사용자는 식별해야 하는 엔드포인트용 — 예:
    공개 강의 조회는 누구나 가능하지만, 소유 교수자에겐 미발행 강의도 보여주는
    "미리보기" 동작. 어떤 경우에도 401 을 던지지 않는다.
    """
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            return None
        jti = payload.get("jti")
        if jti:
            r = get_redis()
            if await r.exists(f"{_BL_PREFIX}{jti}"):
                return None
        result = await db.execute(
            select(User).where(User.id == uuid.UUID(payload["sub"]))
        )
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            return None
        return user
    except Exception:  # noqa: BLE001 — 선택적 인증은 어떤 이유로든 실패 시 익명 처리.
        return None


async def require_professor(user: User = Depends(get_current_user)) -> User:
    if user.role.value != "professor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="교수자 권한이 필요합니다.",
        )
    return user


async def require_student(user: User = Depends(get_current_user)) -> User:
    if user.role.value != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="학습자 권한이 필요합니다.",
        )
    return user


async def require_analytics_pro(user: User = Depends(require_professor)) -> User:
    """학습 분석 PRO(베타 전용) 접근 — 교수자 + 운영자 토글(analytics_pro_enabled).

    교수자라도 운영자가 켜지 않은 계정은 403. 베타테스터 한정 노출 게이트
    (docs/planning/analytics-spec.md, 운영자 콘솔에서 per-user on/off).
    """
    if not user.analytics_pro_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="학습 분석 PRO 미활성 계정입니다(운영자 활성화 필요).",
        )
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다.",
        )
    return user


async def require_owner(user: User = Depends(get_current_user)) -> User:
    """계정주(운영자) 전용 — ADMIN_EMAILS 의 이메일이거나 admin 역할.

    역할(admin)과 무관하게 ADMIN_EMAILS 로 식별하므로, 운영자가 교수자
    계정이어도 초대 발급 권한을 갖는다(베타 게이트 운영용).
    """
    email = (user.email or "").strip().lower()
    if email in settings.admin_email_set or user.role.value == "admin":
        return user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="운영자 권한이 필요합니다.",
    )
