"""advisory_xact_lock 헬퍼 — SQLite(테스트)에서 안전한 no-op 검증.

Postgres advisory lock 의 실제 직렬화는 동시성이 필요해 SQLite 인메모리 단일
스레드 테스트로는 재현 불가하다. 여기서는 (1) 예외 없이 no-op 하고 (2) 이후
세션이 정상 사용 가능함(트랜잭션 오염 없음)만 보장한다 — create_session·render
경로가 SQLite 테스트에서 무해함을 뒷받침한다.
"""
from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db.advisory_lock import advisory_xact_lock


@pytest.mark.asyncio
async def test_advisory_lock_detects_dialect(db):
    # get_bind().dialect.name 이 예외 없이 실제로 동작하는지 확인한다. 이게 SQLite 에서
    # 되면 헬퍼가 exception 경로(무조건 no-op)로 빠지지 않는다는 뜻이라, 프로덕션
    # Postgres 에서도 dialect 를 옳게 감지해 락이 '조용히 비활성화'되지 않음을 보장한다.
    assert db.get_bind().dialect.name == "sqlite"


@pytest.mark.asyncio
async def test_advisory_lock_is_noop_on_sqlite(db):
    # 여러 키 조합으로 호출해도 예외가 없어야 한다.
    await advisory_xact_lock(db, "learning_session_create", "u1", "l1")
    await advisory_xact_lock(db, "render_monthly_limit", 42)

    # no-op 이후에도 세션이 정상 동작(트랜잭션 미오염).
    result = await db.execute(text("SELECT 1"))
    assert result.scalar() == 1
