from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# Async engine (API 서버용)
DATABASE_URL = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

# search_path 강제 — Supabase 풀러 연결은 role 이 ``postgres.<projectref>`` 라
# Postgres 기본 search_path("$user")가 존재하지 않는 스키마를 가리켜 ``public`` 을
# 보지 못한다. 그 결과 alembic 은 ``CREATE TABLE alembic_version`` 단계에서
# ``InvalidSchemaName: no schema has been selected to create in`` 으로 죽고,
# 런타임 쿼리(예: 로그인의 users 조회)는 relation not found 로 500 이 난다.
# 모든 연결에서 명시적으로 ``public`` 을 선택해 둔다 (직접 연결에도 무해).
_PG_OPTIONS = "-c search_path=public"

# Supabase Transaction Pooler(:6543)는 prepared statement 캐시와 충돌 → asyncpg 캐시 비활성화
_async_connect_args: dict = {"server_settings": {"search_path": "public"}}
if ":6543" in DATABASE_URL or "pooler.supabase.com" in DATABASE_URL:
    _async_connect_args["statement_cache_size"] = 0
    _async_connect_args["prepared_statement_cache_size"] = 0

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args=_async_connect_args,
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Sync engine (Celery 워커용)
sync_engine = create_engine(
    settings.DATABASE_URL_SYNC,
    echo=False,
    pool_pre_ping=True,
    connect_args={"options": _PG_OPTIONS},
)
SyncSessionLocal = sessionmaker(sync_engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
