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


async def require_analytics_pro(user: User = Depends(require_professor)) -> User:
    """학습 분석 PRO 접근 게이트 — 현 단계는 계정주·명시 허용 이메일만.

    docs/planning/analytics-spec.md. 판정 순서:
    1. 전역 ``ANALYTICS_PRO_ENABLED`` 가 False 면 운영자(ADMIN_EMAILS)만 통과(인시던트 차단).
    2. 운영자(ADMIN_EMAILS) + 명시 허용 이메일(``ANALYTICS_PRO_ALLOWED_EMAILS``)은 통과.
       → 현재 실기능은 계정주 두 계정(classauto101@gmail.com·hdj82@kyonggi.ac.kr)에만 노출.
    3. **곧 시작할 베타테스터**는 ``ANALYTICS_PRO_OPEN_TO_TESTERS`` 가 켜질 때(정식 오픈)에만,
       그것도 운영자 콘솔 토글(``analytics_pro_enabled``)이 켜진 경우 통과. 기본값 False 라
       지금은 토글이 켜져 있어도 베타테스터에겐 보이지 않는다(요구사항).

    require_professor 에 의존하므로 학생·미인증은 그 단계에서 이미 차단된다.
    """
    email = (user.email or "").strip().lower()
    is_owner = email in settings.admin_email_set

    if not settings.ANALYTICS_PRO_ENABLED:
        if is_owner:
            return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="학습 분석 PRO 기능이 현재 비활성화되어 있습니다.",
        )

    if is_owner or email in settings.analytics_pro_allowed_email_set:
        return user

    if settings.ANALYTICS_PRO_OPEN_TO_TESTERS and getattr(user, "analytics_pro_enabled", False):
        return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="학습 분석 PRO 베타 권한이 없습니다.",
    )


def require_plan(*allowed_plans: str):
    """플랜 차등 게이트 팩토리 — 지정 플랜만 통과(정식 런칭용 인프라).

    AVATAR_VOICE_FEATURE_ROADMAP.md 의 Free/Basic/Pro 차등(커스텀 아바타·음성 클론은
    Basic/Pro 한정)을 위한 의존성. **베타는 결제 UI 가 가려져 전원 무제한**이므로
    전역 ``settings.PLAN_GATING_ENABLED`` 가 기본 False — 그 동안은 게이팅을 하지 않고
    전원 통과한다(라이브 베타테스터 접근을 깨지 않는다). 정식 런칭 시 플래그를 켜면
    구독 플랜으로 실제 게이팅한다. 운영자(ADMIN_EMAILS)는 플래그·플랜과 무관하게 통과.

    ``allowed_plans`` 는 PlanType 값(대소문자 무시). 예: ``require_plan("basic", "pro")``.
    교수자 전용 기능에 붙이므로 require_professor 에 의존한다(학생·미인증은 그 단계 차단).
    """
    allowed = {p.strip().lower() for p in allowed_plans}

    async def _checker(
        user: User = Depends(require_professor),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if not settings.PLAN_GATING_ENABLED:
            return user  # 베타: 게이팅 비활성 — 전원 통과
        email = (user.email or "").strip().lower()
        if email in settings.admin_email_set:
            return user
        # 로컬 import — 서비스가 모델을 import 하므로 deps 상단 import 시 순환 위험 회피.
        from app.services.pipeline.subscription import get_or_create_subscription

        sub = await get_or_create_subscription(db, user.id)
        if sub.plan.value.lower() not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"이 기능은 {'/'.join(sorted(p.upper() for p in allowed))} 플랜에서 사용할 수 있습니다.",
            )
        return user

    return _checker


async def require_student(user: User = Depends(get_current_user)) -> User:
    if user.role.value != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="학습자 권한이 필요합니다.",
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
