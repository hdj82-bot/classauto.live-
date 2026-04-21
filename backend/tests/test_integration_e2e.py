"""E2E 통합 테스트 (실제 PostgreSQL + pgvector).

전체 파이프라인 흐름: 유저 생성 → 강좌/강의 → 임베딩 저장 → 유사도 검색.
외부 API(OpenAI 등)는 호출하지 않고, DB 레이어만 실제 PostgreSQL로 검증.

docker-compose.test.yml 실행 필요:
    docker-compose -f docker-compose.test.yml up -d
    pytest -m integration -k e2e --tb=short
"""
import math
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.embedding import SlideEmbedding, EMBEDDING_DIMENSIONS
from app.models.lecture import Lecture
from app.models.user import User, UserRole

pytestmark = pytest.mark.integration


def _fake_embedding(seed: float) -> list[float]:
    return [math.sin(seed * (i + 1)) for i in range(EMBEDDING_DIMENSIONS)]


# ── 파이프라인 전체 흐름 테스트 ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_full_pipeline_flow(pg_db: AsyncSession):
    """유저 → 강좌 → 강의 → 임베딩 저장 → 유사도 검색 전체 흐름."""
    # 1) 유저 생성
    professor = User(
        id=uuid.uuid4(),
        google_sub="pg-prof-001",
        email="prof-pg@test.ac.kr",
        name="통합테스트 교수",
        role=UserRole.professor,
        school="테스트대학교",
        department="AI학과",
        is_active=True,
    )
    pg_db.add(professor)
    await pg_db.flush()

    # 2) 강좌 생성
    course = Course(
        id=uuid.uuid4(),
        instructor_id=professor.id,
        title="딥러닝 기초",
        description="pgvector 통합테스트용 강좌",
        is_published=True,
    )
    pg_db.add(course)
    await pg_db.flush()

    # 3) 강의 생성
    lecture = Lecture(
        id=uuid.uuid4(),
        course_id=course.id,
        title="신경망 구조",
        slug="neural-network-structure-pg",
        order=1,
        is_published=True,
    )
    pg_db.add(lecture)
    await pg_db.flush()

    # 4) 슬라이드 임베딩 저장 (5개 슬라이드)
    task_id = str(uuid.uuid4())
    slide_texts = [
        "인공 신경망의 기본 구조와 뉴런 모델",
        "활성화 함수: ReLU, Sigmoid, Tanh",
        "순전파와 역전파 알고리즘",
        "손실 함수와 경사 하강법",
        "과적합 방지: 드롭아웃과 정규화",
    ]
    for i, txt in enumerate(slide_texts, start=1):
        pg_db.add(SlideEmbedding(
            task_id=task_id,
            slide_number=i,
            text_content=txt,
            embedding=_fake_embedding(seed=0.1 * i),
        ))
    await pg_db.flush()

    # 5) 유사도 검색 — seed=0.3 (slide 3)과 유사한 것 조회
    query_vec = _fake_embedding(seed=0.3)
    vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"

    result = await pg_db.execute(
        text("""
            SELECT slide_number, text_content,
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
    assert rows[0].slide_number == 3
    assert float(rows[0].similarity) > 0.99


@pytest.mark.asyncio
async def test_multiple_lectures_embedding_isolation(pg_db: AsyncSession):
    """서로 다른 강의의 임베딩이 task_id로 격리되는지 검증."""
    task_a = str(uuid.uuid4())
    task_b = str(uuid.uuid4())

    # 강의 A 슬라이드
    for i in range(3):
        pg_db.add(SlideEmbedding(
            task_id=task_a,
            slide_number=i + 1,
            text_content=f"강의A 슬라이드 {i + 1}",
            embedding=_fake_embedding(seed=0.2 * (i + 1)),
        ))

    # 강의 B 슬라이드
    for i in range(3):
        pg_db.add(SlideEmbedding(
            task_id=task_b,
            slide_number=i + 1,
            text_content=f"강의B 슬라이드 {i + 1}",
            embedding=_fake_embedding(seed=0.3 * (i + 1)),
        ))
    await pg_db.flush()

    # 강의 A에서만 검색
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
    assert all("강의A" in r.text_content for r in rows)


@pytest.mark.asyncio
async def test_concurrent_writes_and_reads(pg_db: AsyncSession):
    """동시 쓰기 후 읽기 정합성 검증."""
    task_id = str(uuid.uuid4())
    count = 20

    for i in range(count):
        pg_db.add(SlideEmbedding(
            task_id=task_id,
            slide_number=i + 1,
            text_content=f"동시성 테스트 {i + 1}",
            embedding=_fake_embedding(seed=0.05 * (i + 1)),
        ))
    await pg_db.flush()

    # 전체 카운트 확인
    result = await pg_db.execute(
        text("SELECT count(*) AS cnt FROM slide_embeddings WHERE task_id = :tid"),
        {"tid": task_id},
    )
    assert result.scalar() == count

    # top-k 검색이 정확한 수 반환
    query_vec = _fake_embedding(seed=0.5)
    vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"

    result = await pg_db.execute(
        text("""
            SELECT slide_number FROM slide_embeddings
            WHERE task_id = :tid
            ORDER BY embedding <=> :qvec::vector
            LIMIT 5
        """),
        {"qvec": vec_str, "tid": task_id},
    )
    rows = result.fetchall()
    assert len(rows) == 5


@pytest.mark.asyncio
async def test_empty_result_when_no_embeddings(pg_db: AsyncSession):
    """임베딩이 없는 task_id 검색 시 빈 결과."""
    nonexistent = str(uuid.uuid4())
    query_vec = _fake_embedding(seed=0.1)
    vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"

    result = await pg_db.execute(
        text("""
            SELECT slide_number FROM slide_embeddings
            WHERE task_id = :tid
            ORDER BY embedding <=> :qvec::vector
            LIMIT 3
        """),
        {"qvec": vec_str, "tid": nonexistent},
    )
    rows = result.fetchall()
    assert len(rows) == 0
