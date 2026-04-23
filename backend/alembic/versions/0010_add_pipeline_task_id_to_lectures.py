"""Add pipeline_task_id to lectures table.

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-23

변경 내용:
- lectures.pipeline_task_id (VARCHAR(36), nullable):
    PPT 업로드 시 생성된 Celery 파이프라인 task_id.
    RAG Q&A 검색에서 슬라이드 임베딩을 찾는 키로 사용된다.
    NULL이면 파이프라인이 아직 실행되지 않은 강의.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lectures",
        sa.Column("pipeline_task_id", sa.String(36), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lectures", "pipeline_task_id")
