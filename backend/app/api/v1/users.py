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
    # 프론트 신원 표시(H4)용 — Topbar 이니셜·플레이어 학생 이름, 분석 PRO/종합보고서
    # 노출 게이트(이메일 허용목록 canSeeAnalyticsPro)가 이 값을 쓴다. JWT 에는 sub·role
    # 만 있어 프론트가 email/name 을 빈 문자열로 두던 문제를, /me 가 채워 보강한다.
    email: str
    name: str
    # 학생 첫 사용 온보딩(영상 시청 4슬라이드 안내)을 "다시 보지 않기" 한 시각.
    # null = 아직 안 함(진입 시 안내 표시). 값이 있으면 영구 스킵.
    onboarded_at: datetime | None


def _to_me(user: User) -> MeResponse:
    return MeResponse(
        id=str(user.id),
        role=user.role.value,
        email=user.email,
        name=user.name,
        onboarded_at=user.onboarded_at,
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
