"""Add users.photo_avatar_preview_avatar_id (표준 아바타 미리보기 캐시 구분).

Revision ID: 0043
Revises: 0042
Create Date: 2026-06-09

변경 내용:
- ``users.photo_avatar_preview_avatar_id`` (VARCHAR(255), nullable): "움직이는
    미리보기" 슬롯을 포토 아바타(Talking Photo)와 표준 아바타(등록 Video Avatar)가
    공유하므로, 이 미리보기가 어느 표준 avatar_id 의 것인지(또는 포토면 NULL) 기록해
    캐시 적중을 정확히 판정한다 — 표준 렌더 결과가 포토 미리보기로 새지 않도록.

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0043"
down_revision: Union[str, None] = "0042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "photo_avatar_preview_avatar_id", sa.String(length=255), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "photo_avatar_preview_avatar_id")
