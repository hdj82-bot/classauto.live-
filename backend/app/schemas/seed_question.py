"""교수자 Q&A 사전 질문(instructor_seed) API 스키마.

``GET/PUT /api/lectures/{lecture_id}/seed-questions`` 의 요청·응답 모델.

교수자가 영상당 ≤3개의 예상 질문을 미리 등록하면(PUT), 첫 영상처럼 학생 질문
축적이 없을 때도 첫 학생 질문부터 아바타 답변이 나온다. 등록된 질문은
``app.services.pipeline.qa_avatar.upsert_seed_questions`` 가 origin=instructor_seed·
status=pending 행으로 저장하고, 영상 승인(approve) 시 즉시 렌더된다(창2 배치).
"""
from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field

from app.services.pipeline.qa_avatar import SEED_QUESTIONS_MAX


class SeedQuestionItem(BaseModel):
    """저장된 사전 질문 1건 — QAAnswerCache 행을 표시용으로 투영한 것."""

    id: str = Field(..., description="QAAnswerCache 행 id")
    question: str = Field(..., description="질문 텍스트")
    status: str = Field(
        ..., description="렌더 상태: pending | rendering | ready | failed"
    )
    has_clip: bool = Field(
        ..., description="재생 가능한 아바타 클립(s3_video_url) 보유 여부"
    )


class SeedQuestionsRequest(BaseModel):
    """PUT 본문 — 사전 질문 전체 집합(차집합 동기화).

    ``questions`` 는 "최종 상태" 목록이다. 서버는 기존 instructor_seed 집합을 이
    목록에 맞춘다(같은 텍스트 보존·빠진 항목 삭제·새 항목 추가). 4개 이상이면
    Pydantic 이 422 로 거부하고, trim·빈값·중복 정리는 서비스가 수행한다.
    """

    questions: list[Annotated[str, Field(max_length=500)]] = Field(
        default_factory=list,
        max_length=SEED_QUESTIONS_MAX,
        description="질문 텍스트 목록(영상당 최대 3개). 초과 시 422.",
    )


class SeedQuestionsResponse(BaseModel):
    """GET·PUT 응답 — 현재 사전 질문 + 이번 달 Q&A 렌더 한도/사용량."""

    questions: list[SeedQuestionItem]
    max: int = Field(..., description="영상당 사전 질문 최대 개수")
    used_this_month: int = Field(..., description="이번 달 이미 사용한 Q&A 렌더 수")
    remaining: int = Field(..., description="이번 달 남은 Q&A 렌더 수")
