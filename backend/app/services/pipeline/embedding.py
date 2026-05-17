"""OpenAI 임베딩 생성 및 pgvector 저장."""
from __future__ import annotations

import logging

import openai
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.metrics import track_external_api
from app.models.embedding import SlideEmbedding
from app.services.pipeline.schemas import SlideContent

logger = logging.getLogger(__name__)


MAX_BATCH_SIZE = 100  # OpenAI 임베딩 배치 제한


@track_external_api("openai")
def get_embeddings(texts: list[str]) -> list[list[float]]:
    """OpenAI text-embedding-3-small로 텍스트 목록을 벡터화."""
    if not texts:
        return []

    client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

    # 빈 텍스트 필터링 + 배치 분할
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), MAX_BATCH_SIZE):
        batch = texts[i:i + MAX_BATCH_SIZE]
        try:
            response = client.embeddings.create(model=settings.EMBEDDING_MODEL, input=batch)
            all_embeddings.extend(item.embedding for item in response.data)
        except openai.APIError as exc:
            logger.error("OpenAI 임베딩 API 실패 (batch %d-%d): %s", i, i + len(batch), exc)
            raise RuntimeError(f"임베딩 생성 실패: {exc}") from exc

    return all_embeddings


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
