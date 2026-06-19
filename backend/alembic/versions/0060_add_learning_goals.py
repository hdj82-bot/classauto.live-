"""Add learning_goals (학습 목표·달성률 — 스펙 11 §H-3 / 10번 G9).

Revision ID: 0060
Revises: 0059
Create Date: 2026-06-19

변경 내용:
- ``learning_goals`` — 강의별 학습 목표 1건(metric, label, target_value,
    baseline_value(생성 시점 스냅샷=before), created/updated). lecture_id FK→
    lectures CASCADE.

멱등: 테이블 존재 시 생성 건너뜀. 다운그레이드: 테이블 제거.
주의: 0059(cohort_daily_metrics) 다음 — 본 PR 은 #522(§C) 이후 머지.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0060"
down_revision: Union[str, None] = "0059"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def upgrade() -> None:
    if _has_table("learning_goals"):
        return
    op.create_table(
        "learning_goals",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("lecture_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("metric", sa.String(length=40), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("target_value", sa.Float(), nullable=False),
        sa.Column("baseline_value", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["lecture_id"], ["lectures.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_learning_goals_lecture_id"),
        "learning_goals",
        ["lecture_id"],
        unique=False,
    )


def downgrade() -> None:
    if not _has_table("learning_goals"):
        return
    op.drop_index(op.f("ix_learning_goals_lecture_id"), table_name="learning_goals")
    op.drop_table("learning_goals")
