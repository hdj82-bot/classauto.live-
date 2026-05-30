"""Add users.recent_avatar_id (가장 최근 선택한 아바타/룩).

Revision ID: 0030
Revises: 0029
Create Date: 2026-05-30

변경 내용:
- ``users.recent_avatar_id`` (VARCHAR(255), nullable): 아바타 선택 페이지에서
    교수자가 가장 최근에 고른 아바타/룩 id(표준 HeyGen avatar_id 또는 본인 룩
    heygen_look_id). 다음 방문 시 "최근 선택한 아바타" 박스로 복원해 재생성 없이
    바로 강의에 적용하는 데 쓴다. 기본 룩(photo_avatar_default_look_id)과는 별개.

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("recent_avatar_id", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "recent_avatar_id")
