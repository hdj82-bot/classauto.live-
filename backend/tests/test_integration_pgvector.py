"""pgvector PostgreSQL 통합 테스트.

docker-compose.test.yml 실행 필요:
    docker-compose -f docker-compose.test.yml up -d
    pytest -m integration -k pgvector --tb=short
"""
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.embedding import SlideEmbedding, EMBEDDING_DIMENSIONS

pytestmark = pytest.mark.integration


# ── 유틸 ─────────────────────────────────────────────────────────────────────

def _fake_embedding(dim: int = EMBEDDING_DIMENSIONS, seed: float = 0.1) -> list[float]:
    """재현 가능한 더미 임베딩 생성."""
    import math
    return [math.sin(seed * (i + 1)) for i in range(dim)]


# ── 테스트: 기본 embedding 저장 및 조회 ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_store_and_retrieve_embedding(pg_db: AsyncSession):
    """SlideEmbedding 저장 후 raw SQL로 조회."""
    task_id = str(uuid.uuid4())
    emb = _fake_embedding(seed=0.5)

    record = SlideEmbedding(
        task_id=task_id,
        slide_number=1,
        text_content="파이썬 변수와 자료형",
        embedding=emb,
    )
    pg_db.add(record)
    await pg_db.flush()

    result = await pg_db.execute(
        text("SELECT id, slide_number, text_content FROM slide_embeddings WHERE task_id = :tid"),
        {"tid": task_id},
    )
    row = result.fetchone()
    assert row is not None
    assert row.slide_number == 1
    assert row.text_content == "파이썬 변수와 자료형"


# ── 테스트: 코사인 유사도 검색 ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cosine_similarity_search(pg_db: AsyncSession):
    """코사인 유사도 <=> 연산자로 가장 유사한 벡터 반환."""
    task_id = str(uuid.uuid4())

    # 3개의 서로 다른 임베딩 저장
    for i, seed in enumerate([0.1, 0.5, 0.9], start=1):
        pg_db.add(SlideEmbedding(
            task_id=task_id,
            slide_number=i,
            text_content=f"슬라이드 {i}",
            embedding=_fake_embedding(seed=seed),
        ))
    await pg_db.flush()

    # seed=0.5와 가장 유사한 벡터 검색 (자기 자신이 최고 유사도)
    query_vec = _fake_embedding(seed=0.5)
    vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"

    result = await pg_db.execute(
        text("""
            SELECT slide_number, text_content,
                   1 - (embedding <=> :qvec::vector) AS similarity
            FROM slide_embeddings
            WHERE task_id = :tid
            ORDER BY embedding <=> :qvec::vector
            LIMIT 1
        """),
        {"qvec": vec_str, "tid": task_id},
    )
    row = result.fetchone()
    assert row is not None
    assert row.slide_number == 2  # seed=0.5 → slide_number=2
    assert float(row.similarity) > 0.99  # 자기 자신이므로 유사도 ≈ 1.0


@pytest.mark.asyncio
async def test_similarity_ordering(pg_db: AsyncSession):
    """유사도 순서가 올바르게 정렬되는지 검증."""
    task_id = str(uuid.uuid4())

    seeds = [0.1, 0.3, 0.5, 0.7, 0.9]
    for i, seed in enumerate(seeds, start=1):
        pg_db.add(SlideEmbedding(
            task_id=task_id,
            slide_number=i,
            text_content=f"슬라이드 {i}",
            embedding=_fake_embedding(seed=seed),
        ))
    await pg_db.flush()

    # seed=0.3 쿼리 → slide_number=2가 1등, 인접한 것이 가까움
    query_vec = _fake_embedding(seed=0.3)
    vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"

    result = await pg_db.execute(
        text("""
            SELECT slide_number,
                   1 - (embedding <=> :qvec::vector) AS similarity
            FROM slide_embeddings
            WHERE task_id = :tid
            ORDER BY embedding <=> :qvec::vector
            LIMIT 3
        """),
        {"qvec": vec_str, "tid": task_id},
    )
    rows = result.fetchall()
    assert len(rows) == 3
    # 첫 번째 결과가 가장 높은 유사도
    assert rows[0].slide_number == 2
    similarities = [float(r.similarity) for r in rows]
    assert similarities == sorted(similarities, reverse=True)


