"""Add cohort + beta consent columns (베타 코호트 태그 + 모니터링 동의).

Revision ID: 0055
Revises: 0054
Create Date: 2026-06-18

변경 내용 (스펙 13 · G):
- ``users.cohort`` (VARCHAR(40), nullable): 베타 코호트 태그(예: "2026-08").
    교수자는 초대의 cohort 를 가입 시 복사받는다. NULL = 미분류.
- ``users.beta_consented_at`` (TIMESTAMPTZ, nullable): 베타 모니터링 동의(PIPA)
    시각. 교수자 가입 시 동의하면 기록. NULL = 미동의(교수자는 동의 없이 가입 불가 —
    학생 흐름은 불변).
- ``professor_invites.cohort`` (VARCHAR(40), nullable): 운영자가 초대 발급 시
    지정하는 코호트. 가입 시 users.cohort 로 전파.

멱등: 컬럼 존재 여부를 확인해 있으면 add 를 건너뛴다.
다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0055"
down_revision: Union[str, None] = "0054"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("users", "cohort"):
        op.add_column("users", sa.Column("cohort", sa.String(length=40), nullable=True))
    if not _has_column("users", "beta_consented_at"):
        op.add_column(
            "users",
            sa.Column("beta_consented_at", sa.DateTime(timezone=True), nullable=True),
        )
    if not _has_column("professor_invites", "cohort"):
        op.add_column(
            "professor_invites", sa.Column("cohort", sa.String(length=40), nullable=True)
        )


def downgrade() -> None:
    if _has_column("professor_invites", "cohort"):
        op.drop_column("professor_invites", "cohort")
    if _has_column("users", "beta_consented_at"):
        op.drop_column("users", "beta_consented_at")
    if _has_column("users", "cohort"):
        op.drop_column("users", "cohort")
