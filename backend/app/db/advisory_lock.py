"""트랜잭션 범위 advisory lock — check-then-write TOCTOU 직렬화.

count/exists 검사와 INSERT 사이가 비원자적이면(동시 요청) 둘 다 검사를 통과해
한도를 넘길 수 있다(동시 재생 제한·월 렌더 한도). 같은 키에 대한 요청을
Postgres advisory xact lock 으로 직렬화하면, 앞선 트랜잭션이 커밋(락 해제)한 뒤에야
뒤 트랜잭션이 검사하므로 커밋된 결과를 보고 올바로 거부한다.

- **xact lock**: 현재 트랜잭션의 commit/rollback 시 자동 해제 → 명시적 unlock 불필요.
- **Postgres 전용**: 테스트(SQLite 인메모리)·기타 방언에선 no-op. SQLite 테스트는
  단일 스레드 직렬 실행이라 이 race 자체가 발생하지 않으므로 no-op 이 안전하다.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def advisory_xact_lock(db: AsyncSession, *keys: object) -> None:
    """``keys`` 로 식별되는 논리 자원에 트랜잭션 advisory lock 을 건다.

    같은 키의 동시 호출은 직렬화된다(뒤 호출은 앞 트랜잭션 종료까지 대기).
    Postgres 가 아니면 아무 것도 하지 않는다.
    """
    try:
        dialect = db.get_bind().dialect.name
    except Exception:  # noqa: BLE001 — bind 확인 실패 시 안전하게 lock 생략.
        return
    if dialect != "postgresql":
        return
    # hashtext(text) → int4 → bigint 로 승격돼 pg_advisory_xact_lock(bigint) 사용.
    # 해시 충돌은 서로 다른 키가 드물게 함께 직렬화될 뿐(정확성 아닌 미세 성능 영향).
    key = ":".join(str(k) for k in keys)
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
        {"key": key},
    )
