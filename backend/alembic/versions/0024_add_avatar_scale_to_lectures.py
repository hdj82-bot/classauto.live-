"""Add avatar_scale to lectures.

Revision ID: 0024
Revises: 0023
Create Date: 2026-05-26

변경 내용:
- ``lectures.avatar_scale`` (DOUBLE PRECISION, NOT NULL, default 1.0): 영상에서
    아바타가 차지하는 크기 배율. 1.0 이 기본. studio 미리보기의 PiP 크기와
    1:1로 매핑되며, render.py 가 heygen.create_video(avatar_scale=) 로 전달해
    HeyGen character.scale 에 반영한다(0.3~2.0 클램프).

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lectures",
        sa.Column(
            "avatar_scale",
            sa.Float(),
            nullable=False,
            server_default="1.0",
        ),
    )


def downgrade() -> None:
    op.drop_column("lectures", "avatar_scale")
