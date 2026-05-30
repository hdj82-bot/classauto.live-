"""Add users.photo_avatar_group_error (학습 실패 사유 분류 코드).

Revision ID: 0029
Revises: 0028
Create Date: 2026-05-30

변경 내용:
- ``users.photo_avatar_group_error`` (VARCHAR(40), nullable): Photo Avatar 학습이
    status="failed" 일 때의 사유 분류 코드("insufficient_credit"|"invalid_image"|
    "unknown"). 사용자에게 정확한 안내를 고르는 데 쓴다(크레딧 부족을 사진 문제로
    오안내하지 않도록).

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0029"
down_revision: Union[str, None] = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("photo_avatar_group_error", sa.String(length=40), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "photo_avatar_group_error")
