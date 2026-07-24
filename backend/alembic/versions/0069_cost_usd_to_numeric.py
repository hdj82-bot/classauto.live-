"""Convert cost_usd columns from float to Numeric(12,6) — 금액 누적 오차 제거.

Revision ID: 0069
Revises: 0068
Create Date: 2026-07-24

변경 내용:
- ``platform_cost_logs.cost_usd`` / ``qa_logs.cost_usd`` / ``render_cost_logs.cost_usd``
  를 double precision(float) → ``numeric(12, 6)`` 로 변경한다. 개별 비용은 작지만
  운영자 비용 대시보드·예산 서킷브레이커가 다수 행을 SUM 하면서 float 이진 표현의
  반올림 오차가 누적돼, 표시 원가·예산 합계가 실제 청구액과 미세하게 어긋났다.
  numeric 저장 + numeric SUM 은 정확하다("비용 투명성" 차별점).

호환: 모델은 ``Numeric(12, 6, asdecimal=False)`` 로 읽기 시 float 을 돌려주므로
기존 계산/Pydantic 직렬화와 그대로 호환된다(Decimal/float 혼용 없음).

대상: Postgres 전용(``postgresql_using`` 캐스트). SQLite 는 numeric affinity 라
타입 변경이 불필요하므로 건너뛴다(테스트 스키마는 모델 create_all 기준).
가역: downgrade 는 double precision 으로 되돌린다.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0069"
down_revision: Union[str, None] = "0068"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("platform_cost_logs", "qa_logs", "render_cost_logs")


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for table in _TABLES:
        if _has_table(table):
            op.alter_column(
                table,
                "cost_usd",
                type_=sa.Numeric(12, 6),
                existing_type=sa.Float(),
                postgresql_using="cost_usd::numeric(12,6)",
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for table in _TABLES:
        if _has_table(table):
            op.alter_column(
                table,
                "cost_usd",
                type_=sa.Float(),
                existing_type=sa.Numeric(12, 6),
                postgresql_using="cost_usd::double precision",
            )
