"""사용자 본인(/me) API — 온보딩 등 개인 설정."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter(prefix="/api/v1/users", tags=["users"])


class MeResponse(BaseModel):
    id: str
    role: str
    # 학생 첫 사용 온보딩(영상 시청 4슬라이드 안내)을 "다시 보지 않기" 한 시각.
    # null = 아직 안 함(진입 시 안내 표시). 값이 있으면 영구 스킵.
    onboarded_at: datetime | None
    # 베타 학습 분석 PRO 노출 여부(운영자 토글). 프론트가 메뉴/페이지 노출 판단에 쓴다.
    analytics_pro_enabled: bool = False


def _to_me(user: User) -> MeResponse:
    return MeResponse(
        id=str(user.id),
        role=user.role.value,
        onboarded_at=user.onboarded_at,
        analytics_pro_enabled=bool(user.analytics_pro_enabled),
    )


@router.get("/me", summary="본인 정보(온보딩 상태 등)")
async def get_me(current_user: User = Depends(get_current_user)) -> MeResponse:
    return _to_me(current_user)


@router.post("/me/onboarded", summary="온보딩 안내 영구 스킵 표시")
async def mark_onboarded(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    """온보딩 안내(영상 시청 4슬라이드)를 "다시 보지 않기".

    ``users.onboarded_at`` 을 현재 시각으로 채워, 이후 영상 시청 진입 시 안내를 띄우지
    않는다(기기·세션 무관 영구). localStorage 금지(CLAUDE.md)라 서버에 저장한다.
    멱등 — 이미 채워져 있으면 그대로 둔다.
    """
    if current_user.onboarded_at is None:
        current_user.onboarded_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(current_user)
    return _to_me(current_user)
