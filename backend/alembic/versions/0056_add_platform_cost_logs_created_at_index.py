"""Add ix_platform_cost_logs_created_at (B: 월별 비용 GROUP BY 핫패스).

Revision ID: 0056
Revises: 0055
Create Date: 2026-06-18

변경 내용 (스펙 13 · B):
- ``platform_cost_logs.created_at`` 에 인덱스 추가. B 에서 /api/v1/admin/costs 가
    render_cost_logs 와 platform_cost_logs 를 **월별 GROUP BY** 로 통합 집계하면서
    시간 윈도우(WHERE created_at >= today-365d)로 입력 행을 제한한다.
    render_cost_logs 는 0014 에서 created_at 인덱스를 받았으나 platform_cost_logs
    는 없어, 행이 누적되면 풀 스캔이 된다. 동일 핫패스용 인덱스를 추가한다.

멱등: 인덱스 존재 여부를 확인해 있으면 생성을 건너뛴다.
다운그레이드: 인덱스 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0056"
down_revision: Union[str, None] = "0055"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX = "ix_platform_cost_logs_created_at"
_TABLE = "platform_cost_logs"


def _has_index(table: str, index: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return index in {ix["name"] for ix in insp.get_indexes(table)}


def upgrade() -> None:
    if not _has_index(_TABLE, _INDEX):
        op.create_index(_INDEX, _TABLE, ["created_at"], unique=False)


def downgrade() -> None:
    if _has_index(_TABLE, _INDEX):
        op.drop_index(_INDEX, table_name=_TABLE)
