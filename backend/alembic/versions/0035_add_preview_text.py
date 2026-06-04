"""Add users.photo_avatar_preview_text (미리보기 렌더 대본 캐시 키).

Revision ID: 0035
Revises: 0034
Create Date: 2026-06-04

변경 내용:
- ``users.photo_avatar_preview_text`` (VARCHAR(2000), nullable): 본인 아바타
    "움직이는 미리보기"를 렌더할 때 읽힌 대본. 아바타 페이지 "스크립트 테스트"가
    임의 문장을 렌더하므로, 같은 (음성·대본) 조합은 캐시 적중시키고 대본이 바뀌면
    다시 렌더하도록 캐시 키로 쓴다. NULL = 기본 샘플 문장으로 렌더된 과거 캐시(호환).

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0035"
down_revision: Union[str, None] = "0034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("photo_avatar_preview_text", sa.String(length=2000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "photo_avatar_preview_text")