# ── 테스트: HNSW 인덱스 ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_hnsw_index_creation_and_query(pg_db: AsyncSession):
    """HNSW 인덱스 생성 및 인덱스 활용 쿼리 검증."""
    task_id = str(uuid.uuid4())

    # HNSW 인덱스 생성
    await pg_db.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_slide_embeddings_hnsw
        ON slide_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """))

    # 데이터 삽입
    for i in range(10):
        pg_db.add(SlideEmbedding(
            task_id=task_id,
            slide_number=i + 1,
            text_content=f"HNSW 테스트 슬라이드 {i + 1}",
            embedding=_fake_embedding(seed=0.1 * (i + 1)),
        ))
    await pg_db.flush()

    # HNSW 인덱스 사용 쿼리 (SET hnsw.ef_search로 검색 정확도 제어)
    await pg_db.execute(text("SET hnsw.ef_search = 40"))

    query_vec = _fake_embedding(seed=0.55)
    vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"

    result = await pg_db.execute(
        text("""
            SELECT slide_number,
                   1 - (embedding <=> :qvec::vector) AS similarity
            FROM slide_embeddings
            WHERE task_id = :tid
            ORDER BY embedding <=> :qvec::vector
            LIMIT 3
        """),
        {"qvec": vec_str, "tid": task_id},
    )
    rows = result.fetchall()
    assert len(rows) == 3
    # 유사도 내림차순 정렬 확인
    similarities = [float(r.similarity) for r in rows]
    assert similarities == sorted(similarities, reverse=True)
    # seed=0.5 (slide 5) 또는 seed=0.6 (slide 6)이 가장 가까워야 함
    assert rows[0].slide_number in (5, 6)


# ── 테스트: vector 차원 검증 ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_embedding_dimension_matches(pg_db: AsyncSession):
    """저장된 벡터 차원이 EMBEDDING_DIMENSIONS(1536)과 일치하는지 확인."""
    task_id = str(uuid.uuid4())
    emb = _fake_embedding(seed=0.42)
    assert len(emb) == EMBEDDING_DIMENSIONS

    pg_db.add(SlideEmbedding(
        task_id=task_id,
        slide_number=1,
        text_content="차원 검증",
        embedding=emb,
    ))
    await pg_db.flush()

    result = await pg_db.execute(
        text("SELECT vector_dims(embedding) AS dims FROM slide_embeddings WHERE task_id = :tid"),
        {"tid": task_id},
    )
    row = result.fetchone()
    assert row.dims == EMBEDDING_DIMENSIONS


# ── 테스트: task_id 필터링 격리 ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_task_id_isolation(pg_db: AsyncSession):
    """서로 다른 task_id는 검색 결과에 포함되지 않음."""
    task_a = str(uuid.uuid4())
    task_b = str(uuid.uuid4())

    pg_db.add(SlideEmbedding(
        task_id=task_a, slide_number=1,
        text_content="A", embedding=_fake_embedding(seed=0.2),
    ))
    pg_db.add(SlideEmbedding(
        task_id=task_b, slide_number=1,
        text_content="B", embedding=_fake_embedding(seed=0.2),
    ))
    await pg_db.flush()

    query_vec = _fake_embedding(seed=0.2)
    vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"

    result = await pg_db.execute(
        text("""
            SELECT text_content FROM slide_embeddings
            WHERE task_id = :tid
            ORDER BY embedding <=> :qvec::vector
        """),
        {"qvec": vec_str, "tid": task_a},
    )
    rows = result.fetchall()
    assert len(rows) == 1
    assert rows[0].text_content == "A"
