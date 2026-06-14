"""Add subtitle_position to lectures (caption drag position).

Revision ID: 0048
Revises: 0047
Create Date: 2026-06-14

변경 내용:
- ``lectures.subtitle_position`` (JSONB, nullable): 교수자가 드래그로 정한 자막
    위치. 형식 ``{"x": float, "y": float}`` — 영상 영역 기준 정규화 좌표(0~1,
    자막 박스 중심). NULL = 기본(하단 중앙). 학생 플레이어가 이 값으로 자막 위치를
    적용한다.

멱등: 컬럼 존재 여부를 확인해 있으면 add 를 건너뛴다(재실행·부분적용 안전).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0048"
down_revision: Union[str, None] = "0047"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("lectures", "subtitle_position"):
        op.add_column(
            "lectures",
            sa.Column("subtitle_position", postgresql.JSONB(), nullable=True),
        )


def downgrade() -> None:
    if _has_column("lectures", "subtitle_position"):
        op.drop_column("lectures", "subtitle_position")
