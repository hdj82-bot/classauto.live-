"""Add users.visionstory_avatar_id / visionstory_avatar_source.

Revision ID: 0052
Revises: 0051
Create Date: 2026-06-15

변경 내용 (본인 얼굴 렌더 제공자 Hedra → VisionStory 교체):
- ``users.visionstory_avatar_id`` (VARCHAR(255), nullable): 교수자 사진으로 1회 생성한
  VisionStory 아바타 id. 모든 Q&A·미리보기 렌더에서 재사용한다(매 렌더 재생성 금지).
- ``users.visionstory_avatar_source`` (VARCHAR(1024), nullable): 그 아바타를 만든 소스
  식별자(기본 룩 id 또는 프로필 이미지 URL). 현재 소스와 달라지면 호출부가 자동 재생성한다.

목적: VisionStory 는 사진으로 아바타를 한 번 만든 뒤 그 아바타로 영상을 생성하는
모델이라(Hedra 의 per-render 업로드와 다름), avatar_id 를 캐시해 재사용해야 한다.

멱등: 컬럼 존재 여부를 확인해 있으면 add 를 건너뛴다.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0052"
down_revision: Union[str, None] = "0051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("users", "visionstory_avatar_id"):
        op.add_column(
            "users",
            sa.Column("visionstory_avatar_id", sa.String(length=255), nullable=True),
        )
    if not _has_column("users", "visionstory_avatar_source"):
        op.add_column(
            "users",
            sa.Column(
                "visionstory_avatar_source", sa.String(length=1024), nullable=True
            ),
        )


def downgrade() -> None:
    if _has_column("users", "visionstory_avatar_source"):
        op.drop_column("users", "visionstory_avatar_source")
    if _has_column("users", "visionstory_avatar_id"):
        op.drop_column("users", "visionstory_avatar_id")
