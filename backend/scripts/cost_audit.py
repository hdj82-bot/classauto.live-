#!/usr/bin/env python
"""비용 감사 — 브레이커 커버리지 vs 실제 지출 (스펙 13 §C-1b / §C-3).

사용법:
    docker compose exec backend python -m scripts.cost_audit
    docker compose exec backend python -m scripts.cost_audit --months 6
    docker compose exec backend python -m scripts.cost_audit --csv > audit.csv

이 스크립트가 답하는 두 질문
---------------------------
1. **실제로 어디에 돈이 나가는가** — 서비스별 월 지출.
2. **그중 어디에 $ 상한이 걸려 있는가** — 브레이커 커버리지.

둘이 다르다는 게 요점이다. 2026-07 시점 기준으로 **본문 렌더는 HeyGen 을 쓰지 않는다**
(`LECTURE_BODY_PROVIDER="slideshow"` — 슬라이드 이미지 + TTS 음성). 그래서 실제 지출의
대부분은 **ElevenLabs TTS** 인데, 브레이커 4개는 전부 아바타 계열이라 **TTS 에는 $ 상한이
없다.**

비용이 쌓이는 곳 (2026-07-26 조사)
----------------------------------
    render_cost_logs                     duration  단가 출처
      service='elevenlabs'  TTS 본문      O         cost_tracker.ELEVENLABS_USD_PER_1K_CHARS
      service='google_tts'  TTS 폴백      O         cost_tracker.GOOGLE_TTS_USD_PER_1K_CHARS
      service='heygen'      본문 렌더     O         settings.HEYGEN_COST_USD_PER_SECOND
      service='s3'          업로드        X         (0 기록)

    platform_cost_logs                   duration  단가 출처
      category=AVATAR_QA    Q&A 아바타    X         settings.*_COST_USD_PER_SECOND
      category=LLM_*        Claude        X         호출부 추정
      category=TTS          (미사용)      —         **enum 만 있고 쓰이지 않는다**

⚠️ `CostCategory.tts` 는 **한 번도 기록되지 않는다.** enum 에 있어서 platform_cost_logs
에 TTS 가 쌓인다고 착각하기 쉽다. TTS 는 전부 render_cost_logs 쪽이다.

⚠️ TTS 단가는 **코드 상수**(`services/cost_tracker.py`)라 env 로 조정할 수 없다.
아바타 단가(settings.*)와 정책이 다르다 — 스펙 13 §C-1a 조정 원칙 참조.

단가 확정은 이 스크립트로 하지 않는다 (§C-1b)
---------------------------------------------
`cost_usd` 는 `duration × 설정단가` 로 저장된 값이라 역산하면 순환이다. 진짜 단가는
**공급자 대시보드**에서 (청구액 ÷ 공급자 집계 총량) 으로 구하고, 이 스크립트는 그 뒤
**계측 검증용**으로 쓴다 — 공급자 총량과 우리 합계가 크게 다르면 계측 버그 신호다.
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.config import settings
from app.db.session import SyncSessionLocal
from app.models.cost_log import CostLog
from app.models.video_render import RenderCostLog

# 브레이커가 감시하는 서비스 — 여기 없는 항목은 $ 상한이 없다는 뜻이다.
GUARDED = {
    "heygen": "assert_heygen_budget (일/월 $)",
    "visionstory": "assert_visionstory_budget (일/월 $)",
}


def _months_ago(n: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=31 * n)


def _render_rows(db, since: datetime) -> list[dict]:
    """render_cost_logs — 서비스별 월별. duration 실측이 있는 유일한 곳."""
    year = func.extract("year", RenderCostLog.created_at)
    month = func.extract("month", RenderCostLog.created_at)
    rows = db.execute(
        select(
            RenderCostLog.service,
            year.label("y"),
            month.label("m"),
            func.count(RenderCostLog.id),
            func.coalesce(func.sum(RenderCostLog.duration_seconds), 0.0),
            func.coalesce(func.sum(RenderCostLog.cost_usd), 0.0),
        )
        .where(RenderCostLog.created_at >= since)
        .group_by(RenderCostLog.service, year, month)
        .order_by(year.desc(), month.desc(), RenderCostLog.service)
    ).all()
    return [
        {
            "table": "render_cost_logs",
            "name": r[0],
            "year": int(r[1]),
            "month": int(r[2]),
            "count": int(r[3]),
            "duration_sec": float(r[4] or 0.0),
            "cost_usd": float(r[5] or 0.0),
        }
        for r in rows
    ]


def _platform_rows(db, since: datetime) -> list[dict]:
    """platform_cost_logs — 카테고리(+model)별 월별. duration 컬럼이 없다."""
    year = func.extract("year", CostLog.created_at)
    month = func.extract("month", CostLog.created_at)
    rows = db.execute(
        select(
            CostLog.category,
            CostLog.model,
            year.label("y"),
            month.label("m"),
            func.count(CostLog.id),
            func.coalesce(func.sum(CostLog.cost_usd), 0.0),
        )
        .where(CostLog.created_at >= since)
        .group_by(CostLog.category, CostLog.model, year, month)
        .order_by(year.desc(), month.desc(), CostLog.category)
    ).all()
    out = []
    for r in rows:
        category = r[0].value if hasattr(r[0], "value") else str(r[0])
        model = r[1] or "—"
        out.append(
            {
                "table": "platform_cost_logs",
                "name": f"{category}/{model}",
                "guard_key": model if category == "AVATAR_QA" else None,
                "year": int(r[2]),
                "month": int(r[3]),
                "count": int(r[4]),
                "duration_sec": 0.0,
                "cost_usd": float(r[5] or 0.0),
            }
        )
    return out


def _guard_for(row: dict) -> str | None:
    """이 지출 항목에 걸린 브레이커. None 이면 **상한 없음**."""
    key = row.get("guard_key") or row["name"]
    return GUARDED.get(key)


def _print_table(rows: list[dict]) -> None:
    if not rows:
        print("   (기록 없음)")
        return
    print(
        f"   {'월':>8}  {'항목':<24} {'건수':>6} {'duration(s)':>12} {'$':>10}  {'상한':<32}"
    )
    for r in sorted(rows, key=lambda x: (-x["year"], -x["month"], x["name"])):
        guard = _guard_for(r) or "⚠️  없음"
        dur = f"{r['duration_sec']:.1f}" if r["duration_sec"] else "—"
        print(
            f"   {r['year']}-{r['month']:02d}  {r['name']:<24} {r['count']:>6} "
            f"{dur:>12} {r['cost_usd']:>10.4f}  {guard:<32}"
        )


def _print_summary(rows: list[dict]) -> None:
    """서비스별 총액 + 상한 유무. '실제 지출'과 '브레이커 대상'을 나눠 본다."""
    totals: dict[str, float] = {}
    for r in rows:
        totals[r["name"]] = totals.get(r["name"], 0.0) + r["cost_usd"]
    if not totals:
        return

    grand = sum(totals.values())
    guarded_sum = sum(
        v for k, v in totals.items()
        if _guard_for({"name": k, "guard_key": k.split("/")[-1] if "/" in k else None})
    )

    print("\n── 요약: 실제 지출 vs 브레이커 커버리지 ──────────────────────")
    for name, total in sorted(totals.items(), key=lambda kv: -kv[1]):
        guard = _guard_for({"name": name, "guard_key": name.split("/")[-1] if "/" in name else None})
        share = (total / grand * 100) if grand else 0
        mark = "  " if guard else "⚠️"
        print(f"   {mark} {name:<24} ${total:>10.4f}  ({share:>5.1f}%)  {guard or '상한 없음'}")

    uncovered = grand - guarded_sum
    print(f"\n   총 지출        ${grand:.4f}")
    print(f"   브레이커 대상  ${guarded_sum:.4f}")
    print(
        f"   ⚠️  상한 없음   ${uncovered:.4f}"
        f"  ({(uncovered / grand * 100) if grand else 0:.1f}%)"
    )
    if uncovered > 0:
        print(
            "\n   상한 없는 지출이 있다. 재시도 루프·대량 재생성 사고가 나면 막을 장치가 없다.\n"
            "   특히 TTS(elevenlabs)는 본문이 slideshow 모드라 실제 지출의 주축인데\n"
            "   브레이커가 아바타 계열뿐이다 — 스펙 13 §C-3 참조."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", type=int, default=3, help="조회할 개월 수 (기본 3)")
    parser.add_argument("--csv", action="store_true", help="CSV 로 출력")
    args = parser.parse_args()

    since = _months_ago(args.months)
    with SyncSessionLocal() as db:
        rows = _render_rows(db, since) + _platform_rows(db, since)

    if args.csv:
        print("table,service,month,count,duration_sec,cost_usd,guard")
        for r in sorted(rows, key=lambda x: (-x["year"], -x["month"], x["name"])):
            print(
                f"{r['table']},{r['name']},{r['year']}-{r['month']:02d},{r['count']},"
                f"{r['duration_sec']:.1f},{r['cost_usd']:.4f},"
                f"{_guard_for(r) or 'NONE'}"
            )
        return 0

    print("=" * 92)
    print("비용 감사 — 실제 지출 vs 브레이커 커버리지 (스펙 13 §C)")
    print("=" * 92)
    print(f"   본문 렌더 모드: LECTURE_BODY_PROVIDER={settings.LECTURE_BODY_PROVIDER}")
    if settings.LECTURE_BODY_PROVIDER == "slideshow":
        print("   → 본문은 HeyGen 을 쓰지 않는다(슬라이드 + TTS). HeyGen 지출은 Q&A 아바타뿐.")

    _print_table(rows)
    _print_summary(rows)

    print("\n── 단가 확정은 이 출력으로 하지 않는다 (§C-1b) ────────────────")
    print("   cost_usd 는 duration × 설정단가라 역산하면 순환이다.")
    print("   진짜 단가는 공급자 대시보드에서 (청구액 ÷ 공급자 집계 총량).")
    print("   이 스크립트는 그 뒤 계측 검증용 — 공급자 총량과 크게 다르면 계측 버그다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
