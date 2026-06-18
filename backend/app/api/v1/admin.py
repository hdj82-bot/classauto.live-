"""관리자 전용 API."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.redis import get_redis
from app.db.session import get_db
from app.models.admin_audit_log import AdminAuditLog
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.user import User, UserRole
from app.models.video_render import VideoRender
from app.services import admin_analytics
from app.services.admin_audit import log_admin_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# I: 관리자 통계 Redis 캐시
_STATS_CACHE_KEY = "admin:stats"
_STATS_CACHE_TTL_SECONDS = 300  # 5분


# ── GET /api/v1/admin/stats ──────────────────────────────────────────────────


@router.get("/stats")
async def get_stats(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """전체 통계: 총 사용자, 강좌, 강의, 세션, 렌더링 수.

    I: COUNT(*) 5개를 매 요청마다 풀 스캔 — Redis 5분 TTL 캐시. 캐시 미스/장애 시 fresh.
    """
    from app.models.session import LearningSession

    # ── I: 캐시 조회 ──
    redis_client = None
    try:
        redis_client = get_redis()
        cached = await redis_client.get(_STATS_CACHE_KEY)
        if cached:
            try:
                payload = json.loads(cached)
                payload["_cached"] = True
                return payload
            except (TypeError, ValueError):
                logger.warning("admin:stats 캐시 파싱 실패 — fresh 조회로 폴백")
    except Exception as exc:
        logger.warning("admin:stats 캐시 조회 실패: %s — fresh 조회로 폴백", exc)

    users_count = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    courses_count = (await db.execute(select(func.count()).select_from(Course))).scalar() or 0
    lectures_count = (await db.execute(select(func.count()).select_from(Lecture))).scalar() or 0
    sessions_count = (await db.execute(select(func.count()).select_from(LearningSession))).scalar() or 0
    renders_count = (await db.execute(select(func.count()).select_from(VideoRender))).scalar() or 0

    payload = {
        "total_users": users_count,
        "total_courses": courses_count,
        "total_lectures": lectures_count,
        "total_sessions": sessions_count,
        "total_renders": renders_count,
    }

    # ── I: 캐시 갱신 (실패는 무시) ──
    if redis_client is not None:
        try:
            await redis_client.set(
                _STATS_CACHE_KEY,
                json.dumps(payload),
                ex=_STATS_CACHE_TTL_SECONDS,
            )
        except Exception as exc:
            logger.warning("admin:stats 캐시 저장 실패: %s", exc)

    return payload


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

    old_role = user.role.value
    old_is_active = user.is_active
    role_changed = False

    if role is not None:
        try:
            new_role = UserRole(role)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"유효하지 않은 역할: {role}. (professor, student, admin)",
            )
        role_changed = new_role.value != old_role
        user.role = new_role

    if is_active is not None:
        user.is_active = is_active

    await db.flush()
    await db.commit()

    # E: god-mode 추적 — 역할 변경/활성 상태 변경을 감사 로그에 남긴다.
    if role_changed:
        await log_admin_action(
            db,
            _admin,
            "user.update_role",
            target_type="user",
            target_id=str(user.id),
            detail={"email": user.email, "from": old_role, "to": user.role.value},
        )
    if is_active is not None and is_active != old_is_active:
        await log_admin_action(
            db,
            _admin,
            "user.set_active",
            target_type="user",
            target_id=str(user.id),
            detail={"email": user.email, "from": old_is_active, "to": user.is_active},
        )

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
    await db.commit()

    # E: god-mode 추적 — 유저 (소프트)삭제를 감사 로그에 남긴다.
    await log_admin_action(
        db,
        _admin,
        "user.delete",
        target_type="user",
        target_id=str(user.id),
        detail={"email": user.email},
    )

    return {
        "id": str(user.id),
        "email": user.email,
        "is_active": user.is_active,
        "detail": "사용자가 비활성화되었습니다.",
    }


# ── GET /api/v1/admin/costs ──────────────────────────────────────────────────


# T6: 비용 집계는 최근 1년만 — 행이 누적될수록 GROUP BY 스캔이 무거워지므로
# 시간 윈도우로 입력 행 수 자체를 제한한다. 0014 의 ix_render_cost_logs_created_at
# 인덱스가 WHERE created_at >= start_date 의 인덱스 스캔을 백킹.
COSTS_WINDOW_DAYS = 365


@router.get("/costs")
async def get_costs(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """전체 API 비용 집계 (서비스별/월별, 최근 12개월) — B: 두 비용 테이블 통합.

    ``render_cost_logs`` (HeyGen/VisionStory 등) 와 ``platform_cost_logs``
    (LLM/STT/TTS 등)를 **모두 합산**한다. 종전엔 render 만 집계해 LLM 비용이
    빠졌다. 각 by_service 행에 ``source``(render/platform)를 남겨 검증 가능하게 한다.

    T6: ``WHERE created_at >= today - 365d`` 로 입력 행 수를 제한(두 테이블 동일 윈도우).
    인덱스 ``ix_render_cost_logs_created_at`` (0014) / ``ix_platform_cost_logs_created_at``
    (0056) 가 시간 필터 핫 패스를 백킹.
    """
    start_date = datetime.now(timezone.utc) - timedelta(days=COSTS_WINDOW_DAYS)
    breakdown = await admin_analytics.spend_breakdown(db, since=start_date, month_limit=12)

    return {
        "total_cost_usd": breakdown["total_cost_usd"],
        "window_days": COSTS_WINDOW_DAYS,
        # 기존 프론트 호환: service 키 유지 + source 추가(render/platform).
        "by_service": [
            {"service": row["name"], "source": row["source"], "cost_usd": row["cost_usd"]}
            for row in breakdown["by_service"]
        ],
        "by_month": breakdown["by_month"],
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


# ── GET /api/v1/admin/heygen-health ──────────────────────────────────────────


@router.get("/heygen-health")
async def get_heygen_health(_admin: User = Depends(require_admin)):
    """HeyGen 연결 진단 — 키 설정 여부 + 실제 API 호출(잔여 크레딧)로 연결 확인.

    "아바타가 안 만들어진다" 류 문제를 빠르게 좁히기 위한 관리자 진단:
    - ``api_key_set``: HEYGEN_API_KEY 가 설정돼 있는지.
    - ``mock``: HEYGEN_MOCK(실제 호출 생략 모드)인지.
    - ``ok`` / ``remaining_quota``: get_remaining_quota 호출 성공 + 잔여 크레딧.
    - ``error``: 실패 사유(401=키 오류, 그 외=HeyGen 측 오류/통신 실패).
    크레딧은 사용량 정보라 관리자(require_admin)만 조회한다.
    """
    from app.core.config import settings

    result: dict = {
        "api_key_set": bool(settings.HEYGEN_API_KEY),
        "mock": settings.HEYGEN_MOCK,
        "base_url": settings.HEYGEN_BASE_URL,
        "daily_budget_usd": settings.HEYGEN_DAILY_BUDGET_USD,
        "monthly_budget_usd": settings.HEYGEN_MONTHLY_BUDGET_USD,
        "ok": False,
        "remaining_quota": None,
        "error": None,
    }
    if settings.HEYGEN_MOCK:
        result["error"] = "HEYGEN_MOCK 이 켜져 있어 실제 HeyGen 호출을 생략합니다."
        return result
    if not settings.HEYGEN_API_KEY:
        result["error"] = "HEYGEN_API_KEY 가 설정되지 않았습니다."
        return result

    from app.services.pipeline.heygen import HeyGenError, get_remaining_quota

    try:
        quota = await get_remaining_quota()
        result["ok"] = True
        result["remaining_quota"] = quota.get("remaining_quota")
    except HeyGenError as e:
        result["error"] = str(e)
    return result


# ── A: GET /api/v1/admin/beta-overview ───────────────────────────────────────


@router.get("/beta-overview")
async def get_beta_overview(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    cohort: str | None = Query(default=None),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """베타 테스터(교수자)별 사용량·지출 롤업 (A).

    교수자별 강의/렌더 수 + 이번달·누적·월평균 지출(두 비용 테이블 합산) +
    마지막 활동. ``?cohort=`` 필터, 페이지네이션.
    """
    rows = await admin_analytics.instructor_rollup(db, cohort=cohort)
    total = len(rows)
    start = (page - 1) * limit
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "cohort": cohort,
        "instructors": rows[start : start + limit],
    }


# ── A: GET /api/v1/admin/users/{user_id}/usage ───────────────────────────────


@router.get("/users/{user_id}/usage")
async def get_user_usage(
    user_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """단일 테스터 드릴다운 — 강의 목록 + 월별 지출 시계열 (A)."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")

    # 강의 목록(소유 강좌의 강의). 강좌명·발행 여부 포함.
    lec_rows = (
        await db.execute(
            select(
                Lecture.id,
                Lecture.title,
                Lecture.is_published,
                Lecture.created_at,
                Lecture.updated_at,
                Course.title,
            )
            .join(Course, Lecture.course_id == Course.id)
            .where(Course.instructor_id == user_id)
            .order_by(Lecture.updated_at.desc())
        )
    ).all()
    lectures = [
        {
            "id": str(r[0]),
            "title": r[1],
            "is_published": r[2],
            "created_at": r[3].isoformat() if r[3] else None,
            "updated_at": r[4].isoformat() if r[4] else None,
            "course_title": r[5],
        }
        for r in lec_rows
    ]

    monthly_spend = await admin_analytics.instructor_monthly_spend(db, user_id)
    spend_total = sum(m["cost_usd"] for m in monthly_spend)

    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role.value,
        "cohort": user.cohort,
        "beta_consented_at": user.beta_consented_at.isoformat()
        if user.beta_consented_at
        else None,
        "lectures_count": len(lectures),
        "lectures": lectures,
        "spend_total_usd": round(spend_total, 4),
        "monthly_spend": monthly_spend,
    }


