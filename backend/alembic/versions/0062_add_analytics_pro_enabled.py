"""Add users.analytics_pro_enabled (베타 학습 분석 PRO 운영자 토글 게이트).

Revision ID: 0062
Revises: 0061
Create Date: 2026-06-19

변경 내용:
- ``users.analytics_pro_enabled`` (Boolean, NOT NULL, default false) — 베타테스터
    전용 학습 분석 PRO(docs/planning/analytics-spec.md) 노출 여부. 운영자가 admin
    콘솔에서 per-user 로 on/off 한다. 기본 false(미노출) — 운영자가 켠 테스터만 사용.

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0062"
down_revision: Union[str, None] = "0061"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "analytics_pro_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "analytics_pro_enabled")
