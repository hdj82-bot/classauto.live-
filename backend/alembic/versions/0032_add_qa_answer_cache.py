"""Add qa_answer_cache table (아바타 Q&A 클러스터 답변 캐시).

Revision ID: 0032
Revises: 0031
Create Date: 2026-06-04

변경 내용 (docs/planning/08-cost-optimization.md §5, 09-beta-program.md §5 — Phase 2):
- ``qa_answer_cache`` 테이블: 학생 질문 → 야간 배치 아바타 클립 캐시.
    실시간 HeyGen 렌더 금지. 질문은 항상 즉시 RAG 텍스트로 답하고, 겹치는 질문만
    사전 렌더된 클립을 유사도(0.9↑) 캐시에서 즉시 제공한다. 미적중 질문은
    status=pending 으로 적립 → 야간 배치가 임베딩 클러스터링 후 상위 클러스터만
    대표 질문으로 렌더(영상당 3렌더, 교수자당 월 6).
- ``question_embedding`` 은 pgvector ``vector(1536)`` — slide_embeddings 와 동일 패턴
    (create_table 로 표현 불가 → ALTER TABLE 로 네이티브 타입 추가).

다운그레이드: 테이블 drop.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "qa_answer_cache",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("lecture_id", sa.UUID(), nullable=False),
        sa.Column("instructor_id", sa.UUID(), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("answer_text", sa.Text(), nullable=True),
        sa.Column("cluster_key", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("heygen_job_id", sa.String(length=255), nullable=True),
        sa.Column("s3_video_url", sa.String(length=1024), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.ForeignKeyConstraint(["lecture_id"], ["lectures.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["instructor_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # pgvector 네이티브 컬럼은 create_table 로 표현 불가 → ALTER 로 추가 (0006 패턴).
    op.execute("ALTER TABLE qa_answer_cache ADD COLUMN question_embedding vector(1536);")

    op.create_index(
        op.f("ix_qa_answer_cache_lecture_id"), "qa_answer_cache", ["lecture_id"], unique=False,
    )
    op.create_index(
        op.f("ix_qa_answer_cache_instructor_id"), "qa_answer_cache", ["instructor_id"], unique=False,
    )
    op.create_index(
        op.f("ix_qa_answer_cache_cluster_key"), "qa_answer_cache", ["cluster_key"], unique=False,
    )
    op.create_index(
        op.f("ix_qa_answer_cache_status"), "qa_answer_cache", ["status"], unique=False,
    )
    op.create_index(
        op.f("ix_qa_answer_cache_heygen_job_id"), "qa_answer_cache", ["heygen_job_id"], unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_qa_answer_cache_heygen_job_id"), table_name="qa_answer_cache")
    op.drop_index(op.f("ix_qa_answer_cache_status"), table_name="qa_answer_cache")
    op.drop_index(op.f("ix_qa_answer_cache_cluster_key"), table_name="qa_answer_cache")
    op.drop_index(op.f("ix_qa_answer_cache_instructor_id"), table_name="qa_answer_cache")
    op.drop_index(op.f("ix_qa_answer_cache_lecture_id"), table_name="qa_answer_cache")
    op.drop_table("qa_answer_cache")
