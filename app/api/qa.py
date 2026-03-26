"""Q&A API 라우터."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.qa import QALog
from app.services.qa import answer_question

router = APIRouter(prefix="/api", tags=["qa"])


# --------------------------------------------------------------------------
# 스키마
# --------------------------------------------------------------------------

class QARequest(BaseModel):
    task_id: str = Field(description="강의(PPT)의 task_id")
    session_id: str = Field(description="학습자 세션 ID")
    question: str = Field(min_length=1, description="학습자 질문")


class SlideRef(BaseModel):
    slide_number: int
    similarity: float


class QAResponse(BaseModel):
    answer: str
    in_scope: bool
    references: list[SlideRef] = Field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


class QALogItem(BaseModel):
    question: str
    answer: str
    in_scope: bool
    top_slide_numbers: str
    top_similarity: float | None
    cost_usd: float
    created_at: str


class QAHistoryResponse(BaseModel):
    session_id: str
    count: int
    logs: list[QALogItem]


# --------------------------------------------------------------------------
# POST /api/qa — 질문 → RAG 답변
# --------------------------------------------------------------------------

@router.post("/qa", response_model=QAResponse)
async def ask_question(body: QARequest, db: Session = Depends(get_db)):
    """학습자 질문을 받아 RAG 기반 답변을 반환한다."""
    result = answer_question(db, body.task_id, body.session_id, body.question)

    return QAResponse(
        answer=result.answer,
        in_scope=result.in_scope,
        references=[
            SlideRef(slide_number=r.slide_number, similarity=round(r.similarity, 4))
            for r in result.top_slides
        ],
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=result.cost_usd,
    )


# --------------------------------------------------------------------------
# GET /api/qa/{session_id} — 세션별 Q&A 이력 조회
# --------------------------------------------------------------------------

@router.get("/qa/{session_id}", response_model=QAHistoryResponse)
async def get_qa_history(session_id: str, db: Session = Depends(get_db)):
    """세션 ID별 Q&A 이력을 반환한다."""
    logs = (
        db.query(QALog)
        .filter(QALog.session_id == session_id)
        .order_by(QALog.created_at.asc())
        .all()
    )

    if not logs:
        raise HTTPException(status_code=404, detail="해당 세션의 Q&A 이력이 없습니다.")

    return QAHistoryResponse(
        session_id=session_id,
        count=len(logs),
        logs=[
            QALogItem(
                question=log.question,
                answer=log.answer,
                in_scope=log.in_scope,
                top_slide_numbers=log.top_slide_numbers or "",
                top_similarity=log.top_similarity,
                cost_usd=log.cost_usd,
                created_at=log.created_at.isoformat(),
            )
            for log in logs
        ],
    )
