"""교수자 대시보드 API (NestJS DashboardController 포팅)."""
import csv
import io
import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor
from app.db.session import get_db
from app.models.user import User
from app.services import dashboard as dashboard_svc
from app.services.lecture import assert_professor_owns_lecture, list_my_lectures

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/summary", summary="대시보드 요약 (내 전체 강의 배치)")
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    """교수자 본인 전체 강의의 attendance/scores/engagement/qa/cost 를 한 번에 반환.

    대시보드 홈이 강의당 5개 endpoint(= 1+6N 요청)를 호출하던 fan-out 을 단일
    호출로 대체한다. 소유 범위는 ``list_my_lectures``(instructor_id) 로 한정되어
    각 강의는 본인 소유가 보장되므로 개별 소유권 확인은 생략한다. 각 항목의 5개
    필드는 per-lecture endpoint 응답과 동일한 모양 — 프론트 aggregateDashboardHub
    가 그대로 소비한다.
    """
    lectures = await list_my_lectures(db, user)
    items = []
    for lec in lectures:
        items.append(
            {
                "lecture_id": str(lec.id),
                "attendance": await dashboard_svc.get_attendance(db, lec.id),
                "scores": await dashboard_svc.get_scores(db, lec.id),
                "engagement": await dashboard_svc.get_engagement(db, lec.id),
                "qa": await dashboard_svc.get_qa_logs(db, lec.id, 1, 50),
                "cost": await dashboard_svc.get_cost(db, lec.id),
            }
        )
    return {"lectures": items}


@router.get("/{lecture_id}/attendance", summary="출석 분석")
async def get_attendance(
    lecture_id: uuid.UUID,
    live_deadline_min: int | None = Query(None, ge=1, le=300, description="출석 판정 기준 시간(분), 1~300 범위"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    await assert_professor_owns_lecture(db, lecture_id, user.id)
    return await dashboard_svc.get_attendance(db, lecture_id, live_deadline_min)


@router.get("/{lecture_id}/scores", summary="정답률/오답 분석")
async def get_scores(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    await assert_professor_owns_lecture(db, lecture_id, user.id)
    return await dashboard_svc.get_scores(db, lecture_id)


@router.get("/{lecture_id}/engagement", summary="참여도 분석")
async def get_engagement(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    await assert_professor_owns_lecture(db, lecture_id, user.id)
    return await dashboard_svc.get_engagement(db, lecture_id)


@router.get("/{lecture_id}/qa", summary="Q&A 로그 조회")
async def get_qa_logs(
    lecture_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    await assert_professor_owns_lecture(db, lecture_id, user.id)
    return await dashboard_svc.get_qa_logs(db, lecture_id, page, limit)


@router.get("/{lecture_id}/cost", summary="비용 미터")
async def get_cost(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    await assert_professor_owns_lecture(db, lecture_id, user.id)
    return await dashboard_svc.get_cost(db, lecture_id)


@router.get("/{lecture_id}/export/csv", summary="학생 진도 CSV 내보내기")
async def export_csv(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    """출석/진도/참여도를 종합한 CSV 파일을 다운로드합니다."""
    await assert_professor_owns_lecture(db, lecture_id, user.id)
    attendance = await dashboard_svc.get_attendance(db, lecture_id)
    engagement = await dashboard_svc.get_engagement(db, lecture_id)

    # 참여도 데이터를 user_id 기준으로 매핑
    engagement_map: dict[str, dict] = {}
    for s in engagement.get("students", []):
        engagement_map[s["userId"]] = s

    buf = io.StringIO()
    # BOM for Excel 한글 호환
    buf.write("﻿")
    writer = csv.writer(buf)

    writer.writerow([
        "이름", "학번", "출석 유형", "진행률(%)", "상태",
        "시청 시간(초)", "총 시간(초)", "시청 비율(%)",
        "Q&A 질문 수", "Q&A 응답 수", "응답률(%)", "무반응 횟수",
        "시작 시각",
    ])

    for student in attendance.get("students", []):
        uid = student["user_id"]
        eng = engagement_map.get(uid, {})

        writer.writerow([
            student.get("name", ""),
            student.get("student_number", ""),
            "실시간" if student.get("type") == "live" else "사후 시청",
            student.get("progress_pct", 0),
            student.get("status", ""),
            eng.get("watchedSec", 0),
            eng.get("totalSec", 0),
            eng.get("watchRatio", 0),
            eng.get("qaCount", 0),
            eng.get("respondedCount", 0),
            eng.get("responseRate", ""),
            eng.get("noResponseCnt", 0),
            student.get("started_at", ""),
        ])

    buf.seek(0)
    filename = f"lecture_{lecture_id}_progress.csv"
    return StreamingResponse(
        buf,
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
