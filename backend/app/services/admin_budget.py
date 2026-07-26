"""운영자 콘솔 예산 미터 — 스펙 13 §C-1 / 스펙 14 §E.

전역 $ 서킷 브레이커(`services/pipeline/budget.py`)가 얼마나 찼는지를 콘솔에서
읽기 전용으로 보여 준다. **집계 정의는 브레이커와 반드시 같아야 한다** — 미터가
60% 라는데 브레이커가 터지면 운영자가 원인을 못 찾는다. 그래서 아래 쿼리는
`budget.heygen_spend_usd` / `heygen_qa_spend_usd` / `visionstory_spend_usd` 의
필터를 그대로 옮긴 것이다(브레이커는 Celery 용 sync Session, 여기는 async).

in-flight 추정분은 **일부러 제외**한다. 브레이커는 폭주 방어를 위해 미완료 렌더를
추정 가산하지만, 콘솔 미터의 목적은 "이번 달 실제로 얼마 썼나"이므로 추정치가
섞이면 숫자가 흔들려 판단에 방해가 된다.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.cost_rates import effective_unit_costs
from app.models.cost_log import CostCategory, CostLog
from app.models.user import User, UserRole
from app.models.video_render import RenderCostLog

HEYGEN = "heygen"
VISIONSTORY = "visionstory"


def _day_start(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def _render_log_spend(db: AsyncSession, service: str, since: datetime) -> float:
    """render_cost_logs 합계 — 본문 렌더(HeyGen)."""
    total = (
        await db.execute(
            select(func.coalesce(func.sum(RenderCostLog.cost_usd), 0.0)).where(
                RenderCostLog.service == service,
                RenderCostLog.created_at >= since,
            )
        )
    ).scalar()
    return float(total or 0.0)


async def _qa_log_spend(db: AsyncSession, model: str, since: datetime) -> float:
    """platform_cost_logs(category=avatar_qa) 합계 — Q&A 아바타 렌더.

    HeyGen Q&A 는 VideoRender 가 없어 render_cost_logs 가 아니라 여기 적재된다.
    이걸 빼면 브레이커와 숫자가 어긋난다.
    """
    total = (
        await db.execute(
            select(func.coalesce(func.sum(CostLog.cost_usd), 0.0)).where(
                CostLog.category == CostCategory.avatar_qa,
                CostLog.model == model,
                CostLog.created_at >= since,
            )
        )
    ).scalar()
    return float(total or 0.0)


async def _tts_chars_this_month(db: AsyncSession, since: datetime) -> float:
    """이번 달 TTS 문자 수 — cost_usd 역산 (스펙 13 §C-0).

    TTS 는 `cost_usd = chars × rate / 1000` 으로 저장되므로 역산하면 자수가 나온다.
    ElevenLabs 크레딧은 **1 크레딧 = 1자**라 이 값이 곧 크레딧 소모량이다.
    """
    from app.services.cost_tracker import (
        ELEVENLABS_USD_PER_1K_CHARS,
        GOOGLE_TTS_USD_PER_1K_CHARS,
    )

    rates = {
        "elevenlabs": ELEVENLABS_USD_PER_1K_CHARS,
        "google_tts": GOOGLE_TTS_USD_PER_1K_CHARS,
    }
    total_chars = 0.0
    for service, rate in rates.items():
        if not rate:
            continue
        spent = (
            await db.execute(
                select(func.coalesce(func.sum(RenderCostLog.cost_usd), 0.0)).where(
                    RenderCostLog.service == service,
                    RenderCostLog.created_at >= since,
                )
            )
        ).scalar()
        total_chars += float(spent or 0.0) / rate * 1000.0
    return total_chars


async def _active_professor_count(db: AsyncSession) -> int:
    total = (
        await db.execute(
            select(func.count(User.id)).where(
                User.role == UserRole.professor,
                User.is_active.is_(True),
            )
        )
    ).scalar()
    return int(total or 0)


def _tts_account(chars_this_month: float, professors: int) -> dict:
    """ElevenLabs 계정 한도 대비 현황.

    크레딧 = 문자 수(1:1). 대시보드의 "분"은 영어 기준이라 한국어엔 약 3배 유리한데,
    우리는 문자 수로 재므로 환산이 필요 없다.
    """
    limit = settings.ELEVENLABS_MONTHLY_CREDITS
    ratio = (chars_this_month / limit) if limit else None
    per_prof = (chars_this_month / professors) if professors else 0.0
    return {
        "monthly_credit_limit": limit,
        "chars_this_month": round(chars_this_month),
        # 1.0 을 넘으면 초과분이 그대로 청구된다(계정 하드캡 없음).
        "usage_ratio": None if ratio is None else round(ratio, 3),
        "chars_per_professor": round(per_prof),
        # 이 소모율이 유지되면 한도의 몇 배가 되는가 — 플랜 업그레이드 신호.
        "over_limit": bool(ratio and ratio > 1.0),
    }


def _pct(spent: float, limit: float) -> float | None:
    """한도 대비 소진율(%). 한도 0/미설정이면 None(브레이커 비활성)."""
    if not limit or limit <= 0:
        return None
    return round(spent / limit * 100, 1)


def _headroom_professors(
    monthly_limit: float, spent_month: float, per_professor: float
) -> int | None:
    """남은 예산으로 몇 명을 더 감당할 수 있는지(현재 1인당 소진 기준).

    "몇 명까지 더 초대해도 되나"를 눈으로 판단하기 위한 값이다. 1인당 소진이 0이면
    (아직 아무도 렌더를 안 돌림) 추정 근거가 없으므로 None.
    """
    if not monthly_limit or monthly_limit <= 0 or per_professor <= 0:
        return None
    remaining = monthly_limit - spent_month
    if remaining <= 0:
        return 0
    return int(remaining // per_professor)


async def budget_overview(db: AsyncSession, now: datetime | None = None) -> dict:
    """예산 미터 — 서비스별 일/월 소진율 + 활성 교수자 수 대비 1인당 소진.

    전역 브레이커라 **한 명이 한도를 채우면 나머지 전원의 렌더가 동시에 멈춘다.**
    그래서 인원을 늘리기 전에 이 값을 보고 예산을 먼저 올려야 한다(스펙 13 §C-1).
    """
    now = now or datetime.now(timezone.utc)
    day0 = _day_start(now)
    month0 = _month_start(now)
    professors = await _active_professor_count(db)
    tts_chars = await _tts_chars_this_month(db, month0)

    # HeyGen — 본문 렌더 + Q&A 아바타 렌더(브레이커와 동일 정의).
    hg_day = await _render_log_spend(db, HEYGEN, day0) + await _qa_log_spend(db, HEYGEN, day0)
    hg_month = await _render_log_spend(db, HEYGEN, month0) + await _qa_log_spend(db, HEYGEN, month0)

    # VisionStory — Q&A 렌더만(본문은 HeyGen 을 쓰지 않는다).
    vs_day = await _qa_log_spend(db, VISIONSTORY, day0)
    vs_month = await _qa_log_spend(db, VISIONSTORY, month0)

    def _entry(
        service: str,
        daily_limit: float,
        monthly_limit: float,
        spent_day: float,
        spent_month: float,
        unit_cost: float,
        mock: bool,
    ) -> dict:
        per_prof = round(spent_month / professors, 4) if professors else 0.0
        return {
            "service": service,
            "mock": mock,  # mock 이면 실비용 0 — 브레이커도 건너뛴다.
            # 지금 실제로 적용 중인 단가. 코드 기본값과 env override 가 갈려도
            # 이 값으로 드러난다(스펙 13 §C-1a).
            "effective_unit_cost_usd_per_second": unit_cost,
            "daily_budget_usd": daily_limit,
            "spent_today_usd": round(spent_day, 4),
            "day_pct": _pct(spent_day, daily_limit),
            "monthly_budget_usd": monthly_limit,
            "spent_month_usd": round(spent_month, 4),
            "month_pct": _pct(spent_month, monthly_limit),
            "per_professor_month_usd": per_prof,
            "headroom_professors": _headroom_professors(
                monthly_limit, spent_month, per_prof
            ),
        }

    return {
        "generated_at": now.isoformat(),
        "active_professor_count": professors,
        # 미터가 이 임계를 넘으면 콘솔이 경고를 띄운다(스펙 14 §E).
        "warn_threshold_pct": 80,
        # 단가 드리프트 감시 — VisionStory 단가는 HeyGen 에서 유도된 값이라
        # 한쪽만 env override 되면 코드가 전제하는 2배 관계가 깨진다.
        # 콘솔이 ratio_consistent=false 면 경고를 띄운다.
        "unit_costs": effective_unit_costs(),
        # ElevenLabs 계정 한도 대비 소모 — **하드캡이 아니다**(usage-based billing ON).
        # 배수가 1을 넘기 시작하면 플랜 업그레이드 시점이다(§C-0).
        "tts_account": _tts_account(tts_chars, professors),
        "services": [
            _entry(
                HEYGEN,
                settings.HEYGEN_DAILY_BUDGET_USD,
                settings.HEYGEN_MONTHLY_BUDGET_USD,
                hg_day,
                hg_month,
                settings.HEYGEN_COST_USD_PER_SECOND,
                settings.HEYGEN_MOCK,
            ),
            _entry(
                VISIONSTORY,
                settings.VISIONSTORY_DAILY_BUDGET_USD,
                settings.VISIONSTORY_MONTHLY_BUDGET_USD,
                vs_day,
                vs_month,
                settings.VISIONSTORY_COST_USD_PER_SECOND,
                settings.VISIONSTORY_MOCK,
            ),
        ],
    }
