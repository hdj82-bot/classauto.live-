"""Add avatar fields to lectures and users.

Revision ID: 0019
Revises: 0018
Create Date: 2026-05-22

변경 내용:
- ``lectures.avatar_id`` (VARCHAR(255), nullable): 강의에 선택된 HeyGen
    아바타 ID. NULL = voice_gender 기준 기본 아바타 사용.
- ``lectures.avatar_name`` (VARCHAR(100), nullable): 강의별 아바타 표시
    이름 (교수자 자유 편집). NULL = 기본 표시명.
- ``users.profile_image_url`` (VARCHAR(1024), nullable): 교수자가 업로드한
    프로필 사진(본인 아바타 소스)의 S3 https URL.
- ``users.photo_avatar_id`` (VARCHAR(255), nullable): 업로드 사진으로
    HeyGen 에 등록한 Talking Photo ID.

다운그레이드: 4개 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lectures",
        sa.Column("avatar_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "lectures",
        sa.Column("avatar_name", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("profile_image_url", sa.String(length=1024), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("photo_avatar_id", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "photo_avatar_id")
    op.drop_column("users", "profile_image_url")
    op.drop_column("lectures", "avatar_name")
    op.drop_column("lectures", "avatar_id")
