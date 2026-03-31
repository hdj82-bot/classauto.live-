"""Q&A API — RAG 기반 질의응답."""
import asyncio
import uuid
from functools import partial

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_current_user, require_student
from app.db.session import SyncSessionLocal
from app.models.user import User
from app.services.pipeline.qa import answer_question

router = APIRouter(prefix="/api/v1/qa", tags=["qa"])


class QARequest(BaseModel):
    session_id: uuid.UUID
    task_id: uuid.UUID
    question: str


@router.post("", summary="Q&A 질문")
async def ask_question(
    body: QARequest,
    user: User = Depends(require_student),
):
    loop = asyncio.get_event_loop()

    def _run():
        with SyncSessionLocal() as db:
            return answer_question(db, str(body.task_id), str(body.session_id), body.question)

    try:
        result = await loop.run_in_executor(None, _run)
    except Exception:
        raise HTTPException(status_code=500, detail="Q&A 처리 중 오류가 발생했습니다.")

    return {
        "answer": result.answer,
        "in_scope": result.in_scope,
        "cost_usd": result.cost_usd,
    }
