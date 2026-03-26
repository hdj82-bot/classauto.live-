"""create script_translations table

Revision ID: 004
Revises: 003
Create Date: 2026-03-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "script_translations",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("script_id", sa.Integer, sa.ForeignKey("scripts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("language", sa.String(10), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # 스크립트당 언어별 유니크 제약
    op.create_unique_constraint(
        "uq_script_translations_script_lang",
        "script_translations",
        ["script_id", "language"],
    )

    op.create_index(
        "ix_script_translations_script_id",
        "script_translations",
        ["script_id"],
    )


def downgrade() -> None:
    op.drop_table("script_translations")
