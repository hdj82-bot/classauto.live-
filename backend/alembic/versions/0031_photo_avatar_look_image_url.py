"""Photo Avatar v0.2 — photo_avatar_looks.image_url 추가 + heygen_look_id nullable.

Revision ID: 0031
Revises: 0030
Create Date: 2026-05-31

변경 내용 (docs/planning/12-self-avatar-onboarding §0):
- ``photo_avatar_looks.image_url`` (VARCHAR(1024), nullable): gpt-image-2 가 생성한
    룩 이미지의 S3 저장 URL. OpenAI 결과 URL 은 만료되므로 생성 직후 S3 로 옮겨 보관.
- ``photo_avatar_looks.heygen_look_id`` → nullable 로 완화: v0.2(provider="gpt")
    경로는 HeyGen 룩 id 를 쓰지 않는다(룩 식별=내부 uuid, 렌더=talking_photo).
    레거시(provider="heygen") 데이터 보존을 위해 컬럼은 유지하되 nullable.

다운그레이드: image_url 제거 + heygen_look_id 를 NOT NULL 로 되돌림(기존 NULL 행이
있으면 실패할 수 있으므로 운영 다운그레이드 전 데이터 확인 필요).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0031"
down_revision: Union[str, None] = "0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "photo_avatar_looks",
        sa.Column("image_url", sa.String(length=1024), nullable=True),
    )
    op.alter_column(
        "photo_avatar_looks",
        "heygen_look_id",
        existing_type=sa.String(length=255),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "photo_avatar_looks",
        "heygen_look_id",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.drop_column("photo_avatar_looks", "image_url")
