"""번역 API (app/api/translate.py 흡수)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor
from app.db.session import get_db
from app.models.translation import ScriptTranslation
from app.models.user import User
from app.services.lecture import assert_professor_owns_video
from app.services.pipeline.translator import translate_text

router = APIRouter(prefix="/api/v1/translate", tags=["translate"])


@router.post("/{video_id}", summary="스크립트 번역")
async def translate_video_script(
    video_id: uuid.UUID,
    target_lang: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    video = await assert_professor_owns_video(db, video_id, user.id)

    existing = await db.execute(
        select(ScriptTranslation).where(
            ScriptTranslation.video_id == video_id,
            ScriptTranslation.language == target_lang,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"{target_lang} 번역이 이미 존재합니다.")

    if video.script and video.script.segments:
        texts = [seg.get("text", "") for seg in video.script.segments if seg.get("text")]
        translated_texts = [translate_text(t, target_lang).text for t in texts]
        content = "\n---\n".join(translated_texts)
    else:
        content = ""

    provider = "deepl"  # 실제 사용된 provider는 translator가 결정
    translation = ScriptTranslation(
        video_id=video_id, language=target_lang, content=content, provider=provider,
    )
    db.add(translation)
    await db.commit()

    return {"video_id": str(video_id), "language": target_lang, "status": "completed"}


@router.get("/{video_id}", summary="번역 목록 조회")
async def get_translations(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_professor),
):
    await assert_professor_owns_video(db, video_id, user.id)

    result = await db.execute(
        select(ScriptTranslation).where(ScriptTranslation.video_id == video_id)
    )
    translations = list(result.scalars().all())
    return [
        {
            "id": str(t.id),
            "language": t.language,
            "provider": t.provider,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in translations
    ]
