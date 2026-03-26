"""create videos, slides, scripts tables

Revision ID: 002
Revises: 001
Create Date: 2026-03-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "videos",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.String(64), unique=True, nullable=False, index=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_path", sa.Text, nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "UPLOADING", "PARSING", "EMBEDDING", "GENERATING_SCRIPT",
                "PENDING_REVIEW", "APPROVED", "FAILED",
                name="videostatus",
            ),
            nullable=False,
            server_default="UPLOADING",
        ),
        sa.Column("total_slides", sa.Integer, default=0),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "slides",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("video_id", sa.Integer, sa.ForeignKey("videos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slide_number", sa.Integer, nullable=False),
        sa.Column("text_content", sa.Text, default=""),
        sa.Column("speaker_notes", sa.Text, default=""),
        sa.Column("image_paths", sa.Text, default=""),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "scripts",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("slide_id", sa.Integer, sa.ForeignKey("slides.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("is_approved", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # slide_embeddings에 slide_id FK 추가
    op.add_column(
        "slide_embeddings",
        sa.Column("slide_id", sa.Integer, sa.ForeignKey("slides.id", ondelete="CASCADE"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("slide_embeddings", "slide_id")
    op.drop_table("scripts")
    op.drop_table("slides")
    op.drop_table("videos")
    op.execute("DROP TYPE IF EXISTS videostatus")
