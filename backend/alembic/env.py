import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# Alembic Config 객체
config = context.config

# 로깅 설정
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 환경변수에서 마이그레이션용 sync URL 을 결정.
#
# 우선순위:
#   1) DATABASE_URL_SYNC (psycopg2 호환 — Pooler 환경에서 권장)
#   2) DATABASE_URL 의 +asyncpg 제거 + asyncpg 전용 옵션 제거 (fallback)
#
# 왜 옵션 제거가 필요한가:
#   Supabase Pooler + asyncpg 조합에서 statement_cache_size=0 같은 옵션을
#   DATABASE_URL 에 붙여야 런타임이 prepared statement 충돌 없이 동작한다.
#   하지만 alembic 은 psycopg2(동기) 로 접속하는데 psycopg2 는 이 옵션을
#   인식하지 못하고 ``invalid dsn: invalid connection option`` 으로 죽는다.
#   안전을 위해 fallback 경로에서 명시적으로 제거.
def _resolve_alembic_url() -> str:
    sync_url = os.environ.get("DATABASE_URL_SYNC")
    if sync_url:
        return sync_url
    raw = os.environ.get("DATABASE_URL", "")
    url = raw.replace("postgresql+asyncpg://", "postgresql://")
    if "?" in url:
        base, query = url.split("?", 1)
        keep = [
            p for p in query.split("&")
            if p and not p.startswith("statement_cache_size=")
        ]
        url = base + ("?" + "&".join(keep) if keep else "")
    return url


database_url = _resolve_alembic_url()
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

# 모델 메타데이터 임포트 (자동 마이그레이션용)
from app.db.base import Base  # noqa: E402
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """오프라인 모드: DB 연결 없이 SQL 스크립트만 생성."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """온라인 모드: 실제 DB에 연결하여 마이그레이션 실행."""
    # search_path 강제 — Supabase 풀러 role(``postgres.<projectref>``)은 기본
    # search_path("$user")가 없는 스키마를 가리켜 ``public`` 을 못 본다. 이게
    # 빠지면 ``CREATE TABLE alembic_version`` 이 ``InvalidSchemaName: no schema
    # has been selected to create in`` 으로 죽는다 (psycopg2 ``options`` 로 접속
    # 시점에 설정 — 직접 연결에도 무해).
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args={"options": "-c search_path=public"},
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
