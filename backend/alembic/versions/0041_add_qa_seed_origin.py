"""Add qa_answer_cache.origin (교수자 사전 질문 vs 학생 적립 구분).

Revision ID: 0041
Revises: 0040
Create Date: 2026-06-08

변경 내용 (교수자 Q&A 사전 답변 기능):
- ``qa_answer_cache.origin`` (VARCHAR(20), NOT NULL, default 'student'):
    행의 출처를 구분한다.
    · 'student'         — 학생 미적중 질문이 야간 배치 클러스터 큐로 적립된 행(기존 동작).
    · 'instructor_seed' — 교수자가 영상 생성 전 직접 등록한 "예상 질문"(영상당 ≤3).
    교수자 사전 질문은 야간 클러스터링 대상에서 제외하고(이미 영상 생성 시 즉시
    렌더), 학생 질문은 종전대로 클러스터 큐에 쌓인다. 첫 영상처럼 축적 데이터가
    없을 때도 첫 학생 질문부터 아바타 답변이 나오게 하는 것이 목적이다.

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0041"
down_revision: Union[str, None] = "0040"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "qa_answer_cache",
        sa.Column(
            "origin",
            sa.String(length=20),
            nullable=False,
            server_default="student",
        ),
    )
    op.create_index(
        op.f("ix_qa_answer_cache_origin"), "qa_answer_cache", ["origin"], unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_qa_answer_cache_origin"), table_name="qa_answer_cache")
    op.drop_column("qa_answer_cache", "origin")
