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

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/{lecture_id}/attendance", summary="출석 분석")
async def get_attendance(
    lecture_id: uuid.UUID,
    live_deadline_min: int | None = Query(None, description="실시간 출석 판단 기준(분). 생략 시 강의별 설정 → 전역 기본값 순으로 적용"),
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


@router.get("/{lecture_id}/export/csv", summary="학생 진도 CSV 내보내기")
async def export_csv(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    """출석/진도/참여도를 종합한 CSV 파일을 다운로드합니다."""
    attendance = await dashboard_svc.get_attendance(db, lecture_id)
    engagement = await dashboard_svc.get_engagement(db, lecture_id)

    # 참여도 데이터를 user_id 기준으로 매핑
    engagement_map: dict[str, dict] = {}
    for s in engagement.get("students", []):
        engagement_map[s["userId"]] = s

    buf = io.StringIO()
    # BOM for Excel 한글 호환
    buf.write("\ufeff")
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
