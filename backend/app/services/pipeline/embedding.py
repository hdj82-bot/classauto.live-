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

    # 명시적 타임아웃 — 기본값(600초)이면 OpenAI 가 응답을 안 주는 순간 Q&A 요청이
    # 사실상 무한 대기("..." 멈춤)에 빠진다. 20초로 제한해, 장애 시 빠르게 예외를 내고
    # 호출부(search_similar_script 등)가 폴백·거부로 넘어가게 한다.
    client = openai.OpenAI(api_key=settings.OPENAI_API_KEY, timeout=20.0)

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


def store_slide_embeddings(
    db: Session,
    task_id: str,
    slides: list[SlideContent],
    slide_image_urls: dict[int, str] | None = None,
) -> int:
    """슬라이드 텍스트를 임베딩하여 DB에 저장. 저장 수 반환.

    Args:
        db: SQLAlchemy 세션.
        task_id: 파이프라인 task_id (SlideEmbedding.task_id 컬럼).
        slides: 파싱된 슬라이드 콘텐츠.
        slide_image_urls: ``{slide_number: https_url}`` 매핑. step1 에서
            LibreOffice 로 렌더한 슬라이드 PNG 의 S3 URL. 렌더 실패한 슬라이드
            는 키 자체가 누락되며 그 행의 ``slide_image_url`` 은 NULL 로 저장.
            None (기본값) 이면 빈 dict 와 동일.
    """
    image_url_map = slide_image_urls or {}
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
            slide_image_url=image_url_map.get(slide_num),
        )
        for (slide_num, text), emb in zip(slide_texts, embeddings)
    ]
    db.add_all(records)
    db.flush()
    logger.info("태스크 %s: %d개 슬라이드 임베딩 저장 완료", task_id, len(records))
    return len(records)
