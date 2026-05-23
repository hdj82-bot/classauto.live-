"""Add photo-avatar preview fields to users.

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-23

변경 내용 (본인 아바타 "움직이는 미리보기" 캐시):
- ``users.photo_avatar_preview_url`` (VARCHAR(1024), nullable): Talking Photo 로
    1회 렌더한 짧은 샘플 영상의 영구 S3 https URL. 채워지면 캐시 적중.
- ``users.photo_avatar_preview_video_id`` (VARCHAR(255), nullable): 렌더 진행
    중인 HeyGen video_id (상태 폴링 키).
- ``users.photo_avatar_preview_voice_id`` (VARCHAR(255), nullable): 그 미리보기를
    렌더할 때 쓴 ElevenLabs voice_id (다른 음성으로 다시 만들기 판정용).

다운그레이드: 3개 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("photo_avatar_preview_url", sa.String(length=1024), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "photo_avatar_preview_video_id", sa.String(length=255), nullable=True
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "photo_avatar_preview_voice_id", sa.String(length=255), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "photo_avatar_preview_voice_id")
    op.drop_column("users", "photo_avatar_preview_video_id")
    op.drop_column("users", "photo_avatar_preview_url")
