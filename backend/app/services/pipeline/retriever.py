"""pgvector 유사도 검색 서비스."""
from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.pipeline.embedding import get_embeddings

logger = logging.getLogger(__name__)

# 설정 가능한 유사도 임계값 (기본 0.4 — 0.7 은 너무 엄격해 정상 질문도 거부됨)
SIMILARITY_THRESHOLD = float(getattr(settings, "SIMILARITY_THRESHOLD", 0.4))


@dataclass
class RetrievalResult:
    slide_number: int
    text_content: str
    similarity: float


def search_similar_slides(
    db: Session, task_id: str, query: str, top_k: int = 3,
    threshold: float | None = None,
) -> list[RetrievalResult]:
    """질문 텍스트로 pgvector 코사인 유사도 검색."""
    try:
        query_embedding = get_embeddings([query])[0]
    except Exception as exc:
        logger.error("임베딩 생성 실패: query=%s, error=%s", query[:100], exc)
        return []

    # 벡터를 PostgreSQL array 문자열로 변환 (파라미터 바인딩으로 안전하게 전달)
    vec_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    sql = text("""
        SELECT slide_number, text_content,
               1 - (embedding <=> :query_vec::vector) AS similarity
        FROM slide_embeddings
        WHERE task_id = :task_id
        ORDER BY embedding <=> :query_vec::vector
        LIMIT :top_k
    """)

    try:
        rows = db.execute(
            sql, {"query_vec": vec_str, "task_id": task_id, "top_k": top_k}
        ).fetchall()
    except Exception as exc:
        logger.error("pgvector 검색 실패: task_id=%s, error=%s", task_id, exc)
        return []

    results = [
        RetrievalResult(
            slide_number=row.slide_number,
            text_content=row.text_content,
            similarity=float(row.similarity),
        )
        for row in rows
    ]

    logger.info(
        "검색 완료 — task_id=%s, 결과=%d건, 최고유사도=%.4f",
        task_id, len(results), results[0].similarity if results else 0.0,
    )
    return results


def is_in_scope(results: list[RetrievalResult], threshold: float | None = None) -> bool:
    if not results:
        return False
    return results[0].similarity >= (threshold or SIMILARITY_THRESHOLD)
