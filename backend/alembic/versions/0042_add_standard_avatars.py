"""Add standard_avatars (교수자가 등록한 표준 HeyGen Video Avatar).

Revision ID: 0042
Revises: 0041
Create Date: 2026-06-09

변경 내용:
- ``standard_avatars`` 테이블 신설. 교수자가 HeyGen 웹 스튜디오에서 만든 표준
    Video Avatar 의 ``heygen_avatar_id`` 와 미리보기 메타데이터를 보관한다.
    Photo Avatar(Talking Photo, 몸 고정·얼굴만 움직임)와 구별되는, 전신이
    자연스럽게 움직이는 비교용 아바타 — 갤러리에서 "표준 아바타"로 노출된다.

다운그레이드: 테이블 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0042"
down_revision: Union[str, None] = "0041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "standard_avatars",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("heygen_avatar_id", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=True),
        sa.Column("preview_image_url", sa.String(length=1024), nullable=True),
        sa.Column("preview_video_url", sa.String(length=1024), nullable=True),
        sa.Column("gender", sa.String(length=20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_standard_avatars_user_id"),
        "standard_avatars",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_standard_avatars_user_id"), table_name="standard_avatars"
    )
    op.drop_table("standard_avatars")
