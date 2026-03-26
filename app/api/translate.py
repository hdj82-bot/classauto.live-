"""번역 API 라우터."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.translation import ScriptTranslation
from app.models.video import Script, Slide, Video
from app.tasks.translate import translate_scripts

router = APIRouter(prefix="/api/v1", tags=["translation"])


# --------------------------------------------------------------------------
# 스키마
# --------------------------------------------------------------------------

class TranslateRequest(BaseModel):
    languages: list[str] = Field(
        description="번역 대상 언어 목록 (ISO 639-1)",
        examples=[["en", "vi", "zh"]],
    )


class TranslateResponse(BaseModel):
    task_id: str
    celery_task_id: str
    languages: list[str]
    message: str = "번역 태스크가 시작되었습니다."


class TranslationItem(BaseModel):
    slide_number: int
    language: str
    content: str
    provider: str


class TranslationsResponse(BaseModel):
    task_id: str
    total: int
    translations: list[TranslationItem]


# --------------------------------------------------------------------------
# POST /videos/{task_id}/translate — 번역 시작
# --------------------------------------------------------------------------

@router.post("/videos/{task_id}/translate", response_model=TranslateResponse)
async def start_translation(
    task_id: str,
    body: TranslateRequest,
    db: Session = Depends(get_db),
):
    """특정 Video의 스크립트를 다국어 번역한다 (Celery 비동기)."""
    video = db.query(Video).filter(Video.task_id == task_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="해당 task_id를 찾을 수 없습니다.")

    # 스크립트 존재 확인
    script_count = (
        db.query(Script)
        .join(Slide)
        .filter(Slide.video_id == video.id)
        .count()
    )
    if script_count == 0:
        raise HTTPException(status_code=400, detail="번역할 스크립트가 없습니다.")

    result = translate_scripts.delay(task_id, body.languages)

    return TranslateResponse(
        task_id=task_id,
        celery_task_id=result.id,
        languages=body.languages,
    )


# --------------------------------------------------------------------------
# GET /videos/{task_id}/translations — 번역 결과 조회
# --------------------------------------------------------------------------

@router.get("/videos/{task_id}/translations", response_model=TranslationsResponse)
async def get_translations(
    task_id: str,
    language: str | None = None,
    db: Session = Depends(get_db),
):
    """번역 결과를 조회한다. language 쿼리 파라미터로 필터링 가능."""
    video = db.query(Video).filter(Video.task_id == task_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="해당 task_id를 찾을 수 없습니다.")

    query = (
        db.query(ScriptTranslation, Slide.slide_number)
        .join(Script, ScriptTranslation.script_id == Script.id)
        .join(Slide, Script.slide_id == Slide.id)
        .filter(Slide.video_id == video.id)
    )

    if language:
        query = query.filter(ScriptTranslation.language == language)

    query = query.order_by(Slide.slide_number, ScriptTranslation.language)
    rows = query.all()

    items = [
        TranslationItem(
            slide_number=slide_number,
            language=tr.language,
            content=tr.content,
            provider=tr.provider,
        )
        for tr, slide_number in rows
    ]

    return TranslationsResponse(
        task_id=task_id,
        total=len(items),
        translations=items,
    )
