"""Add users.onboarded_at (student onboarding dismissal).

Revision ID: 0045
Revises: 0044
Create Date: 2026-06-11

변경 내용:
- ``users.onboarded_at`` (DateTime tz, nullable) — 학생 첫 사용 온보딩(영상 시청
    4슬라이드 안내)을 "다시 보지 않기" 한 시각. NULL = 아직 안 함(진입 시 안내 표시).
    값이 있으면 이후 영구 스킵. localStorage 금지(CLAUDE.md)라 서버에 저장한다.

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0045"
down_revision: Union[str, None] = "0044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("onboarded_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "onboarded_at")
