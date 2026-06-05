"""인사이트 보고서 + 재생 히트맵 백엔드 통합 테스트.

docs/verification/03-insights-report.md 의 검증 항목을 코드로 고정한다.
ANTHROPIC_API_KEY 미설정(테스트 기본) → 규칙 기반 합성 경로로 동작하므로 외부
호출 없이 결정적으로 검증된다.
"""
import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assessment_result import AssessmentResult
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.session import LearningSession, SessionStatus
from app.services.insights import briefing as briefing_svc
from app.services.insights.models import WatchEvent
from tests.conftest import make_auth_header


@pytest_asyncio.fixture
async def student_session(db: AsyncSession, lecture: Lecture, student) -> LearningSession:
    sess = LearningSession(
        id=uuid.uuid4(),
        user_id=student.id,
        lecture_id=lecture.id,
        status=SessionStatus.in_progress,
        progress_pct=40.0,
        watched_sec=120,
        total_sec=300,
        warning_level=2,
        no_response_cnt=3,
    )
    db.add(sess)
    await db.flush()
    return sess


# ── 재생 이벤트 적재 + 히트맵 ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ingest_watch_events_and_heatmap(
    client, professor, student, lecture, student_session
):
    """학생이 배치 전송한 재생 이벤트가 적재되고, 교수자 히트맵에 슬라이드별로 집계된다."""
    events = [
        {"event_type": "segment_enter", "slide_index": 0, "position_seconds": 0},
        {"event_type": "segment_complete", "slide_index": 0, "position_seconds": 30,
         "meta": {"dwell_seconds": 30}},
        {"event_type": "segment_enter", "slide_index": 1, "position_seconds": 30},
        {"event_type": "rewatch", "slide_index": 1, "position_seconds": 32},
        {"event_type": "segment_enter", "slide_index": 1, "position_seconds": 40},
        # 슬라이드 1 은 진입 2회·완료 0 → drops=2, replays=rewatch1+(enters2-distinct1)=2
        {"event_type": "totally_unknown_type", "slide_index": 9},  # 무시되어야 함
    ]
    resp = await client.post(
        "/api/v1/dashboard/watch-events",
        json={"session_id": str(student_session.id), "events": events},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 200
    assert resp.json()["ingested"] == 5  # unknown 1건 제외

    heat = await client.get(
        f"/api/v1/dashboard/{lecture.id}/watch-heatmap",
        headers=make_auth_header(professor),
    )
    assert heat.status_code == 200
    slides = {s["index"]: s for s in heat.json()["slides"]}
    assert slides[0]["drops"] == 0
    assert slides[0]["completionPct"] == 100.0
    assert slides[0]["durationSec"] == 30
    assert slides[1]["drops"] == 2
    assert slides[1]["replays"] == 2


@pytest.mark.asyncio
async def test_ingest_watch_events_foreign_session_404(
    client, student, lecture, db: AsyncSession, professor
):
    """다른 사람의 세션 id 로는 적재할 수 없다(소유권 검증)."""
    other = LearningSession(
        id=uuid.uuid4(), user_id=professor.id, lecture_id=lecture.id,
        status=SessionStatus.in_progress,
    )
    db.add(other)
    await db.flush()
    resp = await client.post(
        "/api/v1/dashboard/watch-events",
        json={"session_id": str(other.id), "events": [{"event_type": "play"}]},
        headers=make_auth_header(student),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_ingest_watch_events_requires_student(client, professor, lecture):
    resp = await client.post(
        "/api/v1/dashboard/watch-events",
        json={"session_id": str(uuid.uuid4()), "events": []},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 403


# ── 보고서 엔드포인트 ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_report_requires_owner_professor(client, student, lecture):
    resp = await client.get(
        f"/api/v1/insights/{lecture.id}/report",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_report_other_professor_404(client, db: AsyncSession, lecture):
    """소유하지 않은 교수자는 404."""
    from app.models.user import User, UserRole
    other = User(
        id=uuid.uuid4(), google_sub="g-other-prof", email="other@test.ac.kr",
        name="다른 교수", role=UserRole.professor, is_active=True,
    )
    db.add(other)
    await db.flush()
    resp = await client.get(
        f"/api/v1/insights/{lecture.id}/report",
        headers=make_auth_header(other),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_report_mock_path_structure(
    client, professor, lecture, monkeypatch
):
    """키 미설정 시 규칙 기반(mock) 합성 — 스키마·플래그 검증."""
    monkeypatch.setattr(briefing_svc.settings, "ANTHROPIC_API_KEY", "", raising=False)
    resp = await client.get(
        f"/api/v1/insights/{lecture.id}/report",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["lecture_id"] == str(lecture.id)
    brief = body["briefing"]
    assert brief["model"] == briefing_svc.MOCK_MODEL
    assert brief["is_ai_generated"] is False
    payload = brief["payload"]
    for key in ("summary", "weak_concepts", "recommendations", "class_vs_individual"):
        assert key in payload
    assert "evidence" in body
    assert "weak_concepts" in body["evidence"]
    assert body["briefing"]["source_window"]["totals"] is not None


@pytest.mark.asyncio
async def test_report_surfaces_weak_concept_from_quiz(
    client, professor, lecture, student, student_session, db: AsyncSession, monkeypatch
):
    """저정답률 카테고리가 evidence.weak_concepts 와 브리핑에 드러난다."""
    monkeypatch.setattr(briefing_svc.settings, "ANTHROPIC_API_KEY", "", raising=False)
    # 카테고리 '성조' 4문항 중 1개만 정답 → 정답률 25% (< 70% 임계).
    for i in range(4):
        db.add(AssessmentResult(
            id=uuid.uuid4(), lecture_id=lecture.id, session_id=student_session.id,
            user_id=student.id, question_type="multiple_choice",
            question_text=f"성조 문항 {i}", correct_answer="0", user_answer="1",
            is_correct=(i == 0), category="성조",
        ))
    await db.flush()
    resp = await client.get(
        f"/api/v1/insights/{lecture.id}/report",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    concepts = [c["concept"] for c in resp.json()["evidence"]["weak_concepts"]]
    assert "성조" in concepts


@pytest.mark.asyncio
async def test_report_caches_within_interval(
    client, professor, lecture, monkeypatch
):
    """재생성 간격 내 재호출은 같은 브리핑(캐시)을 반환 — 비용 가드레일."""
    monkeypatch.setattr(briefing_svc.settings, "ANTHROPIC_API_KEY", "", raising=False)
    r1 = await client.get(
        f"/api/v1/insights/{lecture.id}/report", headers=make_auth_header(professor)
    )
    r2 = await client.get(
        f"/api/v1/insights/{lecture.id}/report", headers=make_auth_header(professor)
    )
    assert r1.json()["briefing"]["id"] == r2.json()["briefing"]["id"]


@pytest.mark.asyncio
async def test_report_csv_download(client, professor, lecture, monkeypatch):
    monkeypatch.setattr(briefing_svc.settings, "ANTHROPIC_API_KEY", "", raising=False)
    resp = await client.get(
        f"/api/v1/insights/{lecture.id}/report.csv",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers["content-disposition"]
    assert "대면수업 솔루션 보고서" in resp.text
