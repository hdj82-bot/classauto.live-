"""pgvector 유사도 검색 서비스."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.services.embedding import get_embeddings

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.75


@dataclass
class RetrievalResult:
    slide_number: int
    slide_id: int
    text_content: str
    similarity: float


def search_similar_slides(
    db: Session,
    task_id: str,
    query: str,
    top_k: int = 3,
) -> list[RetrievalResult]:
    """질문 텍스트로 pgvector 코사인 유사도 검색을 수행한다.

    Returns
    -------
    list[RetrievalResult] : 유사도 내림차순 상위 top_k 결과
    """
    # 질문 임베딩 생성
    query_embedding = get_embeddings([query])[0]

    # pgvector 코사인 유사도 검색 (1 - cosine_distance)
    sql = text("""
        SELECT
            slide_number,
            slide_id,
            text_content,
            1 - (embedding <=> :query_vec::vector) AS similarity
        FROM slide_embeddings
        WHERE task_id = :task_id
        ORDER BY embedding <=> :query_vec::vector
        LIMIT :top_k
    """)

    rows = db.execute(
        sql,
        {
            "query_vec": str(query_embedding),
            "task_id": task_id,
            "top_k": top_k,
        },
    ).fetchall()

    results = [
        RetrievalResult(
            slide_number=row.slide_number,
            slide_id=row.slide_id,
            text_content=row.text_content,
            similarity=float(row.similarity),
        )
        for row in rows
    ]

    logger.info(
        "검색 완료 — task_id=%s, 결과=%d건, 최고유사도=%.4f",
        task_id,
        len(results),
        results[0].similarity if results else 0.0,
    )
    return results


def is_in_scope(results: list[RetrievalResult]) -> bool:
    """상위 결과의 최고 유사도가 임계값 이상인지 판정한다."""
    if not results:
        return False
    return results[0].similarity >= SIMILARITY_THRESHOLD
