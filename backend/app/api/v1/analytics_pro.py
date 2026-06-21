"""학습 분석 PRO (베타 전용) API — 강의별 분석(A) + 학기 전체 분석(B).

docs/planning/analytics-spec.md A·B블록. 마케팅 미리보기(/analytics-example)와 별개의
**실기능**이다. 6월 범위(§5): 실 이벤트 수집 전이라 합성 데이터로 분석/판정/AI 를
검증한다 — 추후 실 집계가 같은 응답 인터페이스로 교체된다.

- A(강의별, 매주): POST /briefing — scenario 합성 → 집계·판정·AI 브리핑(§2).
- B(학기 전체, 10주차~학기말): POST /semester/{trend,survey,review} (§3).

접근 제어: 교수자 인증 + 베타테스터 토글(require_analytics_pro). 운영자 콘솔
(/admin/users)에서 사용자별 ``analytics_pro_enabled`` 를 켠 베타테스터와 운영자만
접근한다. 전역 킬스위치는 settings.ANALYTICS_PRO_ENABLED.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import require_analytics_pro
from app.models.user import User
from app.schemas.analytics_pro import (
    BriefingResult,
    CourseProfile,
    LectureAnalysis,
    SemesterProfile,
    SemesterReview,
    SemesterTrend,
    SurveyResponseDist,
    SurveyResult,
)
from app.services.analytics_pro import (
    SCENARIOS,
    analyze,
    generate,
    generate_briefing,
    generate_review,
    generate_survey,
    synthesize_responses,
    synthesize_trend,
)

router = APIRouter(prefix="/api/v1/analytics-pro", tags=["analytics-pro"])


class BriefingRequest(BaseModel):
    course_profile: CourseProfile
    scenario: str = "excelling"   # 6월: 합성 데이터 시나리오(SCENARIOS 중 하나)
    count: int = Field(40, ge=1, le=500)
    seed: int = 1


class BriefingResponse(BaseModel):
    analysis: LectureAnalysis
    ai: BriefingResult


@router.post(
    "/briefing",
    response_model=BriefingResponse,
    summary="강의별 분석 + AI 대면수업 브리핑(합성 데이터·§2.4)",
)
async def post_briefing(
    body: BriefingRequest,
    _user: User = Depends(require_analytics_pro),
) -> BriefingResponse:
    """``course_profile`` + 시나리오로 합성 데이터를 만들어 집계·판정·AI 브리핑을 반환.

    AI 키가 없거나 실패하면 규칙 기반 브리핑으로 폴백한다(항상 결과 반환).
    """
    if body.scenario not in SCENARIOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"scenario must be one of {list(SCENARIOS)}",
        )
    students = generate(body.course_profile, body.scenario, count=body.count, seed=body.seed)
    analysis = analyze(students, body.course_profile)
    ai = await generate_briefing(analysis, body.course_profile)
    return BriefingResponse(analysis=analysis, ai=ai)


# ── B. 학기 전체 분석(§3) — 10주차~학기말 ────────────────────────────────────


class SemesterRequest(BaseModel):
    profile: SemesterProfile
    seed: int = 1


class SurveyRequest(BaseModel):
    course_profile: CourseProfile


class SurveyResultsResponse(BaseModel):
    survey: SurveyResult
    responses: list[SurveyResponseDist]


class ReviewRequest(BaseModel):
    profile: SemesterProfile
    seed: int = 1


@router.post(
    "/semester/trend",
    response_model=SemesterTrend,
    summary="주차별 학습효율 추이 + 타임라인(§3.3, 합성 집계)",
)
async def post_semester_trend(
    body: SemesterRequest,
    _user: User = Depends(require_analytics_pro),
) -> SemesterTrend:
    """1주~현재까지 누적 지표와 1주 대비 상승폭(ClassAuto 도입 효과)을 반환.

    분석 마감 주차(= 학기주차−1)·개방 여부(10주차)는 ``timeline`` 에 포함된다(§3.1).
    """
    return synthesize_trend(body.profile, seed=body.seed)


@router.post(
    "/semester/survey",
    response_model=SurveyResultsResponse,
    summary="학기말 설문 자동생성 + 응답 분포(§3.4·§3.5)",
)
async def post_semester_survey(
    body: SurveyRequest,
    _user: User = Depends(require_analytics_pro),
) -> SurveyResultsResponse:
    """문항(근거·DOI) 자동생성 + 데모용 응답 분포. AI 실패 시 규칙기반 폴백.

    상단 경고(교수자 검토 필수·DOI 실재 확인, §3.7)는 ``survey.warning`` 에 고정.
    """
    survey = await generate_survey(body.course_profile)
    responses = synthesize_responses(survey)
    return SurveyResultsResponse(survey=survey, responses=responses)


@router.post(
    "/semester/review",
    response_model=SemesterReview,
    summary="학기 총평[PRO] + 논문 제안(§3.6)",
)
async def post_semester_review(
    body: ReviewRequest,
    _user: User = Depends(require_analytics_pro),
) -> SemesterReview:
    """주차별 추이를 근거로 교육공학 이론 기반 총평·논문 제안을 반환. 폴백 지원."""
    trend = synthesize_trend(body.profile, seed=body.seed)
    return await generate_review(body.profile.course, trend)
