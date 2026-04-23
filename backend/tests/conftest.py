"""테스트 공통 픽스처.

DB: SQLite in-memory (aiosqlite) — 기본
    PostgreSQL (asyncpg) — @pytest.mark.integration 전용
Redis: 인메모리 dict mock
"""
import os
import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import JSON, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.user import User, UserRole
from app.models.video import Video, VideoScript, VideoStatus

# ── pytest-asyncio 설정 ──────────────────────────────────────────────────────

pytest_plugins = ("pytest_asyncio",)

# ── SQLite JSONB→JSON 폴백 ──────────────────────────────────────────────────
# PostgreSQL JSONB 타입을 SQLite에서 사용할 수 있도록 모든 JSONB 컬럼을 JSON으로 교체

def _patch_jsonb_columns():
    """Base.metadata 내 모든 JSONB 컬럼을 JSON으로 교체."""
    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, JSONB):
                column.type = JSON()

# ── SQLite 인메모리 엔진 ──────────────────────────────────────────────────────

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="session")
async def engine():
    _patch_jsonb_columns()
    _engine = create_async_engine(TEST_DB_URL, echo=False)
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _engine.dispose()


@pytest_asyncio.fixture
async def db(engine) -> AsyncGenerator[AsyncSession, None]:
    """각 테스트마다 독립적인 SAVEPOINT 기반 롤백 격리.

    외부 트랜잭션을 시작하고, 세션의 commit()이 호출되면
    SAVEPOINT로 대체하여 테스트 종료 후 전체 롤백합니다.
    """
    async with engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)

        # session.commit() 호출 시 SAVEPOINT로 대체
        @event.listens_for(session.sync_session, "after_transaction_end")
        def restart_savepoint(session_sync, transaction):
            if transaction.nested and not transaction._parent.nested:
                session_sync.begin_nested()

        await conn.begin_nested()
        yield session

        await session.close()
        await trans.rollback()


# ── Redis Mock ────────────────────────────────────────────────────────────────

class FakeRedis:
    """간단한 인메모리 Redis mock."""

    def __init__(self):
        self._store: dict[str, str] = {}
        self._ttls: dict[str, int] = {}

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._store[key] = value
        if ex:
            self._ttls[key] = ex

    async def setex(self, key: str, ttl: int, value: str) -> None:
        self._store[key] = value
        self._ttls[key] = ttl

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def getdel(self, key: str) -> str | None:
        return self._store.pop(key, None)

    async def delete(self, key: str) -> int:
        return 1 if self._store.pop(key, None) is not None else 0

    async def exists(self, key: str) -> int:
        return 1 if key in self._store else 0


@pytest.fixture
def fake_redis():
    return FakeRedis()


