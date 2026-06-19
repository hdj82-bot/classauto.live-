"""HeyGen 예산 서킷 브레이커.

create_video 직전에 누적 HeyGen 비용을 검사해 일/월 한도를 넘으면 차단한다.
HeyGen 비용은 render_cost_logs 에 ``service="heygen"`` 으로 기록되므로
(제출 시 operation="heygen_submit" cost 0, 완료 시 operation="video_render" 실비용),
해당 행들을 시간 윈도로 합산한다.

한계: 비용은 영상 완료 시점에 기록되므로, 아직 완료되지 않은 in-flight 렌더는
합계에 잡히지 않는다. 짧은 시간에 다수 제출이 몰리면 한도를 일시적으로 초과할 수
있으나, 실질 하드캡은 HeyGen 계정 잔액(auto-refill OFF)이며 이 브레이커는
재시도 루프·실수 대량 생성 같은 사고를 막는 2차 방어선이다.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.lecture import Lecture
from app.models.qa_answer_cache import QAAnswerCache
from app.models.user import User
from app.models.video_render import RenderCostLog

logger = logging.getLogger(__name__)

_HEYGEN_SERVICE = "heygen"


class BudgetExceededError(Exception):
    """HeyGen 일/월 예산 한도 초과 — create_video 차단."""


class QARenderQuotaError(BudgetExceededError):
    """교수자 월 Q&A 아바타 렌더 한도 초과 — 야간 배치 렌더 차단."""


class AvatarRerenderQuotaError(BudgetExceededError):
    """강의당 아바타 제작(렌더 패스) 횟수 상한 초과 — 재제작 차단(C-2)."""


def heygen_spend_usd(db: Session, since: datetime) -> float:
    """``since`` 이후 기록된 HeyGen 비용 합계(USD)."""
    total = db.execute(
        select(func.coalesce(func.sum(RenderCostLog.cost_usd), 0.0)).where(
            RenderCostLog.service == _HEYGEN_SERVICE,
            RenderCostLog.created_at >= since,
        )
    ).scalar()
    return float(total or 0.0)


def assert_heygen_budget(db: Session, *, now: datetime | None = None) -> None:
    """일/월 한도 초과 시 ``BudgetExceededError`` 를 raise. 한도 0 이면 해당 검사 비활성.

    mock 모드는 실제 비용이 발생하지 않으므로 검사를 건너뛴다.
    """
    if settings.HEYGEN_MOCK:
        return

    now = now or datetime.now(timezone.utc)
    daily_limit = settings.HEYGEN_DAILY_BUDGET_USD
    monthly_limit = settings.HEYGEN_MONTHLY_BUDGET_USD

    if daily_limit and daily_limit > 0:
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        spent = heygen_spend_usd(db, day_start)
        if spent >= daily_limit:
            logger.error(
                "[BUDGET] HeyGen 일 한도 초과로 차단: spent=$%.4f >= limit=$%.2f",
                spent, daily_limit,
            )
            raise BudgetExceededError(
                f"HeyGen 일 예산 초과: ${spent:.2f} / ${daily_limit:.2f}"
            )

    if monthly_limit and monthly_limit > 0:
        month_start = now.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        spent = heygen_spend_usd(db, month_start)
        if spent >= monthly_limit:
            logger.error(
                "[BUDGET] HeyGen 월 한도 초과로 차단: spent=$%.4f >= limit=$%.2f",
                spent, monthly_limit,
            )
            raise BudgetExceededError(
                f"HeyGen 월 예산 초과: ${spent:.2f} / ${monthly_limit:.2f}"
            )


# ── VisionStory 예산 서킷 브레이커 (본인 얼굴 Q&A 렌더) ───────────────────────
#
# HeyGen(`assert_heygen_budget`)은 render_cost_logs(service="heygen")를 합산하지만,
# VisionStory Q&A 렌더 비용은 VideoRender 가 없어 platform_cost_logs(CostLog,
# category=AVATAR_QA, model="visionstory")에 적재된다(qa_batch._record_qa_render_cost).
# 그래서 HeyGen 브레이커가 VS 지출을 전혀 못 잡았고, 본인 얼굴 렌더는 강의당 횟수
# 상한(C-2)만이 유일한 방어선이었다. 이 함수가 동형의 일/월 $ 2차 방어선을 추가한다.

_VISIONSTORY_PROVIDER = "visionstory"


def visionstory_spend_usd(db: Session, since: datetime) -> float:
    """``since`` 이후 기록된 VisionStory Q&A 렌더 비용 합계(USD)."""
    from app.models.cost_log import CostCategory, CostLog  # noqa: PLC0415

    total = db.execute(
        select(func.coalesce(func.sum(CostLog.cost_usd), 0.0)).where(
            CostLog.category == CostCategory.avatar_qa,
            CostLog.model == _VISIONSTORY_PROVIDER,
            CostLog.created_at >= since,
        )
    ).scalar()
    return float(total or 0.0)


def assert_visionstory_budget(db: Session, *, now: datetime | None = None) -> None:
    """일/월 한도 초과 시 ``BudgetExceededError`` 를 raise. 한도 0 이면 해당 검사 비활성.

    ``assert_heygen_budget`` 과 동형. mock 모드(VISIONSTORY_MOCK)는 실비용 0 이라 건너뛴다.
    한계: 비용은 렌더 완료 시점에 기록되므로 in-flight 다발 제출은 일시 초과할 수 있다
    (HeyGen 브레이커와 동일 — 강의당 횟수 상한 C-2 가 폭주를 1차로 막는다).
    """
    if settings.VISIONSTORY_MOCK:
        return

    now = now or datetime.now(timezone.utc)
    daily_limit = settings.VISIONSTORY_DAILY_BUDGET_USD
    monthly_limit = settings.VISIONSTORY_MONTHLY_BUDGET_USD

    if daily_limit and daily_limit > 0:
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        spent = visionstory_spend_usd(db, day_start)
        if spent >= daily_limit:
            logger.error(
                "[BUDGET] VisionStory 일 한도 초과로 차단: spent=$%.4f >= limit=$%.2f",
                spent, daily_limit,
            )
            raise BudgetExceededError(
                f"VisionStory 일 예산 초과: ${spent:.2f} / ${daily_limit:.2f}"
            )

    if monthly_limit and monthly_limit > 0:
        month_start = now.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        spent = visionstory_spend_usd(db, month_start)
        if spent >= monthly_limit:
            logger.error(
                "[BUDGET] VisionStory 월 한도 초과로 차단: spent=$%.4f >= limit=$%.2f",
                spent, monthly_limit,
            )
            raise BudgetExceededError(
                f"VisionStory 월 예산 초과: ${spent:.2f} / ${monthly_limit:.2f}"
            )


# ── Q&A 아바타 한도 (docs/planning/09 §5 개정 2026-06-14) ─────────────────────
#
# 한도 단위는 '클립'이 아니라 '배포(is_published)된 강의'다. 베타테스터는 월 8강의.
#  - 한 강의에 사전 질문이 3개여도, 디버깅으로 같은 강의를 여러 번 재렌더해도 1로 센다.
#  - 미배포(제작 중) 강의 렌더는 한도를 소모하지 않는다 — 실제 배포한 강의만 센다.
#  - 테스트 계정·계정주(QA_AVATAR_UNLIMITED_EMAILS)는 면제(무제한).
# 렌더는 배포보다 이른 '영상 승인' 시점에 제출되므로, 미배포 강의는 게이트로 막지
# 않는다(그 강의는 한도에 안 잡힘). 실질 하드캡은 HeyGen 계정 잔액(auto-refill OFF).


_UNLIMITED_REMAINING = 9999  # 무제한 계정의 remaining 표시용 sentinel(렌더 비차단).


def _month_start(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def instructor_has_unlimited_qa(db: Session, instructor_id) -> bool:
    """이 교수자가 월 Q&A 강의 한도 면제 대상인지(화이트리스트 이메일)."""
    email = db.execute(
        select(User.email).where(User.id == instructor_id)
    ).scalar()
    if not email:
        return False
    return email.strip().lower() in settings.qa_avatar_unlimited_email_set


def qa_renders_used_this_month(
    db: Session, instructor_id, *, now: datetime | None = None
) -> int:
    """이번 달 해당 교수자가 Q&A 아바타를 렌더한 '배포된 강의' 수(중복 제거).

    카운트 단위는 클립이 아니라 강의다. 한 강의에 사전 질문이 여러 개(≤3)거나
    디버깅으로 여러 번 재렌더해도 그 강의는 1로 센다. 아직 배포(is_published)되지
    않은 제작 중 강의는 제외 — 제작 과정의 렌더는 한도를 소모하지 않고 실제 배포한
    강의만 월 한도에 포함한다(2026-06-14 사용자 결정). "실제 제출된 렌더"만 보도록
    대표 행(heygen_job_id 보유)만 센다. **실패(status=failed)는 제외**한다(2026-06-16
    사용자 결정) — 실패한 렌더만 있는 강의는 월 '강의' 슬롯을 소모하지 않는다(고쳐
    다시 만드는 재시도를 한도가 막지 않게).
    """
    from app.services.pipeline import qa_avatar  # noqa: PLC0415

    month_start = _month_start(now)
    total = db.execute(
        select(func.count(func.distinct(QAAnswerCache.lecture_id)))
        .select_from(QAAnswerCache)
        .join(Lecture, Lecture.id == QAAnswerCache.lecture_id)
        .where(
            QAAnswerCache.instructor_id == instructor_id,
            QAAnswerCache.heygen_job_id.isnot(None),
            QAAnswerCache.status != qa_avatar.STATUS_FAILED,
            QAAnswerCache.created_at >= month_start,
            Lecture.is_published == True,  # noqa: E712
        )
    ).scalar()
    return int(total or 0)


def _lecture_in_quota_set(
    db: Session, instructor_id, lecture_id, *, now: datetime | None = None
) -> bool:
    """이 강의가 이미 이번 달 한도 집합에 포함됐는지(배포됨 + 제출된 렌더 보유).

    이미 포함된 강의에 클립을 더 렌더하는 것은 '새 강의 슬롯'을 쓰지 않으므로,
    한도가 찼더라도 허용한다(같은 강의 재렌더·사전 질문 추가).
    """
    month_start = _month_start(now)
    found = db.execute(
        select(func.count(QAAnswerCache.id))
        .select_from(QAAnswerCache)
        .join(Lecture, Lecture.id == QAAnswerCache.lecture_id)
        .where(
            QAAnswerCache.instructor_id == instructor_id,
            QAAnswerCache.lecture_id == lecture_id,
            QAAnswerCache.heygen_job_id.isnot(None),
            QAAnswerCache.created_at >= month_start,
            Lecture.is_published == True,  # noqa: E712
        )
    ).scalar()
    return bool(found)


def qa_can_render_lecture(
    db: Session, instructor_id, lecture_id, *, now: datetime | None = None
) -> bool:
    """이번 달 이 강의에 새 Q&A 렌더를 시작할 여지가 있는지(강의 단위 월 한도).

    - 무제한 계정 → 항상 True.
    - 이미 한도 집합에 든 강의(배포+이번 달 렌더) → True(새 슬롯 아님).
    - 그 외 → 배포된 강의 사용 수가 한도 미만이면 True.
    한도 0/음수면 렌더 비활성(False).
    """
    if instructor_has_unlimited_qa(db, instructor_id):
        return True
    cap = settings.QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR
    if not cap or cap <= 0:
        return False
    if _lecture_in_quota_set(db, instructor_id, lecture_id, now=now):
        return True
    return qa_renders_used_this_month(db, instructor_id, now=now) < cap


def qa_render_quota_remaining(
    db: Session, instructor_id, *, now: datetime | None = None
) -> int:
    """이번 달 남은 Q&A '강의' 슬롯 수(0 이상). 무제한 계정은 sentinel, 한도 0 면 0."""
    if instructor_has_unlimited_qa(db, instructor_id):
        return _UNLIMITED_REMAINING
    cap = settings.QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR
    if not cap or cap <= 0:
        return 0
    used = qa_renders_used_this_month(db, instructor_id, now=now)
    return max(0, cap - used)


def assert_qa_render_budget(
    db: Session, instructor_id, lecture_id, *, now: datetime | None = None
) -> None:
    """Q&A 아바타 렌더 직전 검사 — 교수자 월 강의 한도 + 전역 HeyGen 예산($).

    - 이 강의에 렌더 여지가 없으면(``qa_can_render_lecture`` False) ``QARenderQuotaError``.
      한도 단위는 '배포된 강의'이며, 이미 한도 집합에 든 강의는 통과한다.
    - 전역 일/월 $ 서킷 브레이커(``assert_heygen_budget``) 재사용 — mock 은 통과.
    강의 한도는 mock 에서도 적용(렌더 "수" 통제이므로). $ 브레이커만 mock 면제.
    """
    if not qa_can_render_lecture(db, instructor_id, lecture_id, now=now):
        cap = settings.QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR
        used = qa_renders_used_this_month(db, instructor_id, now=now)
        logger.warning(
            "[BUDGET] Q&A 렌더 월 강의 한도 초과로 차단: instructor=%s lecture=%s used=%d cap=%d",
            instructor_id, lecture_id, used, cap,
        )
        raise QARenderQuotaError(
            f"Q&A 아바타 렌더 월 강의 한도 초과: {used}/{cap}"
        )
    assert_heygen_budget(db, now=now)


# ── 강의당 아바타 재렌더 상한 (C-2 · docs/planning/13 §C-2) ───────────────────────
#
# 교수자 월 한도(qa_renders_used_this_month)는 '배포된 강의 수'를 세지 같은 강의를
# 여러 번 다시 뽑는 '재제작 횟수'를 세지 않는다 → 결과가 맘에 안 들어 반복 재제작하면
# 슬롯은 1로 쳐도 비용은 매번 든다. 특히 VisionStory(본인 얼굴)는 전역 $ 서킷
# 브레이커가 없어 이 횟수 상한이 유일한 방어선이다. lectures.avatar_render_count 에
# 성공한 제작 패스(클립/클러스터 수 무관, 한 번의 제작=1)를 누적해 상한을 건다.
# HeyGen·VisionStory 동일 적용. 면제 계정(QA_AVATAR_UNLIMITED_EMAILS)은 무제한.


def avatar_render_count(db: Session, lecture_id) -> int:
    """이 강의의 누적 아바타 제작 패스 수(lectures.avatar_render_count)."""
    n = db.execute(
        select(Lecture.avatar_render_count).where(Lecture.id == lecture_id)
    ).scalar()
    return int(n or 0)


def avatar_rerender_remaining(
    db: Session, lecture_id, instructor_id
) -> int:
    """이 강의에 남은 아바타 제작 횟수. 무제한 계정·상한 비활성은 sentinel."""
    if instructor_has_unlimited_qa(db, instructor_id):
        return _UNLIMITED_REMAINING
    cap = settings.AVATAR_RERENDER_MAX_PER_LECTURE
    if not cap or cap <= 0:
        return _UNLIMITED_REMAINING  # 0 이하 = 상한 비활성(무제한)
    return max(0, cap - avatar_render_count(db, lecture_id))


def assert_avatar_rerender_quota(
    db: Session, lecture_id, instructor_id
) -> None:
    """강의당 아바타 제작 횟수가 상한에 도달했으면 ``AvatarRerenderQuotaError``.

    면제 계정·상한 비활성(0 이하)은 통과. 첫 제작(count 0)은 항상 통과한다.
    """
    if instructor_has_unlimited_qa(db, instructor_id):
        return
    cap = settings.AVATAR_RERENDER_MAX_PER_LECTURE
    if not cap or cap <= 0:
        return
    used = avatar_render_count(db, lecture_id)
    if used >= cap:
        logger.warning(
            "[BUDGET] 강의당 아바타 제작 횟수 상한 초과로 차단: lecture=%s used=%d cap=%d",
            lecture_id, used, cap,
        )
        raise AvatarRerenderQuotaError(
            f"강의당 아바타 제작 횟수 상한 초과: {used}/{cap}"
        )


def increment_avatar_render_count(
    db: Session, lecture_id, instructor_id
) -> None:
    """성공한 아바타 제작 패스 1건을 강의 카운터에 +1(면제 계정은 건너뜀).

    호출자가 같은 트랜잭션에서 commit 한다. 클러스터/클립 수와 무관하게 '제작
    패스'당 한 번만 호출해야 한다(_render_seed_questions 가 패스 종료 시 1회 호출).
    """
    if instructor_has_unlimited_qa(db, instructor_id):
        return
    lecture = db.get(Lecture, lecture_id)
    if lecture is not None:
        lecture.avatar_render_count = int(lecture.avatar_render_count or 0) + 1
