"""관리자 전용 API."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import extract, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.db.session import get_db
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.user import User, UserRole
from app.models.video_render import RenderCostLog, VideoRender

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ── GET /api/v1/admin/stats ──────────────────────────────────────────────────


@router.get("/stats")
async def get_stats(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """전체 통계: 총 사용자, 강좌, 강의, 세션, 렌더링 수."""
    from app.models.session import LearningSession

    users_count = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    courses_count = (await db.execute(select(func.count()).select_from(Course))).scalar() or 0
    lectures_count = (await db.execute(select(func.count()).select_from(Lecture))).scalar() or 0
    sessions_count = (await db.execute(select(func.count()).select_from(LearningSession))).scalar() or 0
    renders_count = (await db.execute(select(func.count()).select_from(VideoRender))).scalar() or 0

    return {
        "total_users": users_count,
        "total_courses": courses_count,
        "total_lectures": lectures_count,
        "total_sessions": sessions_count,
        "total_renders": renders_count,
    }


# ── GET /api/v1/admin/users ──────────────────────────────────────────────────


@router.get("/users")
async def list_users(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    role: str | None = Query(default=None),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """사용자 목록 (페이지네이션, 역할 필터)."""
    stmt = select(User)
    count_stmt = select(func.count()).select_from(User)

    if role:
        stmt = stmt.where(User.role == role)
        count_stmt = count_stmt.where(User.role == role)

    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    users = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "users": [
            {
                "id": str(u.id),
                "email": u.email,
                "name": u.name,
                "role": u.role.value,
                "school": u.school,
                "department": u.department,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }


# ── PATCH /api/v1/admin/users/{user_id} ─────────────────────────────────────


@router.patch("/users/{user_id}")
async def update_user(
    user_id: uuid.UUID,
    role: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """사용자 역할 변경 / 비활성화."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")

    if role is not None:
        try:
            user.role = UserRole(role)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"유효하지 않은 역할: {role}. (professor, student, admin)",
            )

    if is_active is not None:
        user.is_active = is_active

    await db.flush()
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role.value,
        "is_active": user.is_active,
    }


# ── DELETE /api/v1/admin/users/{user_id} ────────────────────────────────────


@router.delete("/users/{user_id}", status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """사용자 소프트 삭제 (is_active=False). 자기 자신은 삭제 불가."""
    if user_id == _admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="자기 자신의 계정은 삭제할 수 없습니다.",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")

    user.is_active = False
    await db.flush()
    return {
        "id": str(user.id),
        "email": user.email,
        "is_active": user.is_active,
        "detail": "사용자가 비활성화되었습니다.",
    }


# ── GET /api/v1/admin/costs ──────────────────────────────────────────────────


@router.get("/costs")
async def get_costs(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """전체 API 비용 집계 (서비스별, 월별)."""
    # 서비스별 합계
    by_service_stmt = (
        select(RenderCostLog.service, func.sum(RenderCostLog.cost_usd))
        .group_by(RenderCostLog.service)
        .order_by(func.sum(RenderCostLog.cost_usd).desc())
    )
    by_service_rows = (await db.execute(by_service_stmt)).all()

    # 월별 합계
    by_month_stmt = (
        select(
            extract("year", RenderCostLog.created_at).label("year"),
            extract("month", RenderCostLog.created_at).label("month"),
            func.sum(RenderCostLog.cost_usd).label("total"),
        )
        .group_by("year", "month")
        .order_by(text("year DESC, month DESC"))
        .limit(12)
    )
    by_month_rows = (await db.execute(by_month_stmt)).all()

    total_cost = sum(row[1] or 0 for row in by_service_rows)

    return {
        "total_cost_usd": round(total_cost, 4),
        "by_service": [
            {"service": row[0], "cost_usd": round(row[1] or 0, 4)}
            for row in by_service_rows
        ],
        "by_month": [
            {"year": int(row.year), "month": int(row.month), "cost_usd": round(row.total or 0, 4)}
            for row in by_month_rows
        ],
    }


# ── GET /api/v1/admin/system ─────────────────────────────────────────────────


@router.get("/system")
async def get_system_status(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """시스템 상태 (DB 크기, Redis 메모리, Celery 큐 길이)."""
    from app.core.config import settings

    system = {}

    # DB 크기 (PostgreSQL)
    try:
        result = await db.execute(
            text("SELECT pg_database_size(current_database())")
        )
        db_size_bytes = result.scalar() or 0
        system["db_size_mb"] = round(db_size_bytes / (1024 * 1024), 2)
    except Exception:
        system["db_size_mb"] = None

    # Redis 메모리
    try:
        import redis as redis_lib

        r = redis_lib.from_url(settings.REDIS_URL, socket_timeout=2)
        info = r.info("memory")
        system["redis_used_memory_mb"] = round(info.get("used_memory", 0) / (1024 * 1024), 2)
        system["redis_connected_clients"] = r.info("clients").get("connected_clients", 0)
    except Exception:
        system["redis_used_memory_mb"] = None
        system["redis_connected_clients"] = None

    # Celery 큐 길이
    try:
        import redis as redis_lib

        r = redis_lib.from_url(settings.REDIS_URL, socket_timeout=2)
        celery_queue_len = r.llen("celery")
        system["celery_queue_length"] = celery_queue_len
    except Exception:
        system["celery_queue_length"] = None

    return system
