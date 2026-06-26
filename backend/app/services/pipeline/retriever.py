"""pgvector 유사도 검색 서비스."""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.pipeline.embedding import get_embeddings

logger = logging.getLogger(__name__)

# 학생 Q&A 범위 게이트 임계값 (기본 0.4 — 0.7 은 정상 강의 질문도 거부했다).
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


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def _script_segments_for_task(db: Session, task_id: str) -> list[tuple[int, str]]:
    """task_id 강의의 생성된 스크립트 세그먼트 ``[(slide_number(1-based), text)]``.

    강의/영상/스크립트가 없으면 빈 리스트.
    """
    from app.models.lecture import Lecture
    from app.models.video import Video

    lecture = db.query(Lecture).filter(Lecture.pipeline_task_id == task_id).first()
    if lecture is None:
        return []
    video = db.query(Video).filter(Video.lecture_id == lecture.id).first()
    if video is None or video.script is None:
        return []

    out: list[tuple[int, str]] = []
    for seg in video.script.segments or []:
        if not isinstance(seg, dict):
            continue
        text_val = (seg.get("text") or "").strip()
        if not text_val:
            continue
        idx = seg.get("slide_index")
        slide_no = idx + 1 if isinstance(idx, int) else 0
        out.append((slide_no, text_val))
    return out


def _search_stored_script_embeddings(
    db: Session, task_id: str, query_embedding: list[float], top_k: int,
) -> list[RetrievalResult] | None:
    """파이프라인 step3 에서 미리 저장한 스크립트 세그먼트 임베딩을 pgvector 로 조회.

    저장분이 한 건이라도 있으면 결과 리스트(최대 top_k)를 반환한다. 저장분이 전혀 없으면
    (구 강의/미저장) ``None`` 을 돌려줘 호출부가 on-the-fly 폴백으로 넘어가게 한다.
    pgvector 미지원 환경(SQLite 테스트 등)이나 조회 실패도 ``None`` → 폴백.
    """
    vec_str = "[" + ",".join(str(v) for v in query_embedding) + "]"
    sql = text("""
        SELECT slide_number, text_content,
               1 - (embedding <=> :query_vec::vector) AS similarity
        FROM script_segment_embeddings
        WHERE task_id = :task_id
        ORDER BY embedding <=> :query_vec::vector
        LIMIT :top_k
    """)
    try:
        rows = db.execute(
            sql, {"query_vec": vec_str, "task_id": task_id, "top_k": top_k}
        ).fetchall()
    except Exception as exc:
        # pgvector 미지원/조회 오류 — on-the-fly 폴백에 맡긴다.
        logger.warning("저장 스크립트 임베딩 조회 실패(폴백): task_id=%s, error=%s", task_id, exc)
        return None

    if not rows:
        # 저장된 세그먼트 자체가 없음 → 폴백.
        return None

    return [
        RetrievalResult(
            slide_number=row.slide_number,
            text_content=row.text_content,
            similarity=float(row.similarity),
        )
        for row in rows
    ]


def _search_script_on_the_fly(
    db: Session, task_id: str, query_embedding: list[float], top_k: int,
) -> list[RetrievalResult]:
    """저장분이 없을 때의 폴백 — 스크립트 세그먼트를 그 자리에서 임베딩해 비교한다.

    질문 임베딩(query_embedding)은 이미 1회 만들었으므로 세그먼트만 임베딩한다.
    저장 마이그레이션 전에 만들어진 구 강의가 여전히 답하도록 보장한다.
    """
    segments = _script_segments_for_task(db, task_id)
    if not segments:
        return []
    try:
        seg_embs = get_embeddings([t for _, t in segments])
    except Exception as exc:  # 임베딩 실패 시 스크립트 검색만 건너뛴다(슬라이드 검색은 유효).
        logger.error("스크립트 임베딩 검색 실패: task_id=%s, error=%s", task_id, exc)
        return []

    scored = [
        RetrievalResult(
            slide_number=slide_no, text_content=seg_text,
            similarity=_cosine(query_embedding, emb),
        )
        for (slide_no, seg_text), emb in zip(segments, seg_embs)
    ]
    scored.sort(key=lambda r: r.similarity, reverse=True)
    return scored[:top_k]


def search_similar_script(
    db: Session, task_id: str, question: str, top_k: int = 3,
) -> list[RetrievalResult]:
    """생성된 스크립트(발화 텍스트) 세그먼트를 질문과 임베딩 유사도로 검색.

    슬라이드 임베딩(PPT 텍스트)은 step2 에서, 스크립트는 step3 에서 만들어져 스크립트가
    ``slide_embeddings`` 에 없다. 강의 내레이션에만 있는 내용(예: PPT 불릿엔 없지만
    교수자가 말로 설명한 문법 용어)도 범위·답변 컨텍스트에 포함하려고 비교한다.

    비용 증폭 차단(C3-b): 종전에는 질문마다 강의의 **전체 스크립트 세그먼트를** OpenAI
    로 재임베딩했다(질문당 수십 개). 이제 파이프라인 step3 에서 1회 저장한
    ``script_segment_embeddings`` 를 pgvector 로 조회하고, 질문 임베딩만 매번 1회 만든다.
    저장분이 없는 구 강의는 on-the-fly 임베딩으로 폴백한다.
    """
    try:
        query_embedding = get_embeddings([question])[0]
    except Exception as exc:
        logger.error("스크립트 질문 임베딩 실패: task_id=%s, error=%s", task_id, exc)
        return []

    stored = _search_stored_script_embeddings(db, task_id, query_embedding, top_k)
    if stored is not None:
        return stored
    return _search_script_on_the_fly(db, task_id, query_embedding, top_k)
