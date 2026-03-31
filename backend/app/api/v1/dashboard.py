"""교수자 대시보드 API (NestJS DashboardController 포팅)."""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor
from app.db.session import get_db
from app.models.user import User
from app.services import dashboard as dashboard_svc

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/{lecture_id}/attendance", summary="출석 분석")
async def get_attendance(
    lecture_id: uuid.UUID,
    live_deadline_min: int = Query(30),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    return await dashboard_svc.get_attendance(db, lecture_id, live_deadline_min)


@router.get("/{lecture_id}/scores", summary="정답률/오답 분석")
async def get_scores(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    return await dashboard_svc.get_scores(db, lecture_id)


@router.get("/{lecture_id}/engagement", summary="참여도 분석")
async def get_engagement(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    return await dashboard_svc.get_engagement(db, lecture_id)


@router.get("/{lecture_id}/qa", summary="Q&A 로그 조회")
async def get_qa_logs(
    lecture_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    return await dashboard_svc.get_qa_logs(db, lecture_id, page, limit)


@router.get("/{lecture_id}/cost", summary="비용 미터")
async def get_cost(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    return await dashboard_svc.get_cost(db, lecture_id)
