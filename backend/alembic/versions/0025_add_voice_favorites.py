"""Add voice_favorites table.

Revision ID: 0025
Revises: 0024
Create Date: 2026-05-26

변경 내용:
- ``voice_favorites`` (user_id UUID FK→users.id ondelete CASCADE, voice_id
    VARCHAR(255), created_at) — 교수자별 즐겨찾기 ElevenLabs 보이스. (user_id,
    voice_id) 복합 PK. GET /api/voices 가 ``is_favorite`` 를 채우는 데 사용.

다운그레이드: 테이블 제거.

주의: 0024(add_avatar_scale)와 병렬로 작업돼 본래 0024 로 작성됐으나, 0024 가
먼저 머지되어 이 마이그레이션을 0025(down_revision=0024)로 재번호했다.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "voice_favorites",
        sa.Column(
            "user_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("voice_id", sa.String(length=255), primary_key=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("voice_favorites")
