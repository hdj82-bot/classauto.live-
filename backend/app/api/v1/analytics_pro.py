"""학습 분석 PRO (베타 전용) API — 강의별 분석 + AI 브리핑.

docs/planning/analytics-spec.md A블록. 마케팅 미리보기(/analytics-example)와 별개의
**실기능**이다. 6월 범위(§5): 실 이벤트 수집 전이라 합성 데이터로 분석/판정/AI 를
검증한다 — 요청의 ``scenario`` 로 합성 데이터를 만들고, 추후 실 집계가 같은
``LectureAnalysis`` 인터페이스로 교체된다.

접근 제어: 현재는 교수자 인증(require_professor). 베타테스터 한정 운영자 토글 게이트는
후속 Phase 에서 이 라우터에 의존성으로 덧댄다.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import require_professor
from app.models.user import User
from app.schemas.analytics_pro import BriefingResult, CourseProfile, LectureAnalysis
from app.services.analytics_pro import SCENARIOS, analyze, generate, generate_briefing

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
    _user: User = Depends(require_professor),
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
