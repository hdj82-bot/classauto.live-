"""인사이트 보고서 API — 상호작용 데이터 → 대면수업 솔루션 보고서 (RQ2).

docs/planning/09-beta-program.md §10(핵심 루프), 11-analytics-dashboard.md §H.
- GET /api/v1/insights/{lecture_id}/report      : 집계(evidence) + AI 브리핑
- GET /api/v1/insights/{lecture_id}/report.csv  : 보고서 CSV 다운로드

교수자 본인 강의만 접근 가능(assert_professor_owns_lecture). 합성 비용 가드레일은
briefing.generate_briefing 이 담당(재생성 간격·월 상한·규칙기반 폴백).
"""
import csv
import io
import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor
from app.db.session import get_db
from app.models.user import User
from app.services.insights import aggregator, briefing as briefing_svc
from app.services.lecture import assert_professor_owns_lecture

router = APIRouter(prefix="/api/v1/insights", tags=["insights"])


def _serialize(briefing) -> dict:
    return {
        "id": str(briefing.id),
        "week_no": briefing.week_no,
        "model": briefing.model,
        "is_ai_generated": briefing.model != briefing_svc.MOCK_MODEL,
        "generated_at": briefing.generated_at.isoformat() if briefing.generated_at else None,
        "payload": briefing.payload,
        "source_window": briefing.source_window,
    }


@router.get("/{lecture_id}/report", summary="대면수업 솔루션 보고서 (집계 + AI 브리핑)")
async def get_report(
    lecture_id: uuid.UUID,
    refresh: bool = Query(False, description="true 면 비용 가드레일 한도 내에서 강제 재생성"),
    week: int | None = Query(None, ge=1, le=53, description="주차(브리핑 라벨용)"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    """강의의 상호작용 데이터를 집계하고 차주 대면수업 솔루션 브리핑을 반환한다.

    - ``evidence``: 취약 개념·재시청·딴짓·완주 등 raw 집계(근거 데이터 링크).
    - ``briefing``: ① 상위 취약 개념 ② 차주 수업 권장 초점·활동 ③ 학급 vs 개별 신호.
    """
    await assert_professor_owns_lecture(db, lecture_id, user.id)
    briefing = await briefing_svc.generate_briefing(
        db, lecture_id, force=refresh, week_no=week
    )
    evidence = await aggregator.build_aggregate(db, lecture_id)
    return {
        "lecture_id": str(lecture_id),
        "briefing": _serialize(briefing),
        "evidence": evidence,
    }


@router.get("/{lecture_id}/report.csv", summary="보고서 CSV 다운로드")
async def export_report_csv(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    """최신 브리핑(없으면 생성) + 근거를 CSV 로 내보낸다.

    한 파일에 3개 섹션(취약 개념 / 차주 수업 권장 / 개별 신호). Excel 한글 호환을
    위해 BOM 을 붙인다(대시보드 CSV 와 동일 패턴).
    """
    await assert_professor_owns_lecture(db, lecture_id, user.id)
    briefing = await briefing_svc.generate_briefing(db, lecture_id)
    payload = briefing.payload or {}

    buf = io.StringIO()
    buf.write("﻿")  # BOM
    w = csv.writer(buf)

    w.writerow(["대면수업 솔루션 보고서"])
    w.writerow(["생성 시각", briefing.generated_at.isoformat() if briefing.generated_at else ""])
    w.writerow(["생성 방식", "AI" if briefing.model != briefing_svc.MOCK_MODEL else "규칙기반"])
    w.writerow([])

    w.writerow(["[학습 데이터 요약]"])
    for line in payload.get("summary", []):
        w.writerow([line])
    w.writerow([])

    w.writerow(["[상위 취약 개념]", "심각도", "근거"])
    for c in payload.get("weak_concepts", []):
        w.writerow([
            c.get("concept", ""),
            c.get("severity", ""),
            c.get("why", ""),
        ])
    w.writerow([])

    w.writerow(["[차주 대면수업 권장]", "유형", "초점", "활동", "근거", "대상 슬라이드"])
    for r in payload.get("recommendations", []):
        slides = r.get("target_slides") or []
        w.writerow([
            "",
            r.get("type", ""),
            r.get("focus", ""),
            r.get("activity", ""),
            r.get("rationale", ""),
            ", ".join(str(s + 1) for s in slides if s is not None),
        ])
    w.writerow([])

    cvi = payload.get("class_vs_individual", {})
    w.writerow(["[학급 전체 신호]"])
    for line in cvi.get("class_signals", []):
        w.writerow([line])
    w.writerow([])

    w.writerow(["[개별 학습자 신호]", "신호", "제안"])
    for s in cvi.get("individual_signals", []):
        w.writerow([s.get("student", ""), s.get("signal", ""), s.get("suggestion", "")])

    buf.seek(0)
    filename = f"insights_report_{lecture_id}.csv"
    return StreamingResponse(
        buf,
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
