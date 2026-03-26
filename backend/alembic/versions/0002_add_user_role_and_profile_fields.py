"""add user role and profile fields

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-26 00:01:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # userrole Enum 타입 생성
    op.execute("CREATE TYPE userrole AS ENUM ('professor', 'student')")

    # users 테이블에 컬럼 추가
    op.add_column("users", sa.Column(
        "role",
        sa.Enum("professor", "student", name="userrole"),
        nullable=False,
        server_default="student",
    ))
    op.add_column("users", sa.Column("school", sa.String(200), nullable=True))
    op.add_column("users", sa.Column("department", sa.String(200), nullable=True))
    op.add_column("users", sa.Column("student_number", sa.String(50), nullable=True))

    # server_default 제거 (기존 데이터 마이그레이션 후 DEFAULT 불필요)
    op.alter_column("users", "role", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "student_number")
    op.drop_column("users", "department")
    op.drop_column("users", "school")
    op.drop_column("users", "role")
    op.execute("DROP TYPE IF EXISTS userrole")
