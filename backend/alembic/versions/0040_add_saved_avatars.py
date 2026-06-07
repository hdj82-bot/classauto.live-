"""SavedAvatar — saved_avatars 테이블 추가 ('룩 + 음성' 조합 아바타 라이브러리).

Revision ID: 0040
Revises: 0039
Create Date: 2026-06-07

변경 내용 (내 아바타 갤러리 — 룩만 저장하던 라이브러리의 상위 개념):
- ``saved_avatars`` 테이블: 교수자가 확정한 '룩 + 음성' 조합 1개당 1행.
    look_id(렌더용 룩 식별자) + voice_id(음성) + avatar_scale + 조합 전용
    말하는 미리보기 캐시(preview_video_*). user 단일 캐시와 달리 행별 보관해
    덮어쓰기 없이 갤러리에서 재생한다.

다운그레이드: 인덱스 + 테이블 drop.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0040"
down_revision: Union[str, None] = "0039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saved_avatars",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("look_id", sa.String(length=255), nullable=False),
        sa.Column("voice_id", sa.String(length=255), nullable=True),
        sa.Column(
            "avatar_scale", sa.Float(), server_default="1.0", nullable=False
        ),
        sa.Column("preview_video_url", sa.String(length=1024), nullable=True),
        sa.Column("preview_video_id", sa.String(length=255), nullable=True),
        sa.Column("preview_voice_id", sa.String(length=255), nullable=True),
        sa.Column("preview_text", sa.String(length=2000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_saved_avatars_user_id"),
        "saved_avatars",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_saved_avatars_user_id"), table_name="saved_avatars")
    op.drop_table("saved_avatars")
