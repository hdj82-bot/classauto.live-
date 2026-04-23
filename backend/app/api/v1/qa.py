"""Q&A API — RAG 기반 질의응답."""
import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import require_student
from app.db.session import SyncSessionLocal
from app.models.lecture import Lecture
from app.models.user import User
from app.services.pipeline.qa import answer_question

router = APIRouter(prefix="/api/v1/qa", tags=["qa"])


class QARequest(BaseModel):
    session_id: uuid.UUID
    lecture_id: uuid.UUID
    question: str


@router.post("", summary="Q&A 질문")
async def ask_question(
    body: QARequest,
    user: User = Depends(require_student),
):
    loop = asyncio.get_event_loop()

    def _run():
        with SyncSessionLocal() as db:
            lecture = db.execute(
                select(Lecture).where(Lecture.id == body.lecture_id)
            ).scalar_one_or_none()
            if not lecture or not lecture.pipeline_task_id:
                raise LookupError("강의 파이프라인이 아직 처리되지 않았습니다.")
            return answer_question(db, lecture.pipeline_task_id, str(body.session_id), body.question)

    try:
        result = await loop.run_in_executor(None, _run)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=500, detail="Q&A 처리 중 오류가 발생했습니다.")

    return {
        "answer": result.answer,
        "in_scope": result.in_scope,
        "cost_usd": result.cost_usd,
    }
