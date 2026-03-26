"""create initial tables

Revision ID: 0001
Revises:
Create Date: 2026-03-26 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # pgvector 확장 활성화
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # users 테이블
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        sa.Column("google_sub", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("google_sub"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # lectures 테이블
    op.create_table(
        "lectures",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("video_url", sa.String(1024), nullable=True),
        sa.Column("thumbnail_url", sa.String(1024), nullable=True),
        sa.Column("instructor_id", sa.UUID(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["instructor_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lectures_instructor_id", "lectures", ["instructor_id"])

    # learning_sessions 테이블
    op.create_table(
        "learning_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("lecture_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("in_progress", "completed", "paused", name="sessionstatus"),
            nullable=False,
            server_default="in_progress",
        ),
        sa.Column("progress_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["lecture_id"], ["lectures.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_learning_sessions_user_id", "learning_sessions", ["user_id"])
    op.create_index("ix_learning_sessions_lecture_id", "learning_sessions", ["lecture_id"])


def downgrade() -> None:
    op.drop_table("learning_sessions")
    op.execute("DROP TYPE IF EXISTS sessionstatus")
    op.drop_table("lectures")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS vector")
