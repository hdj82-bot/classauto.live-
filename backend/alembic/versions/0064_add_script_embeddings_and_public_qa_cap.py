"""Add script_segment_embeddings + public_qa_daily_counts (C3 익명 RAG 비용 증폭 차단).

Revision ID: 0064
Revises: 0063
Create Date: 2026-06-26

배경 (C3 — 익명 사용자의 RAG 비용 증폭 차단):
- ``script_segment_embeddings``: 생성된 강의 스크립트(교수자 발화) 세그먼트의 임베딩을
    파이프라인 step3 에서 **1회** 저장하는 테이블. 종전 retriever(search_similar_script)
    는 학생 질문마다 강의의 **전체 스크립트 세그먼트를 OpenAI 로 재임베딩**해(질문당 수십
    개) 익명 폭주 시 임베딩 비용이 증폭됐다. 이제 저장분을 pgvector 로 조회하고 질문
    임베딩만 매번 1회 만든다(저장분이 없는 구 강의는 on-the-fly 폴백). ``embedding`` 은
    pgvector ``vector(1536)`` — create_table 로 표현 불가해 ALTER 로 추가(0006·0036 패턴).
- ``public_qa_daily_counts``: 공개(/qa/public) 익명 Q&A 의 강의별·UTC 일자별 호출 카운터.
    전역 RateLimitMiddleware(IP 당 분당) 위에 두는 2차 방어선으로, 익명 다수가 각자 한도
    안에서 질문해도 강의 1개의 일일 Claude 호출 총량을 하드 캡으로 막는다.

다운그레이드: 두 테이블 모두 drop.
SQLite(테스트)는 conftest 의 Base.metadata.create_all 로 스키마를 만들고 pgvector 연산은
미지원이라, 본 마이그레이션 DDL 없이도 모델 정의만으로 테이블이 생성된다(조회는 폴백).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0064"
down_revision: Union[str, None] = "0063"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1) 스크립트 세그먼트 임베딩 저장 테이블 ──────────────────────────────────
    op.create_table(
        "script_segment_embeddings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("task_id", sa.String(length=64), nullable=False),
        sa.Column("slide_number", sa.Integer(), nullable=False),
        sa.Column("text_content", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    # pgvector 네이티브 컬럼은 create_table 로 표현 불가 → ALTER 로 추가 (0006·0036 패턴).
    op.execute(
        "ALTER TABLE script_segment_embeddings ADD COLUMN embedding vector(1536);"
    )
    op.create_index(
        op.f("ix_script_segment_embeddings_task_id"),
        "script_segment_embeddings", ["task_id"], unique=False,
    )

    # ── 2) 공개 Q&A 강의별 일일 카운터 테이블 ───────────────────────────────────
    op.create_table(
        "public_qa_daily_counts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("task_id", sa.String(length=64), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "day", name="uq_public_qa_daily_task_day"),
    )
    op.create_index(
        op.f("ix_public_qa_daily_counts_task_id"),
        "public_qa_daily_counts", ["task_id"], unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_public_qa_daily_counts_task_id"),
        table_name="public_qa_daily_counts",
    )
    op.drop_table("public_qa_daily_counts")
    op.drop_index(
        op.f("ix_script_segment_embeddings_task_id"),
        table_name="script_segment_embeddings",
    )
    op.drop_table("script_segment_embeddings")
