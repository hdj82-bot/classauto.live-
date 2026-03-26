"""create slide_embeddings table with pgvector IVFFlat index

Revision ID: 001
Revises: None
Create Date: 2026-03-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBEDDING_DIM = 1536


def upgrade() -> None:
    # pgvector 확장 활성화
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # 테이블 생성
    op.create_table(
        "slide_embeddings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.String(64), nullable=False, index=True),
        sa.Column("slide_number", sa.Integer, nullable=False),
        sa.Column("text_content", sa.Text, nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # IVFFlat 인덱스 생성 (코사인 유사도)
    op.execute(
        """
        CREATE INDEX ix_slide_embeddings_vector
        ON slide_embeddings
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_slide_embeddings_vector")
    op.drop_table("slide_embeddings")
    op.execute("DROP EXTENSION IF EXISTS vector")
