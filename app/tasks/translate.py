"""스크립트 번역 Celery 태스크."""

from __future__ import annotations

import logging

from app.celery_app import celery
from app.database import SessionLocal
from app.models.translation import ScriptTranslation
from app.models.video import Script, Video
from app.services.translator import translate_batch

logger = logging.getLogger(__name__)


@celery.task(bind=True, name="translate.translate_scripts")
def translate_scripts(self, task_id: str, target_languages: list[str]) -> dict:
    """특정 Video의 전체 스크립트를 다국어 번역한다.

    Parameters
    ----------
    task_id : Video의 task_id
    target_languages : 번역 대상 언어 목록 (예: ["en", "vi", "zh"])
    """
    db = SessionLocal()
    try:
        video = db.query(Video).filter(Video.task_id == task_id).one()
        scripts = (
            db.query(Script)
            .join(Script.slide)
            .filter(Script.slide.has(video_id=video.id))
            .order_by(Script.slide_id)
            .all()
        )

        if not scripts:
            logger.warning("번역할 스크립트가 없습니다: task_id=%s", task_id)
            return {"task_id": task_id, "translated": 0}

        total_translated = 0

        for lang in target_languages:
            logger.info("[번역] %s → %s 시작 (%d건)", "ko", lang, len(scripts))

            # 이미 번역된 스크립트 제외
            existing = set(
                db.query(ScriptTranslation.script_id)
                .filter(
                    ScriptTranslation.script_id.in_([s.id for s in scripts]),
                    ScriptTranslation.language == lang,
                )
                .all()
            )
            existing_ids = {row[0] for row in existing}
            to_translate = [s for s in scripts if s.id not in existing_ids]

            if not to_translate:
                logger.info("[번역] %s: 이미 모두 번역됨, 스킵", lang)
                continue

            # 배치 번역
            texts = [s.content for s in to_translate]
            results = translate_batch(texts, target_lang=lang, source_lang="ko")

            # DB 저장
            for script, result in zip(to_translate, results):
                db.add(
                    ScriptTranslation(
                        script_id=script.id,
                        language=lang,
                        content=result.text,
                        provider=result.provider,
                    )
                )

            db.commit()
            total_translated += len(to_translate)
            logger.info("[번역] %s: %d건 완료 (provider 혼합 가능)", lang, len(to_translate))

        return {
            "task_id": task_id,
            "languages": target_languages,
            "translated": total_translated,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
