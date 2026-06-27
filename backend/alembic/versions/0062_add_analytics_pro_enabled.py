"""Add users.analytics_pro_enabled (학습 분석 PRO 베타 토글 게이트).

Revision ID: 0062
Revises: 0061
Create Date: 2026-06-21

변경 내용 (docs/planning/analytics-spec.md · 운영자 토글 게이트):
- ``users.analytics_pro_enabled BOOLEAN NOT NULL DEFAULT false`` 추가.
    학습 분석 PRO(베타 전용 실기능)의 강의별 분석·AI 브리핑(§2.4) 접근을
    베타테스터별로 운영자 콘솔(/admin/users)에서 켜고 끄는 토글.
    게이트는 app/api/deps.py::require_analytics_pro 가 본 플래그 + 전역
    settings.ANALYTICS_PRO_ENABLED 로 판정하며, 운영자(ADMIN_EMAILS)는
    플래그와 무관하게 항상 접근 가능하다. 기본값 false = 신규/기존 사용자 미허용.

멱등: 컬럼 존재 여부를 확인해 있으면 추가를 건너뛴다.
다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0062"
down_revision: Union[str, None] = "0061"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "users"
_COLUMN = "analytics_pro_enabled"


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column(_TABLE, _COLUMN):
        op.add_column(
            _TABLE,
            sa.Column(
                _COLUMN,
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )


def downgrade() -> None:
    if _has_column(_TABLE, _COLUMN):
        op.drop_column(_TABLE, _COLUMN)
