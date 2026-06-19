"""교수자 대시보드 API (NestJS DashboardController 포팅)."""
import csv
import io
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor, require_student
from app.db.session import get_db
from app.models.session import LearningSession
from app.models.user import User
from app.services import cohort_metrics as cohort_svc
from app.services import dashboard as dashboard_svc
from app.services import qa_keywords as qa_keywords_svc
from app.services.lecture import assert_professor_owns_lecture, list_my_lectures

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

# 한 번의 배치 전송에서 받을 재생 이벤트 상한 — 단건 POST 폭주/거대 페이로드 방지
# (10번 §3.1 "10초/20건마다 배치"). 초과분은 클라이언트가 다음 배치로 분할.
_MAX_WATCH_EVENTS_PER_BATCH = 200


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


@router.get("/{lecture_id}/kpi", summary="현황 KPI + 전주 대비 델타")
async def get_kpi(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    """일자 스냅샷 기반 KPI 4종(완료율·출석·정답률·질문 수) + 전주 대비 증감(스펙 11 §B).

    스냅샷이 2주치 미만이면 델타는 null(현재값만). 추이(`/trend`)와 동일 원자료.
    """
    await assert_professor_owns_lecture(db, lecture_id, user.id)
    return await cohort_svc.get_kpi(db, lecture_id)


@router.get("/{lecture_id}/trend", summary="성취율 추이 (일자별 스냅샷)")
async def get_trend(
    lecture_id: uuid.UUID,
    days: int = Query(30, ge=1, le=180, description="조회 기간(일), 1~180"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    """일배치가 적재한 강의×일자 누적 지표 시계열(스펙 11 §C).

    배포 시점부터 하루 1행씩 쌓이므로 점이 2개 이상 모이기 전까지는 추이가
    비어 있을 수 있다(소급 수집 불가, 09 §3).
    """
    await assert_professor_owns_lecture(db, lecture_id, user.id)
    return await cohort_svc.get_trend(db, lecture_id, days)
@router.get("/{lecture_id}/qa-keywords", summary="빈번 질문어 (한/중/영 키워드)")
async def get_qa_keywords(
    lecture_id: uuid.UUID,
    top: int = Query(20, ge=1, le=100, description="반환할 상위 키워드 수"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    """학생 Q&A 질문에서 자주 등장한 키워드 빈도(스펙 11 §G). 경량 휴리스틱 추출."""
    await assert_professor_owns_lecture(db, lecture_id, user.id)
    return await qa_keywords_svc.get_qa_keywords(db, lecture_id, top_n=top)


@router.post("/watch-events", summary="재생 이벤트 배치 적재 (학습자)")
async def ingest_watch_events(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_student),
):
    """슬라이드쇼 플레이어가 보낸 재생 이벤트 배치를 적재한다 (G1, 10번 §3.1).

    body: ``{"session_id": "<uuid>", "events": [{event_type, slide_index, ...}]}``.
    세션 소유권을 검증(본인 세션만) → user_id·lecture_id 는 서버가 세션에서 채운다.
    클라이언트가 보낸 user/lecture 값은 신뢰하지 않는다. 재생 히트맵·완주 분석의
    1차 자료이며 소급 수집 불가(09 §3)하므로 학기 시작 전 반드시 연결돼야 한다.
    """
    session_id_raw = payload.get("session_id")
    events = payload.get("events")
    if not session_id_raw or not isinstance(events, list):
        raise HTTPException(status_code=422, detail="session_id 와 events[] 가 필요합니다.")
    if len(events) > _MAX_WATCH_EVENTS_PER_BATCH:
        raise HTTPException(
            status_code=413,
            detail=f"한 배치 최대 {_MAX_WATCH_EVENTS_PER_BATCH}건까지 허용됩니다.",
        )
    try:
        session_id = uuid.UUID(str(session_id_raw))
    except ValueError:
        raise HTTPException(status_code=422, detail="유효하지 않은 session_id 입니다.")

    result = await db.execute(
        select(LearningSession).where(
            LearningSession.id == session_id,
            LearningSession.user_id == user.id,
        )
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    inserted = await dashboard_svc.ingest_watch_events(db, session=session, events=events)
    return {"ingested": inserted}


@router.get("/{lecture_id}/watch-heatmap", summary="재생 구간 히트맵 (슬라이드별 재시청·이탈)")
async def get_watch_heatmap(
    lecture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    await assert_professor_owns_lecture(db, lecture_id, user.id)
    return await dashboard_svc.get_watch_heatmap(db, lecture_id)


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
