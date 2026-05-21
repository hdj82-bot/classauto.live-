"""Add slide_embeddings.slide_image_url.

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-21

변경 내용:
- ``slide_embeddings.slide_image_url`` (VARCHAR(1024), nullable):
    PPTX 파싱 직후 LibreOffice 헤드리스로 슬라이드를 PNG 로 렌더한 뒤 S3 에
    올리고 그 https URL 을 보관한다. studio(편집기) 중앙 미리보기에서 즉시
    실제 슬라이드 외형을 보여주기 위한 용도. NULL = 렌더 실패 또는 아직
    렌더 전 — 프론트는 fallback mock 으로 그린다.

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "slide_embeddings",
        sa.Column("slide_image_url", sa.String(length=1024), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("slide_embeddings", "slide_image_url")