# ── D: GET /api/v1/admin/funnel ──────────────────────────────────────────────


@router.get("/funnel")
async def get_funnel(
    cohort: str | None = Query(default=None),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """베타 활성화 퍼널 — 5단계 카운트 + 단계별 전이율 (D). ``?cohort=`` 필터."""
    return await admin_analytics.funnel(db, cohort=cohort)


# ── E: GET /api/v1/admin/audit ───────────────────────────────────────────────


@router.get("/audit")
async def list_audit_logs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    action: str | None = Query(default=None),
    actor: str | None = Query(default=None, description="actor 이메일 부분 일치"),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """운영자 감사 로그 목록 (E) — 페이지네이션, action/actor 필터."""
    stmt = select(AdminAuditLog)
    count_stmt = select(func.count()).select_from(AdminAuditLog)

    filters = []
    if action:
        filters.append(AdminAuditLog.action == action)
    if actor:
        filters.append(AdminAuditLog.actor_email.ilike(f"%{actor.strip().lower()}%"))
    for f in filters:
        stmt = stmt.where(f)
        count_stmt = count_stmt.where(f)

    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.order_by(AdminAuditLog.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "logs": [
            {
                "id": str(a.id),
                "actor_id": str(a.actor_id) if a.actor_id else None,
                "actor_email": a.actor_email,
                "action": a.action,
                "target_type": a.target_type,
                "target_id": a.target_id,
                "detail": a.detail,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in rows
        ],
    }


# ── C-2: POST /api/v1/admin/lectures/{lecture_id}/reset-avatar-rerender ───────


@router.post("/lectures/{lecture_id}/reset-avatar-rerender")
async def reset_avatar_rerender(
    lecture_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """강의의 아바타 제작 횟수 카운터를 0 으로 리셋 (C-2 운영자 오버라이드).

    교수자가 강의당 제작 횟수 상한(AVATAR_RERENDER_MAX_PER_LECTURE)에 도달했을 때
    계정주가 개별 허용한다. 이 행위는 E 감사 로그에 1행 남긴다.
    """
    lecture = await db.get(Lecture, lecture_id)
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="강의를 찾을 수 없습니다."
        )

    previous = int(lecture.avatar_render_count or 0)
    lecture.avatar_render_count = 0
    await db.flush()
    await db.commit()

    await log_admin_action(
        db,
        _admin,
        "lecture.reset_avatar_rerender",
        target_type="lecture",
        target_id=str(lecture_id),
        detail={"previous_count": previous, "title": lecture.title},
    )

    return {
        "lecture_id": str(lecture_id),
        "previous_count": previous,
        "avatar_render_count": 0,
        "detail": "아바타 제작 횟수가 초기화되었습니다.",
    }
