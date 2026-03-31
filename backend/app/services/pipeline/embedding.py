"""OpenAI 임베딩 생성 및 pgvector 저장."""
from __future__ import annotations

import logging

import openai
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.embedding import SlideEmbedding
from app.services.pipeline.schemas import SlideContent

logger = logging.getLogger(__name__)


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """OpenAI text-embedding-3-small로 텍스트 목록을 벡터화."""
    client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
    response = client.embeddings.create(model=settings.EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in response.data]


def store_slide_embeddings(db: Session, task_id: str, slides: list[SlideContent]) -> int:
    """슬라이드 텍스트를 임베딩하여 DB에 저장. 저장 수 반환."""
    slide_texts: list[tuple[int, str]] = []
    for slide in slides:
        combined = "\n".join(slide.texts)
        if slide.speaker_notes:
            combined = f"{slide.speaker_notes}\n{combined}"
        combined = combined.strip()
        if combined:
            slide_texts.append((slide.slide_number, combined))

    if not slide_texts:
        logger.info("임베딩할 텍스트가 없습니다.")
        return 0

    texts = [t[1] for t in slide_texts]
    embeddings = get_embeddings(texts)

    records = [
        SlideEmbedding(
            task_id=task_id,
            slide_number=slide_num,
            text_content=text,
            embedding=emb,
        )
        for (slide_num, text), emb in zip(slide_texts, embeddings)
    ]
    db.add_all(records)
    db.flush()
    logger.info("태스크 %s: %d개 슬라이드 임베딩 저장 완료", task_id, len(records))
    return len(records)