# ── FastAPI 의존성 오버라이드 ──────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(db: AsyncSession, fake_redis: FakeRedis) -> AsyncGenerator:
    """테스트용 HTTP 클라이언트 (DB·Redis 주입)."""
    import app.services.auth as auth_svc
    from app.core import redis as redis_module

    # get_db 오버라이드
    async def override_get_db():
        yield db

    # get_redis 오버라이드
    def override_get_redis():
        return fake_redis

    app.dependency_overrides[get_db] = override_get_db
    redis_module.get_redis = override_get_redis
    auth_svc.get_redis = override_get_redis  # auth service 내부 참조도 패치
    import app.api.deps as deps_module
    deps_module.get_redis = override_get_redis  # blacklist 검사용

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ── 공통 사용자 픽스처 ────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def professor(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        google_sub="google-prof-001",
        email="prof@test.ac.kr",
        name="테스트 교수",
        role=UserRole.professor,
        school="한국대학교",
        department="컴퓨터공학과",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def student(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        google_sub="google-stu-001",
        email="stu@test.ac.kr",
        name="테스트 학생",
        role=UserRole.student,
        school="한국대학교",
        department="컴퓨터공학과",
        student_number="20240001",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def admin(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        google_sub="google-admin-001",
        email="admin@test.ac.kr",
        name="테스트 관리자",
        role=UserRole.admin,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


# ── 토큰 헬퍼 ────────────────────────────────────────────────────────────────

def make_auth_header(user: User) -> dict:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


# ── 강좌 / 강의 / 영상 픽스처 ─────────────────────────────────────────────────

@pytest_asyncio.fixture
async def course(db: AsyncSession, professor: User) -> Course:
    c = Course(
        id=uuid.uuid4(),
        instructor_id=professor.id,
        title="통합테스트 강좌",
        description="테스트용 강좌",
        is_published=True,
    )
    db.add(c)
    await db.flush()
    return c


@pytest_asyncio.fixture
async def lecture(db: AsyncSession, course: Course) -> Lecture:
    lec = Lecture(
        id=uuid.uuid4(),
        course_id=course.id,
        title="통합테스트 강의",
        slug="integration-test-lecture-abc12345",
        order=1,
        is_published=True,
    )
    db.add(lec)
    await db.flush()
    return lec


@pytest_asyncio.fixture
async def video_pending(db: AsyncSession, lecture: Lecture, professor: User) -> Video:
    """pending_review 상태의 영상 + 스크립트."""
    v = Video(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        status=VideoStatus.pending_review,
    )
    db.add(v)
    await db.flush()

    sample_segments = [
        {
            "slide_index": 0,
            "text": "안녕하세요, 오늘은 파이썬을 배웁니다.",
            "start_seconds": 0,
            "end_seconds": 30,
            "tone": "normal",
            "question_pin_seconds": None,
        },
        {
            "slide_index": 1,
            "text": "변수와 자료형에 대해 알아봅시다.",
            "start_seconds": 30,
            "end_seconds": 60,
            "tone": "emphasis",
            "question_pin_seconds": 50,
        },
    ]
    script = VideoScript(
        id=uuid.uuid4(),
        video_id=v.id,
        ai_segments=sample_segments,
        segments=list(sample_segments),
    )
    db.add(script)
    await db.flush()
    return v


# ── PostgreSQL (pgvector) 통합 테스트 픽스처 ────────────────────────────────────

TEST_PG_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://test_user:test_pass@localhost:5433/ifl_test",
)


@pytest_asyncio.fixture(scope="session")
async def pg_engine():
    """PostgreSQL + pgvector 엔진 (docker-compose.test.yml 필요)."""
    _engine = create_async_engine(TEST_PG_URL, echo=False)
    async with _engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _engine.dispose()


@pytest_asyncio.fixture
async def pg_db(pg_engine) -> AsyncGenerator[AsyncSession, None]:
    """PostgreSQL 세션 (SAVEPOINT 기반 격리)."""
    async with pg_engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)

        @event.listens_for(session.sync_session, "after_transaction_end")
        def restart_savepoint(session_sync, transaction):
            if transaction.nested and not transaction._parent.nested:
                session_sync.begin_nested()

        await conn.begin_nested()
        yield session

        await session.close()
        await trans.rollback()


# ── 외부 API 테스트 자동 skip ────────────────────────────────────────────────────

def _skip_if_missing(envvar: str, service_name: str):
    """환경변수 미설정 시 skip하는 헬퍼."""
    val = os.environ.get(envvar, "")
    if not val:
        pytest.skip(f"{service_name} 테스트: {envvar} 환경변수 미설정")
    return val


@pytest.fixture
def heygen_api_key():
    return _skip_if_missing("HEYGEN_API_KEY", "HeyGen")


@pytest.fixture
def elevenlabs_api_key():
    return _skip_if_missing("ELEVENLABS_API_KEY", "ElevenLabs")


@pytest.fixture
def openai_api_key():
    return _skip_if_missing("OPENAI_API_KEY", "OpenAI")


@pytest.fixture
def stripe_api_key():
    return _skip_if_missing("STRIPE_SECRET_KEY", "Stripe")


@pytest.fixture
def deepl_api_key():
    return _skip_if_missing("DEEPL_API_KEY", "DeepL")
