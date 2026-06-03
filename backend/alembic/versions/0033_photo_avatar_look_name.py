"""Photo Avatar — photo_avatar_looks.name 추가 (사용자 지정 룩 이름).

Revision ID: 0033
Revises: 0032
Create Date: 2026-06-03

변경 내용:
- ``photo_avatar_looks.name`` (VARCHAR(80), NULL 허용): 라이브러리에서 교수자가
    연필 아이콘으로 직접 붙인 룩 이름. 종전엔 표시명으로 영어 ``prompt`` 를 그대로
    노출해 길고 불필요했다(사용자 보고 2026-06-03). NULL 이면 프론트가 "이름 없는
    룩" 같은 폴백 라벨을 보여준다.

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0033"
down_revision: Union[str, None] = "0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "photo_avatar_looks",
        sa.Column("name", sa.String(length=80), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("photo_avatar_looks", "name")
