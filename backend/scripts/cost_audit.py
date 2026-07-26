#!/usr/bin/env python
"""아바타 렌더 단가 감사 — DB 실적 vs 실제 청구서 대조용 (스펙 13 §C-1a).

사용법:
    docker compose exec backend python -m scripts.cost_audit
    docker compose exec backend python -m scripts.cost_audit --months 6
    docker compose exec backend python -m scripts.cost_audit --csv > audit.csv

왜 필요한가
-----------
`HEYGEN_COST_USD_PER_SECOND` 가 코드 기본값(0.0167)과 Railway env(0.0083 로 기록됨)에서
갈려 있었고 아무도 몰랐다. 추정치를 다른 추정치로 바꾸지 않으려면 **실제 청구서**와
대조해야 한다. 이 스크립트는 그 대조에 필요한 DB 측 실적을 뽑는다.

⚠️ 읽는 법 — "추정 단가"는 순환 참조다
--------------------------------------
`render_cost_logs.cost_usd` 는 이미 `duration × 설정단가` 로 계산해 저장한 값이다.
따라서 `SUM(cost) / SUM(duration)` 은 **설정단가를 그대로 되돌려줄 뿐** 진짜 단가가
아니다. 이 컬럼의 쓸모는 두 가지다.

  1. 그 달에 설정단가가 일관되게 적용됐는지 확인 (중간에 바뀌었으면 혼합값이 나온다)
  2. 진짜 단가를 구하는 **분모**를 얻는 것

진짜 단가는 이렇게 구한다:

    실제 단가 = (그 달 HeyGen 청구액 USD) / (그 달 SUM(duration_seconds))

⚠️ 커버리지 한계 — 청구서와 1:1 이 아니다
------------------------------------------
비용은 두 테이블에 나뉘어 적재되고, **duration 이 있는 쪽은 하나뿐**이다.

  render_cost_logs      본문 렌더(HeyGen)          duration 실측 O   → 대조 가능
  platform_cost_logs    Q&A 아바타 렌더            duration 미기록   → 대조 불가
                        (HeyGen Q&A · VisionStory)

즉 **HeyGen 청구액에는 Q&A 렌더분도 포함**되는데 그쪽 duration 을 모르므로,
청구액 ÷ 본문 duration 으로 나눈 값은 실제보다 **과대**해진다. 아래 출력의
`qa_cost_usd` 를 청구액에서 먼저 빼고 나눠야 근사가 맞는다.

**VisionStory 는 단가 역산이 아예 불가능하다.** 비용이 전부 platform_cost_logs 에만
쌓이고 duration 이 없으며, 게다가 VisionStory 상태 응답은 duration 을 주지 않아
답변 길이로 **추정**한 값으로 비용을 기록한다(`qa_batch._estimate_qa_render_seconds`).
VisionStory 단가는 크레딧 명세로 직접 확인해야 한다.
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.config import settings
from app.db.session import SyncSessionLocal
from app.models.cost_log import CostCategory, CostLog
from app.models.video_render import RenderCostLog

HEYGEN = "heygen"
VISIONSTORY = "visionstory"


def _months_ago(n: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=31 * n)


def _render_rows(db, since: datetime, service: str) -> list[dict]:
    """render_cost_logs — 본문 렌더. duration 실측이 있어 대조 가능."""
    year = func.extract("year", RenderCostLog.created_at)
    month = func.extract("month", RenderCostLog.created_at)
    rows = db.execute(
        select(
            year.label("y"),
            month.label("m"),
            func.count(RenderCostLog.id),
            func.coalesce(func.sum(RenderCostLog.duration_seconds), 0.0),
            func.coalesce(func.sum(RenderCostLog.cost_usd), 0.0),
        )
        .where(RenderCostLog.service == service, RenderCostLog.created_at >= since)
        .group_by(year, month)
        .order_by(year.desc(), month.desc())
    ).all()
    return [
        {
            "year": int(r[0]),
            "month": int(r[1]),
            "renders": int(r[2]),
            "duration_sec": float(r[3] or 0.0),
            "cost_usd": float(r[4] or 0.0),
        }
        for r in rows
    ]


def _qa_rows(db, since: datetime, model: str) -> list[dict]:
    """platform_cost_logs(category=AVATAR_QA) — Q&A 렌더. duration 컬럼이 없다."""
    year = func.extract("year", CostLog.created_at)
    month = func.extract("month", CostLog.created_at)
    rows = db.execute(
        select(
            year.label("y"),
            month.label("m"),
            func.count(CostLog.id),
            func.coalesce(func.sum(CostLog.cost_usd), 0.0),
        )
        .where(
            CostLog.category == CostCategory.avatar_qa,
            CostLog.model == model,
            CostLog.created_at >= since,
        )
        .group_by(year, month)
        .order_by(year.desc(), month.desc())
    ).all()
    return [
        {
            "year": int(r[0]),
            "month": int(r[1]),
            "renders": int(r[2]),
            "cost_usd": float(r[3] or 0.0),
        }
        for r in rows
    ]


def _implied_rate(cost: float, duration: float) -> float | None:
    if duration <= 0:
        return None
    return cost / duration


def _merge(render_rows: list[dict], qa_rows: list[dict]) -> list[dict]:
    """월 키로 두 테이블을 합친다(한쪽에만 있는 달도 남긴다)."""
    by_key: dict[tuple[int, int], dict] = {}
    for r in render_rows:
        by_key[(r["year"], r["month"])] = {
            **r,
            "qa_renders": 0,
            "qa_cost_usd": 0.0,
        }
    for q in qa_rows:
        key = (q["year"], q["month"])
        entry = by_key.setdefault(
            key,
            {
                "year": q["year"],
                "month": q["month"],
                "renders": 0,
                "duration_sec": 0.0,
                "cost_usd": 0.0,
                "qa_renders": 0,
                "qa_cost_usd": 0.0,
            },
        )
        entry["qa_renders"] = q["renders"]
        entry["qa_cost_usd"] = q["cost_usd"]
    return sorted(by_key.values(), key=lambda e: (e["year"], e["month"]), reverse=True)


def _print_service(name: str, rows: list[dict], configured_rate: float, csv: bool) -> None:
    if csv:
        for r in rows:
            rate = _implied_rate(r["cost_usd"], r["duration_sec"])
            print(
                f"{name},{r['year']}-{r['month']:02d},{r['renders']},"
                f"{r['duration_sec']:.1f},{r['cost_usd']:.4f},"
                f"{'' if rate is None else f'{rate:.6f}'},"
                f"{r['qa_renders']},{r['qa_cost_usd']:.4f}"
            )
        return

    print(f"\n── {name} ─────────────────────────────────────────────────────────")
    print(f"   설정 단가: {configured_rate} USD/sec  (= ${configured_rate * 60:.2f}/분)")
    if not rows:
        print("   (기록 없음)")
        return

    print(
        f"   {'월':>8}  {'본문':>5} {'duration(s)':>12} {'본문 $':>10} "
        f"{'추정단가':>10}  {'Q&A':>5} {'Q&A $':>10}  {'합계 $':>10}"
    )
    for r in rows:
        rate = _implied_rate(r["cost_usd"], r["duration_sec"])
        rate_str = "—" if rate is None else f"{rate:.6f}"
        total = r["cost_usd"] + r["qa_cost_usd"]
        print(
            f"   {r['year']}-{r['month']:02d}  {r['renders']:>5} "
            f"{r['duration_sec']:>12.1f} {r['cost_usd']:>10.4f} {rate_str:>10}  "
            f"{r['qa_renders']:>5} {r['qa_cost_usd']:>10.4f}  {total:>10.4f}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", type=int, default=3, help="조회할 개월 수 (기본 3)")
    parser.add_argument("--csv", action="store_true", help="CSV 로 출력")
    args = parser.parse_args()

    since = _months_ago(args.months)

    with SyncSessionLocal() as db:
        heygen = _merge(
            _render_rows(db, since, HEYGEN), _qa_rows(db, since, HEYGEN)
        )
        # VisionStory 는 본문 렌더가 없다(Q&A 전용) — render_cost_logs 쪽은 비어 있다.
        visionstory = _merge(
            _render_rows(db, since, VISIONSTORY), _qa_rows(db, since, VISIONSTORY)
        )

    if args.csv:
        print("service,month,renders,duration_sec,cost_usd,implied_rate,qa_renders,qa_cost_usd")
        _print_service(HEYGEN, heygen, settings.HEYGEN_COST_USD_PER_SECOND, csv=True)
        _print_service(
            VISIONSTORY, visionstory, settings.VISIONSTORY_COST_USD_PER_SECOND, csv=True
        )
        return 0

    print("=" * 78)
    print("아바타 렌더 단가 감사 — DB 실적 (스펙 13 §C-1a)")
    print("=" * 78)

    _print_service(HEYGEN, heygen, settings.HEYGEN_COST_USD_PER_SECOND, csv=False)
    _print_service(
        VISIONSTORY, visionstory, settings.VISIONSTORY_COST_USD_PER_SECOND, csv=False
    )

    ratio = (
        settings.VISIONSTORY_COST_USD_PER_SECOND / settings.HEYGEN_COST_USD_PER_SECOND
        if settings.HEYGEN_COST_USD_PER_SECOND
        else None
    )
    print("\n── 단가 정합성 ──────────────────────────────────────────────────")
    print(f"   VisionStory / HeyGen = {ratio if ratio is None else round(ratio, 3)}")
    if ratio is not None and abs(ratio - 2.0) > 0.01:
        print("   ⚠️  코드는 VisionStory = HeyGen × 2 를 전제한다(config.py 주석).")
        print("       비율이 2.0 이 아니면 한쪽만 env override 된 상태일 수 있다.")
        print("       두 단가는 반드시 함께 조정한다(스펙 13 §C-1).")

    print("\n── 청구서와 대조하는 법 ─────────────────────────────────────────")
    print("   1. 'duration(s)' 는 본문 렌더의 **실측 합계**다. 이게 분모다.")
    print("   2. '추정단가' 는 cost/duration 이라 설정단가를 되돌려줄 뿐이다(순환).")
    print("      값이 설정단가와 다르면 그 달 중간에 단가가 바뀐 것이다.")
    print("   3. 진짜 단가 ≈ (HeyGen 청구액 − Q&A 렌더 추정분) ÷ duration(s)")
    print("      Q&A 렌더는 duration 이 기록되지 않아 분모에 넣을 수 없다.")
    print("   4. VisionStory 는 duration 자체가 답변 길이 기반 **추정치**라")
    print("      단가 역산이 불가능하다 — 크레딧 명세로 직접 확인할 것.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
