"""Add users.photo_avatar_look_id (talking photo ↔ 룩 매핑, 슬롯 회수용).

Revision ID: 0037
Revises: 0036
Create Date: 2026-06-04

변경 내용:
- ``users.photo_avatar_look_id`` (VARCHAR(255), nullable): 현재 photo_avatar_id
    (HeyGen Talking Photo)가 어느 룩으로 만들어졌는지 추적한다. 같은 룩이면
    재등록하지 않고 재사용하고, 룩이 바뀌면 이전 talking photo 를 삭제(슬롯 회수)한
    뒤 새로 만든다 — HeyGen Photo Avatar 한도(흔히 3개, code 401028) 누적 초과 방지.

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0037"
down_revision: Union[str, None] = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("photo_avatar_look_id", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "photo_avatar_look_id")
