"""Add admin role to UserRole enum.

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-21
"""
from alembic import op

# revision identifiers
revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL: ALTER TYPE에 새 값 추가
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'admin'")


def downgrade() -> None:
    # PostgreSQL은 enum 값 제거가 직접 불가 — 새 타입 생성 후 교체
    op.execute("""
        CREATE TYPE userrole_old AS ENUM ('professor', 'student');
        ALTER TABLE users ALTER COLUMN role TYPE userrole_old USING role::text::userrole_old;
        DROP TYPE userrole;
        ALTER TYPE userrole_old RENAME TO userrole;
    """)
