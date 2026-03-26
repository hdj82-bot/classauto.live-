"""add video_versions, session_logs, cost_logs tables + video columns

Revision ID: 005
Revises: 004
Create Date: 2026-03-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Video 테이블에 새 컬럼 추가
    op.add_column("videos", sa.Column("version", sa.Integer, server_default="1"))
    op.add_column("videos", sa.Column("s3_url", sa.Text, nullable=True))
    op.add_column("videos", sa.Column("heygen_job_id", sa.String(128), nullable=True))

    # VideoStatus enum에 RENDERING, READY 추가
    op.execute("ALTER TYPE videostatus ADD VALUE IF NOT EXISTS 'RENDERING'")
    op.execute("ALTER TYPE videostatus ADD VALUE IF NOT EXISTS 'READY'")

    # video_versions 테이블
    op.create_table(
        "video_versions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("video_id", sa.Integer, sa.ForeignKey("videos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("s3_url", sa.Text, nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("snapshot", sa.Text, server_default=""),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_video_versions_video_id", "video_versions", ["video_id"])

    # session_logs 테이블
    op.create_table(
        "session_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("video_id", sa.Integer, sa.ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("session_id", sa.String(64), nullable=False, index=True),
        sa.Column("user_id", sa.String(64), nullable=True),
        sa.Column("video_version", sa.Integer, server_default="1"),
        sa.Column("started_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("ended_at", sa.DateTime, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("archived", sa.Boolean, server_default="false"),
    )

    # cost_logs 테이블
    op.create_table(
        "cost_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("video_id", sa.Integer, sa.ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("service", sa.String(32), nullable=False),
        sa.Column("operation", sa.String(64), nullable=False),
        sa.Column("amount_usd", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("detail", sa.Text, server_default=""),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("cost_logs")
    op.drop_table("session_logs")
    op.drop_table("video_versions")
    op.drop_column("videos", "heygen_job_id")
    op.drop_column("videos", "s3_url")
    op.drop_column("videos", "version")
