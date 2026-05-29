"""Add Photo Avatar(Design with AI) group fields + photo_avatar_looks table.

Revision ID: 0028
Revises: 0027
Create Date: 2026-05-29

변경 내용 (교수자 본인 아바타 — HeyGen v2 Photo Avatar 룩 온보딩):
- ``users.photo_avatar_group_id`` (VARCHAR(255), nullable): 사진으로 만든
    avatar group id (룩 생성 기반).
- ``users.photo_avatar_group_status`` (VARCHAR(20), nullable): "training"|"ready"|"failed".
- ``users.photo_avatar_default_look_id`` (VARCHAR(255), nullable): 선택한 기본
    룩의 avatar_id — 강의 렌더가 lecture.avatar_id 없을 때 폴백.
- ``photo_avatar_looks`` 테이블: 생성된 룩 1개당 1행(선택 갤러리용).

다운그레이드: 테이블 drop + users 3개 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0028"
down_revision: Union[str, None] = "0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("photo_avatar_group_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("photo_avatar_group_status", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("photo_avatar_default_look_id", sa.String(length=255), nullable=True),
    )

    op.create_table(
        "photo_avatar_looks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("heygen_look_id", sa.String(length=255), nullable=False),
        sa.Column("preview_image_url", sa.String(length=1024), nullable=True),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
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
        op.f("ix_photo_avatar_looks_user_id"),
        "photo_avatar_looks",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_photo_avatar_looks_user_id"), table_name="photo_avatar_looks"
    )
    op.drop_table("photo_avatar_looks")
    op.drop_column("users", "photo_avatar_default_look_id")
    op.drop_column("users", "photo_avatar_group_status")
    op.drop_column("users", "photo_avatar_group_id")
