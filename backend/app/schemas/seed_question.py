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
    answer: str = Field(
        "", description="교수자가 입력한 사전 대답(비어 있으면 영상 생성 시 RAG 로 자동 생성)"
    )
    status: str = Field(
        ..., description="렌더 상태: pending | rendering | ready | failed"
    )
    has_clip: bool = Field(
        ..., description="재생 가능한 아바타 클립(s3_video_url) 보유 여부"
    )
    preview_url: str | None = Field(
        None, description="ready 인 경우 점검용 클립 presigned URL(아니면 null)"
    )
    error_message: str | None = Field(
        None, description="status=failed 인 경우 실패 사유(교수자에게 표시). 아니면 null."
    )


class SeedQuestionInput(BaseModel):
    """PUT 항목 — 교수자가 입력하는 질문 + (선택) 사전 대답."""

    question: Annotated[str, Field(max_length=500)] = Field(..., description="질문 텍스트")
    # 답변 길이 상한 400자(어느 언어로 만들든 동일 — VisionStory 렌더 영상 초당 과금이라
    # 답변이 길수록 비용↑, 2026-06-16 사용자 결정). 400자 초과 입력은 거부.
    answer: Annotated[str, Field(max_length=400)] = Field(
        "", description="사전 대답(400자 이하). 비우면 영상 생성 시 강의 자료 기반 RAG 로 자동 생성."
    )


class SeedQuestionsRequest(BaseModel):
    """PUT 본문 — 사전 질문 전체 집합(차집합 동기화).

    ``questions`` 는 "최종 상태" 목록이다. 서버는 기존 instructor_seed 집합을 이
    목록에 맞춘다(같은 질문 텍스트 보존·빠진 항목 삭제·새 항목 추가·답변 변경 시
    재렌더). 4개 이상이면 Pydantic 이 422 로 거부하고, trim·빈 질문·중복 정리는
    서비스가 수행한다.
    """

    questions: list[SeedQuestionInput] = Field(
        default_factory=list,
        max_length=SEED_QUESTIONS_MAX,
        description="질문(+선택 답변) 목록(영상당 최대 3개). 초과 시 422.",
    )


class SeedQuestionsResponse(BaseModel):
    """GET·PUT 응답 — 현재 사전 질문 + 이번 달 Q&A 렌더 한도/사용량."""

    questions: list[SeedQuestionItem]
    max: int = Field(..., description="영상당 사전 질문 최대 개수")
    used_this_month: int = Field(..., description="이번 달 이미 사용한 Q&A 렌더 수")
    remaining: int = Field(..., description="이번 달 남은 Q&A 렌더 수")
    qa_avatar_stale: bool = Field(
        default=False,
        description=(
            "현재 강의 아바타/음성이 이미 렌더된(ready) 사전질문 클립의 것과 달라, "
            "'다시 제작' 시 그 클립을 새 아바타로 다시 만들어야 하는지 여부."
        ),
    )
    # C-2: 강의당 아바타 제작 횟수 상한(첫 제작 1 + 재제작 N). 프론트가 "재제작 N회
    # 남음" 안내·차단에 사용. 무제한 계정/상한 비활성은 큰 sentinel 값이 온다.
    avatar_render_count: int = Field(
        default=0, description="이 강의의 누적 아바타 제작 패스 수"
    )
    avatar_rerender_remaining: int = Field(
        default=0, description="이 강의에 남은 아바타 제작 횟수(상한 − 누적)"
    )
    avatar_rerender_max: int = Field(
        default=0, description="강의당 아바타 제작 횟수 상한(설정값)"
    )


class GenerateSeedAnswerRequest(BaseModel):
    """POST .../seed-questions/generate-answer 본문 — 답변을 생성할 질문 1건."""

    question: Annotated[str, Field(min_length=1, max_length=500)] = Field(
        ..., description="답변을 자동 생성할 학생 질문"
    )


class GenerateSeedAnswerResponse(BaseModel):
    """AI 자동 생성 답변 결과 — 교수자가 검토·수정 후 저장한다."""

    answer: str = Field(..., description="PPT 기반 생성 답변(범위 밖이면 빈 문자열)")
    in_scope: bool = Field(..., description="강의 자료 범위 안 질문 여부")


class GenerateSeedQuestionsRequest(BaseModel):
    """POST .../seed-questions/generate 본문(선택).

    ``exclude``: 이미 다른 카드에 들어 있는 질문들. 프론트가 카드별로 1개씩 생성할 때,
    이미 만든 질문의 주제를 피해 강의의 또 다른 핵심을 뽑게 하려고 넘긴다(같은 어순 질문이
    3카드에 반복되던 문제 방지). 본문이 없거나 비어 있으면 평소대로 가장 중요한 핵심부터 뽑는다.
    """

    exclude: list[Annotated[str, Field(max_length=500)]] = Field(
        default_factory=list,
        max_length=SEED_QUESTIONS_MAX,
        description="이미 만든(피해야 할) 질문 목록 — 이 주제와 겹치지 않는 질문을 생성한다.",
    )


class GeneratedSeedQuestion(BaseModel):
    """AI 가 자동 선정한 핵심 질문 1건 + 사전 답변."""

    question: str = Field(..., description="자동 선정된 핵심 질문")
    answer: str = Field("", description="해당 질문의 사전 답변(강의 자료 기반)")


class GenerateSeedQuestionsResponse(BaseModel):
    """"질문과 답변 자동 생성" 결과 — 교수자가 검토·수정 후 저장한다.

    질문·답변은 강의 발화 언어(lecture.voice_lang)로 작성된다.
    """

    questions: list[GeneratedSeedQuestion] = Field(
        default_factory=list, description="자동 생성된 핵심 질문 + 사전 답변(최대 3개)"
    )
