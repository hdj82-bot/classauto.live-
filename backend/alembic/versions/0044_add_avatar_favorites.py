"""Add avatar_favorites table.

Revision ID: 0044
Revises: 0043
Create Date: 2026-06-09

변경 내용:
- ``avatar_favorites`` (user_id UUID FK→users.id ondelete CASCADE, avatar_id
    VARCHAR(255), created_at) — 교수자별 즐겨찾기 HeyGen 아바타. (user_id,
    avatar_id) 복합 PK. 공개 아바타 브라우저의 별표·"즐겨찾기만 보기"가 사용한다
    (voice_favorites 의 아바타 버전).

다운그레이드: 테이블 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0044"
down_revision: Union[str, None] = "0043"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "avatar_favorites",
        sa.Column(
            "user_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("avatar_id", sa.String(length=255), primary_key=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("avatar_favorites")
