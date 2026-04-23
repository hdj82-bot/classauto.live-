"""Add live_deadline_minutes to lectures table.

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-23

변경 내용:
- lectures.live_deadline_minutes (SMALLINT, nullable):
    강의별 실시간 출석 판단 기준(분).
    NULL이면 settings.DEFAULT_LIVE_DEADLINE_MINUTES 전역값을 사용한다.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lectures",
        sa.Column("live_deadline_minutes", sa.SmallInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lectures", "live_deadline_minutes")
